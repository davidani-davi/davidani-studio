// Per-style Model Studio workspace (app/api/model-studio/workspace). Each save is a NEW Blob file,
// model-studio/<STYLE>/<version>.json, and a read takes the newest by upload time (lib/user-asset-records.ts):
// overwriting one public Blob file reads stale for 4-60 s, which would undo the last edit. Without a Blob
// token (local dev) the record is one file under .data/model-studio/.
import fs from "node:fs/promises";
import path from "node:path";
import { del, list, put } from "@vercel/blob";
import { latestRecordFiles, olderRecordFiles, recordVersion } from "@/lib/user-asset-records";

export const WORKSPACE_PREFIX = "model-studio/";
/** A workspace is setup and URLs only; anything bigger than this is a bug, not a style. */
export const MAX_WORKSPACE_BYTES = 256_000;

export interface WorkspaceRecord {
  style: string;
  /** Counts saves: a PUT names the revision it was built on and is refused (409) when that is not the newest. */
  revision: number;
  savedAt: string;
  studio: unknown;
}

export class WorkspaceConflict extends Error {
  constructor(public current: WorkspaceRecord | null) {
    super("conflict");
  }
}

const useBlob = () => Boolean(process.env.BLOB_READ_WRITE_TOKEN);
const localFile = (style: string) => path.join(process.cwd(), ".data", "model-studio", `${style}.json`);

async function listAll(prefix: string) {
  const blobs: Awaited<ReturnType<typeof list>>["blobs"] = [];
  let cursor: string | undefined;
  do {
    const page = await list({ prefix, cursor, limit: 1000 });
    blobs.push(...page.blobs);
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  return blobs;
}

export async function readWorkspace(style: string): Promise<WorkspaceRecord | null> {
  if (!useBlob()) {
    try {
      return JSON.parse(await fs.readFile(localFile(style), "utf8")) as WorkspaceRecord;
    } catch {
      return null;
    }
  }
  const files = await listAll(`${WORKSPACE_PREFIX}${style}/`);
  const newest = latestRecordFiles(WORKSPACE_PREFIX, files).get(style);
  if (!newest) return null;
  // A file is written once and never replaced, so its CDN copy cannot be stale.
  const res = await fetch(newest.url, { cache: "no-store" });
  if (!res.ok) throw Error(`Workspace read failed (${res.status}).`);
  return (await res.json()) as WorkspaceRecord;
}

/** Save `studio` on top of `revision`; throws WorkspaceConflict when someone saved since. */
export async function writeWorkspace(style: string, revision: number, studio: unknown, now = new Date()): Promise<WorkspaceRecord> {
  const current = await readWorkspace(style);
  if ((current?.revision ?? 0) !== revision) throw new WorkspaceConflict(current);
  const record: WorkspaceRecord = { style, revision: revision + 1, savedAt: now.toISOString(), studio };
  const body = JSON.stringify(record);
  if (!useBlob()) {
    await fs.mkdir(path.dirname(localFile(style)), { recursive: true });
    await fs.writeFile(localFile(style), body);
    return record;
  }
  const pathname = `${WORKSPACE_PREFIX}${style}/${recordVersion(now.getTime())}.json`;
  await put(pathname, body, { access: "public", contentType: "application/json", addRandomSuffix: false, allowOverwrite: false });
  // Tidy older versions; a newer save by someone else is kept. Failing here only leaves extra files.
  try {
    const files = await listAll(`${WORKSPACE_PREFIX}${style}/`);
    const mine = files.find((f) => f.pathname === pathname);
    const older = mine ? olderRecordFiles(files, mine) : [];
    if (older.length) await del(older.map((f) => f.url));
  } catch (err) {
    console.warn(`[model-studio] old workspace files kept for ${style}:`, err);
  }
  return record;
}
