import fs from "node:fs/promises";
import path from "node:path";
import { list, put } from "@vercel/blob";

/**
 * Saved model shots, per style (David, 2026-09-08: "create a 'saved' images
 * per style/listing and save those to their corresponding style model studio
 * panels"). A render lives in the extension's panel only while the panel is
 * open; a shot David wants to keep for DT78080 goes here, and the panel shows
 * it again the next time it opens for DT78080 — from any browser, and from a
 * shell run that never touched the panel.
 *
 * The image itself is copied into Blob storage (fal's result URLs are not
 * forever); the index is one JSON file, the cloud-history pattern.
 */

export interface SavedShot {
  id: string;
  view: string;            // front · side · back · full
  url: string;             // the durable copy (or the source URL when the copy failed)
  source?: string;         // where it came from (the render URL) — lets a panel mark its own render as saved
  savedAt: number;
  durable: boolean;
  humanModelId?: string;   // plate the render used ("crop 93")
  engine?: string;         // "gpt-image-25", "tryon", …
  note?: string;           // free text ("shell run 2026-09-08", "back split mirrored")
  by?: string;             // "panel" | "shell" | …
}

export interface SavedStyle {
  style: string;
  shots: SavedShot[];
  updatedAt: number;
}

interface SavedIndex {
  styles: Record<string, SavedStyle>;
}

export interface SaveInput {
  view: string;
  url: string;
  humanModelId?: string;
  engine?: string;
  note?: string;
  by?: string;
}

const STORE_KEY = "saved-shots/index.json";
const IMAGE_PREFIX = "saved-shots/";
const LOCAL_STORE = process.env.VERCEL
  ? path.join("/tmp", "saved-shots.json")
  : path.join(process.cwd(), ".data", "saved-shots.json");
export const MAX_PER_STYLE = 48;
const VIEWS = new Set(["front", "side", "back", "full"]);

function canUseBlob(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

/** Style codes are upper-case ERP ids; anything else is refused. */
export function normalizeStyle(value: unknown): string {
  const s = String(value ?? "").trim().toUpperCase();
  return /^[A-Z0-9][A-Z0-9._-]{1,31}$/.test(s) ? s : "";
}

export function normalizeView(value: unknown): string {
  const v = String(value ?? "").trim().toLowerCase();
  return VIEWS.has(v) ? v : "";
}

function shotId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeIndex(value: unknown): SavedIndex {
  const styles = (value as Partial<SavedIndex> | undefined)?.styles;
  const out: SavedIndex = { styles: {} };
  if (styles && typeof styles === "object") {
    for (const [key, entry] of Object.entries(styles as Record<string, SavedStyle>)) {
      const style = normalizeStyle(key);
      if (!style || !entry || !Array.isArray(entry.shots)) continue;
      out.styles[style] = {
        style,
        shots: entry.shots.filter((s) => s && s.id && s.url && normalizeView(s.view)),
        updatedAt: Number(entry.updatedAt) || 0,
      };
    }
  }
  return out;
}

async function readLocalIndex(): Promise<SavedIndex> {
  try {
    return normalizeIndex(JSON.parse(await fs.readFile(LOCAL_STORE, "utf8")));
  } catch {
    return { styles: {} };
  }
}

async function writeLocalIndex(index: SavedIndex): Promise<void> {
  await fs.mkdir(path.dirname(LOCAL_STORE), { recursive: true });
  await fs.writeFile(LOCAL_STORE, JSON.stringify(index, null, 2));
}

async function readIndex(): Promise<SavedIndex> {
  if (!canUseBlob()) return readLocalIndex();
  try {
    const found = await list({ prefix: STORE_KEY, limit: 1 });
    const blob = found.blobs.find((item) => item.pathname === STORE_KEY) ?? found.blobs[0];
    if (!blob) return { styles: {} };
    // The Blob CDN caches the public URL by its exact string: a read right
    // after a write got the previous index back (a shot deleted a second
    // earlier still "existed", a save could be folded over a stale list).
    // A fresh query string is a fresh cache key, and the origin holds the
    // latest write.
    const res = await fetch(`${blob.url}?t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) return { styles: {} };
    return normalizeIndex(await res.json());
  } catch (err) {
    console.warn("[saved-shots] blob read failed, using local fallback:", err);
    return readLocalIndex();
  }
}

async function writeIndex(index: SavedIndex): Promise<void> {
  if (!canUseBlob()) {
    await writeLocalIndex(index);
    return;
  }
  await put(STORE_KEY, JSON.stringify(index, null, 2), {
    access: "public",
    contentType: "application/json",
    allowOverwrite: true,
    cacheControlMaxAge: 0,
  });
}

/**
 * Pure: fold new shots into a style's list. Newest first; a shot whose source
 * URL is already saved is not saved twice (the panel's Save button pressed
 * again, a shell run re-sent) — the existing entry wins. Keeps MAX_PER_STYLE.
 */
export function mergeShots(existing: SavedShot[], incoming: SavedShot[]): { shots: SavedShot[]; added: SavedShot[] } {
  const known = new Set(existing.flatMap((s) => [s.url, s.source].filter(Boolean) as string[]));
  const added: SavedShot[] = [];
  for (const shot of incoming) {
    const key = shot.source || shot.url;
    if (known.has(key)) continue;
    known.add(key);
    if (shot.source) known.add(shot.source);
    added.push(shot);
  }
  const shots = [...added, ...existing].sort((a, b) => b.savedAt - a.savedAt).slice(0, MAX_PER_STYLE);
  return { shots, added };
}

/** The newest saved shot for each view, in view order — what "Load set" puts in the panel. */
export function latestPerView(shots: SavedShot[]): SavedShot[] {
  const seen = new Map<string, SavedShot>();
  for (const s of [...shots].sort((a, b) => b.savedAt - a.savedAt)) if (!seen.has(s.view)) seen.set(s.view, s);
  return ["front", "side", "back", "full"].map((v) => seen.get(v)).filter(Boolean) as SavedShot[];
}

/**
 * The image type from the bytes themselves — fal serves its results as
 * application/octet-stream, and a copy stored under that type came back
 * with `nosniff`, so the Blob copy must carry a real image type.
 */
export function imageType(bytes: Uint8Array, hint = "", url = ""): { contentType: string; ext: string } {
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return { contentType: "image/jpeg", ext: "jpg" };
  if (bytes.length > 7 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return { contentType: "image/png", ext: "png" };
  if (bytes.length > 11 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return { contentType: "image/webp", ext: "webp" };
  const fromHint = hint.match(/image\/(png|webp|jpe?g)/i)?.[1] || url.match(/\.(png|webp|jpe?g)(?:$|\?)/i)?.[1] || "jpeg";
  const ext = fromHint.toLowerCase().replace("jpeg", "jpg");
  return { contentType: `image/${ext === "jpg" ? "jpeg" : ext}`, ext };
}

/** Copy the image into Blob storage so the saved shot outlives its source URL. */
async function copyImage(style: string, id: string, url: string): Promise<{ url: string; durable: boolean }> {
  if (!canUseBlob()) return { url, durable: false };
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`source HTTP ${res.status}`);
    const bytes = Buffer.from(await res.arrayBuffer());
    if (!bytes.length) throw new Error("empty image");
    const { contentType, ext } = imageType(bytes, res.headers.get("content-type") || "", url);
    const blob = await put(`${IMAGE_PREFIX}${style}/${id}.${ext}`, bytes, {
      access: "public",
      contentType,
      addRandomSuffix: false,
      allowOverwrite: true,
    });
    return { url: blob.url, durable: true };
  } catch (err) {
    console.warn(`[saved-shots] copy failed for ${style} ${id}, keeping the source URL:`, err);
    return { url, durable: false };
  }
}

export async function readSavedStyle(style: string): Promise<SavedStyle> {
  const index = await readIndex();
  return index.styles[style] ?? { style, shots: [], updatedAt: 0 };
}

export async function listSavedStyles(): Promise<{ style: string; count: number; updatedAt: number }[]> {
  const index = await readIndex();
  return Object.values(index.styles)
    .filter((s) => s.shots.length)
    .map((s) => ({ style: s.style, count: s.shots.length, updatedAt: s.updatedAt }))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function saveShots(style: string, inputs: SaveInput[]): Promise<{ entry: SavedStyle; added: SavedShot[] }> {
  const index = await readIndex();
  const current = index.styles[style] ?? { style, shots: [], updatedAt: 0 };
  // Skip the copy for anything already saved (by source URL) — the merge would drop it anyway.
  const known = new Set(current.shots.flatMap((s) => [s.url, s.source].filter(Boolean) as string[]));
  const fresh = inputs.filter((i) => !known.has(i.url));
  const now = Date.now();
  const incoming: SavedShot[] = await Promise.all(
    fresh.map(async (i, n) => {
      const id = shotId();
      const copy = await copyImage(style, id, i.url);
      return {
        id, view: i.view, url: copy.url, source: i.url, savedAt: now + n, durable: copy.durable,
        ...(i.humanModelId ? { humanModelId: i.humanModelId } : {}),
        ...(i.engine ? { engine: i.engine } : {}),
        ...(i.note ? { note: i.note.slice(0, 300) } : {}),
        ...(i.by ? { by: i.by } : {}),
      };
    })
  );
  const merged = mergeShots(current.shots, incoming);
  const entry: SavedStyle = { style, shots: merged.shots, updatedAt: now };
  index.styles[style] = entry;
  await writeIndex(index);
  return { entry, added: merged.added };
}

export async function dropShot(style: string, id: string): Promise<SavedStyle> {
  const index = await readIndex();
  const current = index.styles[style] ?? { style, shots: [], updatedAt: 0 };
  const entry: SavedStyle = { style, shots: current.shots.filter((s) => s.id !== id), updatedAt: Date.now() };
  if (entry.shots.length) index.styles[style] = entry;
  else delete index.styles[style];
  await writeIndex(index);
  return entry;
}
