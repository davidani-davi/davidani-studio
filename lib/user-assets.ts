// Team-shared user-uploaded assets: Image Studio reference presets and
// Model Studio user-added models. JSON indexes + image bytes live in
// Vercel Blob; when no BLOB_READ_WRITE_TOKEN is set (local dev) both fall
// back to .data/ on disk. Mirrors the lib/style-library.ts pattern.

import fs from "node:fs/promises";
import path from "node:path";
import { del, list, put } from "@vercel/blob";

export interface UserReference {
  id: string;
  label: string;
  imageUrl: string;
  createdAt: string;
}

export interface UserModel {
  id: string;
  name: string;
  createdAt: string;
  views: { front: string; side?: string; back?: string; full?: string };
}

interface ReferenceIndex {
  references: UserReference[];
}
interface ModelIndex {
  models: UserModel[];
}

const REF_INDEX_KEY = "user-references/index.json";
const MODEL_INDEX_KEY = "user-models/index.json";
const LOCAL_REF_STORE = path.join(process.cwd(), ".data", "user-references.json");
const LOCAL_MODEL_STORE = path.join(process.cwd(), ".data", "user-models.json");
const LOCAL_FILES_DIR = path.join(process.cwd(), "public", "user-assets");

function canUseBlob(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

function nowIso(): string {
  return new Date().toISOString();
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function makeAssetId(name: string): string {
  return `${slug(name) || "asset"}-${Date.now().toString(36)}`;
}

function fileExt(file: File): string {
  const fromName = (file.name.split(".").pop() || "").toLowerCase();
  if (["png", "jpg", "jpeg", "webp"].includes(fromName)) return fromName;
  if (file.type === "image/jpeg") return "jpg";
  if (file.type === "image/webp") return "webp";
  return "png";
}

// ---------- generic JSON index helpers ----------

async function readLocalJson<T>(store: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await fs.readFile(store, "utf8")) as T;
  } catch {
    return fallback;
  }
}

async function writeLocalJson<T>(store: string, value: T): Promise<void> {
  await fs.mkdir(path.dirname(store), { recursive: true });
  await fs.writeFile(store, JSON.stringify(value, null, 2));
}

// Blob public URLs are served through Vercel's CDN with a long max-age, and
// overwrite invalidation is not reliable across regions — a serverless
// function's regional edge can keep serving a stale index for hours. A
// unique query param changes the CDN cache key, forcing an origin read.
// Required for correctness: mutations union-merge against this read, so a
// stale index here can drop or resurrect entries.
function cacheBusted(url: string): string {
  return `${url}${url.includes("?") ? "&" : "?"}nocache=${Date.now().toString(36)}`;
}

// Lenient read: used by the two list*() functions, which are GETs that
// should degrade gracefully (e.g. show an empty list) rather than fail the
// page. NEVER use this as the basis for a mutation — a transient read error
// here silently returns `fallback`, and a mutation that writes that back
// would wipe the real index.
async function readBlobJson<T>(key: string, localStore: string, fallback: T): Promise<T> {
  if (!canUseBlob()) return readLocalJson(localStore, fallback);
  try {
    const found = await list({ prefix: key, limit: 1 });
    const blob = found.blobs.find((item) => item.pathname === key) ?? found.blobs[0];
    if (!blob) return fallback;
    const res = await fetch(cacheBusted(blob.url), { cache: "no-store" });
    if (!res.ok) return fallback;
    return (await res.json()) as T;
  } catch (err) {
    console.warn(`[user-assets] blob read failed for ${key}:`, err);
    return readLocalJson(localStore, fallback);
  }
}

// Strict read: used by every mutation (save/delete). It distinguishes
// "the index legitimately doesn't exist yet" (list() succeeds, no matching
// blob found → return `fallback`, this is a fresh store) from "the read
// itself failed" (list()/fetch threw, or the response wasn't ok → throw).
// Swallowing the latter and returning `fallback` would make a
// read-modify-write mutation write an EMPTY index over the real one.
// With no BLOB token (local dev), this is equivalent to the lenient local
// read — there's no shared store to clobber.
async function readBlobJsonStrict<T>(key: string, localStore: string, fallback: T): Promise<T> {
  if (!canUseBlob()) return readLocalJson(localStore, fallback);

  let found: Awaited<ReturnType<typeof list>>;
  try {
    found = await list({ prefix: key, limit: 1 });
  } catch (err) {
    throw new Error(
      `[user-assets] Could not read the shared index (${key}) — save/delete aborted to avoid clobbering it: ${err}`
    );
  }

  const blob = found.blobs.find((item) => item.pathname === key) ?? found.blobs[0];
  if (!blob) return fallback; // index legitimately absent — fresh store

  let res: Response;
  try {
    res = await fetch(cacheBusted(blob.url), { cache: "no-store" });
  } catch (err) {
    throw new Error(
      `[user-assets] Could not read the shared index (${key}) — save/delete aborted to avoid clobbering it: ${err}`
    );
  }
  if (!res.ok) {
    throw new Error(
      `[user-assets] Could not read the shared index (${key}, status ${res.status}) — save/delete aborted to avoid clobbering it`
    );
  }

  try {
    return (await res.json()) as T;
  } catch (err) {
    throw new Error(
      `[user-assets] Shared index (${key}) returned invalid JSON — save/delete aborted to avoid clobbering it: ${err}`
    );
  }
}

async function writeBlobJson<T>(key: string, localStore: string, value: T): Promise<void> {
  if (!canUseBlob()) {
    await writeLocalJson(localStore, value);
    return;
  }
  // No local-disk fallback here: serverless disk is ephemeral and evaporates
  // on cold start, so a "successful" fallback write would just look
  // successful while silently losing the data. Let the caller see the error.
  await put(key, JSON.stringify(value, null, 2), {
    access: "public",
    contentType: "application/json",
    allowOverwrite: true,
    // Keep CDN staleness for anyone fetching the raw URL bounded to a
    // minute; our own reads bypass the cache entirely via cacheBusted().
    cacheControlMaxAge: 60,
  });
}

// ---------- image byte storage ----------

/**
 * Store image bytes and return a stable public URL. In production this is a
 * Vercel Blob URL; in dev the file is written under public/user-assets/ and
 * served by Next at /user-assets/... (relative URL — the client resolves it
 * against the origin, same as the hardcoded /product-shots/ presets).
 */
async function storeImage(key: string, file: File): Promise<string> {
  if (canUseBlob()) {
    const blob = await put(key, file, { access: "public", allowOverwrite: true });
    return blob.url;
  }
  const target = path.join(LOCAL_FILES_DIR, key);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, Buffer.from(await file.arrayBuffer()));
  return `/user-assets/${key}`;
}

async function removeImage(url: string): Promise<void> {
  try {
    if (canUseBlob() && url.startsWith("https://")) {
      await del(url);
    } else if (url.startsWith("/user-assets/")) {
      await fs.rm(path.join(process.cwd(), "public", url.slice(1)), { force: true });
    }
  } catch (err) {
    console.warn("[user-assets] image delete failed (index already updated):", err);
  }
}

// ---------- references ----------

export async function listUserReferences(): Promise<UserReference[]> {
  const index = await readBlobJson<ReferenceIndex>(REF_INDEX_KEY, LOCAL_REF_STORE, {
    references: [],
  });
  return Array.isArray(index.references) ? index.references : [];
}

export async function saveUserReference(file: File, label: string): Promise<UserReference> {
  const id = makeAssetId(label);
  const imageUrl = await storeImage(`user-references/${id}.${fileExt(file)}`, file);
  const entry: UserReference = { id, label: label.trim(), imageUrl, createdAt: nowIso() };
  // Union merge: re-read the index (strict — throws rather than silently
  // treating a read error as empty) right before writing, then merge the new
  // entry into it by id (new entry wins on collision, everything else
  // survives). This is not a full fix for the lost-update race: the re-read
  // itself can still be served a stale snapshot within the blob CDN's ~5s
  // staleness window, so two saves landing inside that window can still
  // race each other. It does guarantee this save never reverts the index to
  // an older snapshot than the one it started from.
  const index = await readBlobJsonStrict<ReferenceIndex>(REF_INDEX_KEY, LOCAL_REF_STORE, {
    references: [],
  });
  const existing = Array.isArray(index.references) ? index.references : [];
  const merged = new Map(existing.map((r) => [r.id, r] as const));
  merged.set(entry.id, entry);
  await writeBlobJson(REF_INDEX_KEY, LOCAL_REF_STORE, { references: Array.from(merged.values()) });
  return entry;
}

export async function deleteUserReference(id: string): Promise<void> {
  const index = await readBlobJsonStrict<ReferenceIndex>(REF_INDEX_KEY, LOCAL_REF_STORE, {
    references: [],
  });
  const references = Array.isArray(index.references) ? index.references : [];
  const target = references.find((r) => r.id === id);
  await writeBlobJson(REF_INDEX_KEY, LOCAL_REF_STORE, {
    references: references.filter((r) => r.id !== id),
  });
  if (target) await removeImage(target.imageUrl);
}

// ---------- models ----------

const MODEL_VIEWS = ["front", "side", "back", "full"] as const;
export type UserModelView = (typeof MODEL_VIEWS)[number];

export async function listUserModels(): Promise<UserModel[]> {
  const index = await readBlobJson<ModelIndex>(MODEL_INDEX_KEY, LOCAL_MODEL_STORE, {
    models: [],
  });
  return Array.isArray(index.models) ? index.models : [];
}

export async function saveUserModel(
  name: string,
  files: { front: File; side?: File; back?: File; full?: File }
): Promise<UserModel> {
  const id = makeAssetId(name);
  const views: UserModel["views"] = { front: "" };
  try {
    for (const view of MODEL_VIEWS) {
      const file = files[view];
      if (!file) continue;
      views[view] = await storeImage(`user-models/${id}/${view}.${fileExt(file)}`, file);
    }
  } catch (err) {
    for (const url of Object.values(views)) {
      if (url) await removeImage(url);
    }
    throw err;
  }
  const entry: UserModel = { id, name: name.trim(), createdAt: nowIso(), views };
  // Union merge — see the comment in saveUserReference for the rationale and
  // the residual race window this does (and doesn't) close.
  const index = await readBlobJsonStrict<ModelIndex>(MODEL_INDEX_KEY, LOCAL_MODEL_STORE, {
    models: [],
  });
  const existing = Array.isArray(index.models) ? index.models : [];
  const merged = new Map(existing.map((m) => [m.id, m] as const));
  merged.set(entry.id, entry);
  await writeBlobJson(MODEL_INDEX_KEY, LOCAL_MODEL_STORE, { models: Array.from(merged.values()) });
  return entry;
}

export async function deleteUserModel(id: string): Promise<void> {
  const index = await readBlobJsonStrict<ModelIndex>(MODEL_INDEX_KEY, LOCAL_MODEL_STORE, {
    models: [],
  });
  const models = Array.isArray(index.models) ? index.models : [];
  const target = models.find((m) => m.id === id);
  await writeBlobJson(MODEL_INDEX_KEY, LOCAL_MODEL_STORE, {
    models: models.filter((m) => m.id !== id),
  });
  if (target) {
    for (const url of Object.values(target.views)) {
      if (url) await removeImage(url);
    }
  }
}

/**
 * If modelId is a user-added model, return the stored URL for the requested
 * view (falling back to front). Returns null for built-in models so callers
 * can fall through to the filesystem registry.
 */
export async function findUserModelViewUrl(
  modelId: string,
  view: UserModelView
): Promise<string | null> {
  const models = await listUserModels();
  const model = models.find((m) => m.id === modelId);
  if (!model) return null;
  return model.views[view] || model.views.front || null;
}
