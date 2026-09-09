// Async task store for /api/model-shots (the cad-tasks pattern).
//
// A 4K GPT Image 2 view holds 110-130 s and fal's "downstream service error"
// is retried, so a front with one retry sits at 250-295 s and one with two is
// past 300 s — where the held connection is cut ("Remote end closed connection
// without response", DJ60404 2026-09-08) and the paid render is lost. With
// `async: true` the route answers with a task id at once, renders inside
// next/server's after() (up to maxDuration), and the caller polls GET ?taskId=.
//
// One blob JSON per task (no shared index -> no read-modify-write races).
// Local-file fallback keeps `next dev` and the tests working without a blob
// token; on Vercel the blob store is required since /tmp is per-instance and a
// poll may land on a different instance than the writer.

import fs from "node:fs/promises";
import path from "node:path";
import { list, put } from "@vercel/blob";

export type ShotTaskStatus = "running" | "done" | "failed";

export interface ShotTask {
  id: string;
  status: ShotTaskStatus;
  view: string;
  createdAt: number;
  updatedAt: number;
  /** the exact JSON the synchronous POST would have answered with */
  result?: Record<string, unknown>;
  requestFingerprint?: string;
}

const BLOB_PREFIX = "shot-tasks/";
const LOCAL_DIR = process.env.VERCEL
  ? path.join("/tmp", "shot-tasks")
  : path.join(process.cwd(), ".data", "shot-tasks");

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
// reliable across regions; a unique query param per read forces an origin
// fetch, or a poll could see "running" forever from a stale edge.
function cacheBusted(url: string): string {
  return `${url}${url.includes("?") ? "&" : "?"}nocache=${Date.now().toString(36)}`;
}

export function isSafeTaskId(id: string): boolean {
  return /^[a-zA-Z0-9-]{8,64}$/.test(id);
}

export async function writeShotTask(task: ShotTask): Promise<void> {
  const payload = JSON.stringify({ ...task, updatedAt: Date.now() });
  if (!canUseBlob()) {
    await fs.mkdir(LOCAL_DIR, { recursive: true });
    await fs.writeFile(localPath(task.id), payload);
    return;
  }
  await put(blobKey(task.id), payload, {
    access: "public",
    addRandomSuffix: false,
    contentType: "application/json",
    allowOverwrite: true,
    cacheControlMaxAge: 60,
  });
}

/** Reserve a client request exactly once before scheduling a paid render. */
export async function createShotTask(task: ShotTask): Promise<boolean> {
  if (!isSafeTaskId(task.id)) throw new Error("Invalid task ID");
  const payload = JSON.stringify(task);
  if (!canUseBlob()) {
    if (process.env.VERCEL) throw new Error("Persistent shot storage is required");
    await fs.mkdir(LOCAL_DIR, { recursive: true });
    try { await fs.writeFile(localPath(task.id), payload, { flag: "wx" }); return true; }
    catch (error: any) { if (error?.code === "EEXIST") return false; throw error; }
  }
  try {
    await put(blobKey(task.id), payload, { access: "public", addRandomSuffix: false,
      allowOverwrite: false, contentType: "application/json", cacheControlMaxAge: 60 });
    return true;
  } catch (error: any) {
    if (error?.name === "BlobPreconditionFailedError" || /already exists/i.test(String(error?.message || ""))) return false;
    throw error;
  }
}

export async function readShotTask(id: string): Promise<ShotTask | null> {
  if (!isSafeTaskId(id)) return null;
  if (!canUseBlob()) {
    try {
      return JSON.parse(await fs.readFile(localPath(id), "utf8")) as ShotTask;
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
  return (await res.json()) as ShotTask;
}
