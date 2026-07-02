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

async function readBlobJson<T>(key: string, localStore: string, fallback: T): Promise<T> {
  if (!canUseBlob()) return readLocalJson(localStore, fallback);
  try {
    const found = await list({ prefix: key, limit: 1 });
    const blob = found.blobs.find((item) => item.pathname === key) ?? found.blobs[0];
    if (!blob) return fallback;
    const res = await fetch(blob.url, { cache: "no-store" });
    if (!res.ok) return fallback;
    return (await res.json()) as T;
  } catch (err) {
    console.warn(`[user-assets] blob read failed for ${key}:`, err);
    return readLocalJson(localStore, fallback);
  }
}

async function writeBlobJson<T>(key: string, localStore: string, value: T): Promise<void> {
  if (!canUseBlob()) {
    await writeLocalJson(localStore, value);
    return;
  }
  await put(key, JSON.stringify(value, null, 2), {
    access: "public",
    contentType: "application/json",
    allowOverwrite: true,
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
  const references = [...(await listUserReferences()), entry];
  await writeBlobJson(REF_INDEX_KEY, LOCAL_REF_STORE, { references });
  return entry;
}

export async function deleteUserReference(id: string): Promise<void> {
  const references = await listUserReferences();
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
  for (const view of MODEL_VIEWS) {
    const file = files[view];
    if (!file) continue;
    views[view] = await storeImage(`user-models/${id}/${view}.${fileExt(file)}`, file);
  }
  const entry: UserModel = { id, name: name.trim(), createdAt: nowIso(), views };
  const models = [...(await listUserModels()), entry];
  await writeBlobJson(MODEL_INDEX_KEY, LOCAL_MODEL_STORE, { models });
  return entry;
}

export async function deleteUserModel(id: string): Promise<void> {
  const models = await listUserModels();
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
