// Write-once cache for vision-analysis results (garment fields, pose
// analysis, Image Studio prompts). Vision inputs are immutable — fal/blob
// image URLs never change content, and the system prompts that shape the
// output only change via a deploy — so entries are keyed by a hash of the
// inputs salted with the deployment id and never overwritten. That makes
// the cache immune to the CDN-staleness problems that plague overwritten
// blobs (see lib/user-assets.ts): a key is either absent or final.
//
// Layers: per-instance memory Map (free), then Vercel Blob (shared across
// instances/team). In dev without a blob token, memory only. Failures are
// never fatal — a broken cache degrades to calling the analyzer.

import crypto from "node:crypto";
import { list, put } from "@vercel/blob";

const memory = new Map<string, unknown>();
const MEMORY_MAX_ENTRIES = 500;

function canUseBlob(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

// Salt keys per deployment: prompt-rule edits ship as deploys, so a new
// deploy naturally invalidates every cached analysis produced by old rules.
function deploySalt(): string {
  return process.env.VERCEL_URL || "dev";
}

function cacheKey(kind: string, keyParts: unknown): string {
  const hash = crypto
    .createHash("sha256")
    .update(JSON.stringify([deploySalt(), kind, keyParts]))
    .digest("hex")
    .slice(0, 40);
  return `vision-cache/${kind}/${hash}.json`;
}

async function readCacheBlob(key: string): Promise<unknown | undefined> {
  if (!canUseBlob()) return undefined;
  try {
    const found = await list({ prefix: key, limit: 1 });
    const blob = found.blobs.find((item) => item.pathname === key);
    if (!blob) return undefined;
    // Entries are write-once so a plain CDN-cached read is always correct.
    const res = await fetch(blob.url);
    if (!res.ok) return undefined;
    return await res.json();
  } catch (err) {
    console.warn(`[vision-cache] read failed for ${key}:`, err);
    return undefined;
  }
}

function writeCacheBlob(key: string, value: unknown): void {
  if (!canUseBlob()) return;
  // Fire-and-forget: caching must never delay or fail the response.
  void put(key, JSON.stringify(value), {
    access: "public",
    contentType: "application/json",
    addRandomSuffix: false,
  }).catch((err) => console.warn(`[vision-cache] write failed for ${key}:`, err));
}

function rememberInMemory(key: string, value: unknown): void {
  if (memory.size >= MEMORY_MAX_ENTRIES) {
    const oldest = memory.keys().next().value;
    if (oldest !== undefined) memory.delete(oldest);
  }
  memory.set(key, value);
}

/**
 * Return the cached result for (kind, keyParts) or run `fn` and cache what
 * it returns. Rejections are propagated and never cached. `keyParts` must
 * contain every input that can change the analysis output (image URLs,
 * option flags) — the deployment salt covers prompt-rule changes.
 */
export async function cachedVision<T>(
  kind: string,
  keyParts: unknown,
  fn: () => Promise<T>
): Promise<T> {
  const key = cacheKey(kind, keyParts);
  if (memory.has(key)) {
    return memory.get(key) as T;
  }
  const fromBlob = await readCacheBlob(key);
  if (fromBlob !== undefined) {
    rememberInMemory(key, fromBlob);
    return fromBlob as T;
  }
  const result = await fn();
  rememberInMemory(key, result);
  writeCacheBlob(key, result);
  return result;
}
