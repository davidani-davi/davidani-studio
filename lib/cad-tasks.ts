// Async task store for CAD extraction/cleanup runs.
//
// GPT Image 2 extractions hold 5-8 minutes at 2K; a browser fetch that waits
// on the response gets killed by Chrome/network intermediaries at ~4-5 min
// ("Failed to fetch") while the Vercel function finishes and the paid result
// is lost. The cad-extract/cad-cleanup routes therefore return a task id
// immediately, run the generation via next/server's after(), and persist the
// outcome here for the client to poll.
//
// One blob JSON per task (no shared index -> no read-modify-write races).
// Local-file fallback keeps `next dev` working without a blob token; on
// Vercel the blob store is required since /tmp is per-instance and a poll
// may land on a different instance than the writer.

import fs from "node:fs/promises";
import path from "node:path";
import { list, put } from "@vercel/blob";

export type CadTaskStatus = "running" | "done" | "failed";

export interface CadTaskImage {
  url: string;
  width?: number;
  height?: number;
  content_type?: string;
}

export interface CadTask {
  id: string;
  kind: "extract" | "cleanup";
  status: CadTaskStatus;
  createdAt: number;
  updatedAt: number;
  images?: CadTaskImage[];
  error?: string;
}

const BLOB_PREFIX = "cad-tasks/";
const LOCAL_DIR = process.env.VERCEL
  ? path.join("/tmp", "cad-tasks")
  : path.join(process.cwd(), ".data", "cad-tasks");

function canUseBlob(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

function blobKey(id: string): string {
  return `${BLOB_PREFIX}${id}.json`;
}

function localPath(id: string): string {
  return path.join(LOCAL_DIR, `${id}.json`);
}

// Blob public URLs sit behind Vercel's CDN and overwrite invalidation is not
// reliable across regions (see lib/user-assets.ts). A unique query param per
// read forces an origin fetch — required here, or a poll could see "running"
// forever from a stale edge.
function cacheBusted(url: string): string {
  return `${url}${url.includes("?") ? "&" : "?"}nocache=${Date.now().toString(36)}`;
}

function isSafeTaskId(id: string): boolean {
  return /^[a-zA-Z0-9-]{8,64}$/.test(id);
}

export async function writeCadTask(task: CadTask): Promise<void> {
  const payload = JSON.stringify({ ...task, updatedAt: Date.now() });

  if (!canUseBlob()) {
    await fs.mkdir(LOCAL_DIR, { recursive: true });
    await fs.writeFile(localPath(task.id), payload);
    return;
  }

  await put(blobKey(task.id), payload, {
    access: "public",
    contentType: "application/json",
    allowOverwrite: true,
    cacheControlMaxAge: 60,
  });
}

export async function readCadTask(id: string): Promise<CadTask | null> {
  if (!isSafeTaskId(id)) return null;

  if (!canUseBlob()) {
    try {
      const raw = await fs.readFile(localPath(id), "utf8");
      return JSON.parse(raw) as CadTask;
    } catch {
      return null;
    }
  }

  const key = blobKey(id);
  const found = await list({ prefix: key, limit: 1 });
  const blob = found.blobs.find((item) => item.pathname === key);
  if (!blob) return null;
  const res = await fetch(cacheBusted(blob.url), { cache: "no-store" });
  if (!res.ok) return null;
  return (await res.json()) as CadTask;
}
