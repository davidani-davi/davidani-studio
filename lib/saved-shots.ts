import fs from "node:fs/promises";
import path from "node:path";
import { del, list, put } from "@vercel/blob";

/**
 * Saved model shots, per style (David, 2026-09-08: "create a 'saved' images
 * per style/listing and save those to their corresponding style model studio
 * panels"). A render lives in the extension's panel only while the panel is
 * open; a shot David wants to keep for DT78080 goes here, and the panel shows
 * it again the next time it opens for DT78080 — from any browser, and from a
 * shell run that never touched the panel.
 *
 * The image itself is copied into Blob storage (fal's result URLs are not
 * forever). One small metadata blob per shot, never overwritten, deleted
 * outright: the first cut kept one index.json (the cloud-history pattern)
 * and a read right after a write came back stale from the Blob CDN, so four
 * quick deletes lost three of them. Unique paths have no such problem.
 */

export interface SavedShot {
  id: string;
  view: string;            // front · side · back · full
  url: string;             // the durable copy (or the source URL when the copy failed)
  source?: string;         // where it came from (the render URL) — lets a panel mark its own render as saved
  savedAt: number;
  durable: boolean;
  humanModelId?: string;   // plate the render used ("crop 93")
  editMode?: 'simple' | 'native' | 'garment-only' | 'face-locked';
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
  editMode?: 'simple' | 'native' | 'garment-only' | 'face-locked';
  engine?: string;
  note?: string;
  by?: string;
}

const PREFIX = "saved-shots/";
const LEGACY_INDEX = "saved-shots/index.json";
const LOCAL_ROOT = process.env.VERCEL
  ? path.join("/tmp", "saved-shots")
  : path.join(process.cwd(), ".data", "saved-shots");
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

function isShot(value: unknown): value is SavedShot {
  const s = value as Partial<SavedShot> | null;
  return Boolean(s && typeof s.id === "string" && s.id && typeof s.url === "string" && s.url && normalizeView(s.view));
}

const metaPath = (style: string, id: string) => `${PREFIX}${style}/${id}.json`;

interface StoredBlob { pathname: string; url: string; }

/** Every blob under a prefix (paginated). */
async function listAll(prefix: string): Promise<StoredBlob[]> {
  const out: StoredBlob[] = [];
  let cursor: string | undefined;
  do {
    const page = await list({ prefix, cursor, limit: 1000 });
    out.push(...page.blobs.map((b) => ({ pathname: b.pathname, url: b.url })));
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  return out;
}

async function fetchShot(url: string): Promise<SavedShot | null> {
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    const data = await res.json();
    return isShot(data) ? data : null;
  } catch {
    return null;
  }
}

// ── local fallback (no Blob token: dev) ──────────────────────────────────
async function localRead(style: string): Promise<SavedShot[]> {
  try {
    const dir = path.join(LOCAL_ROOT, style);
    const names = (await fs.readdir(dir)).filter((n) => n.endsWith(".json"));
    const shots = await Promise.all(names.map(async (n) => {
      try { const v = JSON.parse(await fs.readFile(path.join(dir, n), "utf8")); return isShot(v) ? v : null; } catch { return null; }
    }));
    return shots.filter(Boolean) as SavedShot[];
  } catch {
    return [];
  }
}
async function localWrite(style: string, shot: SavedShot): Promise<void> {
  await fs.mkdir(path.join(LOCAL_ROOT, style), { recursive: true });
  await fs.writeFile(path.join(LOCAL_ROOT, style, `${shot.id}.json`), JSON.stringify(shot, null, 2));
}
async function localDrop(style: string, id: string): Promise<void> {
  await fs.rm(path.join(LOCAL_ROOT, style, `${id}.json`), { force: true });
}

/** The style's shots, newest first. */
async function readShots(style: string): Promise<SavedShot[]> {
  const shots = canUseBlob()
    ? (await Promise.all(
        (await listAll(`${PREFIX}${style}/`)).filter((b) => b.pathname.endsWith(".json")).map((b) => fetchShot(b.url))
      )).filter(Boolean) as SavedShot[]
    : await localRead(style);
  return shots.sort((a, b) => b.savedAt - a.savedAt);
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

/**
 * Copy the image into Blob storage so the saved shot outlives its source URL.
 * A source that cannot be read is an error, not a saved shot: the first cut
 * kept the URL with durable:false and a dead link sat in the panel as a
 * broken picture. Without a Blob token (dev) the source URL is kept as is.
 */
async function copyImage(style: string, id: string, url: string): Promise<{ url: string; durable: boolean }> {
  if (!canUseBlob()) return { url, durable: false };
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`source HTTP ${res.status}`);
  const bytes = Buffer.from(await res.arrayBuffer());
  if (!bytes.length) throw new Error("empty image");
  const { contentType, ext } = imageType(bytes, res.headers.get("content-type") || "", url);
  if (!/^image\//.test(contentType)) throw new Error("source is not an image");
  const blob = await put(`${PREFIX}${style}/${id}.${ext}`, bytes, {
    access: "public",
    contentType,
    addRandomSuffix: false,
    allowOverwrite: true,
  });
  return { url: blob.url, durable: true };
}

export async function readSavedStyle(style: string): Promise<SavedStyle> {
  const shots = await readShots(style);
  return { style, shots, updatedAt: shots[0]?.savedAt ?? 0 };
}

export async function listSavedStyles(): Promise<{ style: string; count: number; updatedAt: number }[]> {
  const byStyle = new Map<string, { count: number; updatedAt: number }>();
  if (canUseBlob()) {
    for (const b of await listAll(PREFIX)) {
      const m = b.pathname.match(/^saved-shots\/([^/]+)\/([^/]+)\.json$/);
      if (!m) continue;
      const cur = byStyle.get(m[1]) ?? { count: 0, updatedAt: 0 };
      // ids start with the save time in base 36 — enough to order styles without fetching every record
      const at = parseInt(m[2].slice(0, 8), 36) || 0;
      byStyle.set(m[1], { count: cur.count + 1, updatedAt: Math.max(cur.updatedAt, at) });
    }
  } else {
    let dirs: string[] = [];
    try { dirs = await fs.readdir(LOCAL_ROOT); } catch { dirs = []; }
    for (const style of dirs) {
      const shots = await localRead(style);
      if (shots.length) byStyle.set(style, { count: shots.length, updatedAt: shots[0].savedAt });
    }
  }
  return [...byStyle.entries()].map(([style, v]) => ({ style, ...v })).sort((a, b) => b.updatedAt - a.updatedAt);
}

export interface SaveFailure { view: string; url: string; error: string; }

export async function saveShots(style: string, inputs: SaveInput[]): Promise<{ entry: SavedStyle; added: SavedShot[]; failed: SaveFailure[] }> {
  const current = await readShots(style);
  // Skip the copy for anything already saved (by source URL) — the merge would drop it anyway.
  const known = new Set(current.flatMap((s) => [s.url, s.source].filter(Boolean) as string[]));
  const fresh = inputs.filter((i, n) => !known.has(i.url) && inputs.findIndex((o) => o.url === i.url) === n);
  const now = Date.now();
  const failed: SaveFailure[] = [];
  const incoming = (await Promise.all(
    fresh.map(async (i, n): Promise<SavedShot | null> => {
      const id = shotId();
      let copy: { url: string; durable: boolean };
      try {
        copy = await copyImage(style, id, i.url);
      } catch (err: any) {
        const error = String(err?.message || err);
        console.warn(`[saved-shots] ${style} ${i.view} not saved — ${error} (${i.url})`);
        failed.push({ view: i.view, url: i.url, error });
        return null;
      }
      const shot: SavedShot = {
        id, view: i.view, url: copy.url, source: i.url, savedAt: now + n, durable: copy.durable,
        ...(i.humanModelId ? { humanModelId: i.humanModelId } : {}),
        ...(i.engine ? { engine: i.engine } : {}),
        ...(i.editMode ? { editMode: i.editMode } : {}),
        ...(i.note ? { note: i.note.slice(0, 300) } : {}),
        ...(i.by ? { by: i.by } : {}),
      };
      if (canUseBlob()) {
        await put(metaPath(style, id), JSON.stringify(shot), {
          access: "public", contentType: "application/json", addRandomSuffix: false, allowOverwrite: true, cacheControlMaxAge: 60,
        });
      } else await localWrite(style, shot);
      return shot;
    })
  )).filter(Boolean) as SavedShot[];
  const merged = mergeShots(current, incoming);
  // Past the cap, the oldest go — the pure merge already left them out of `shots`.
  const kept = new Set(merged.shots.map((s) => s.id));
  await Promise.all([...current, ...incoming].filter((s) => !kept.has(s.id)).map((s) => dropShot(style, s.id, s)));
  return { entry: { style, shots: merged.shots, updatedAt: now }, added: merged.added, failed };
}

/** Delete one shot: its metadata blob and, when we hold the copy, its image. */
export async function dropShot(style: string, id: string, known?: SavedShot): Promise<SavedStyle> {
  const current = await readShots(style);
  const shot = known ?? current.find((s) => s.id === id);
  if (canUseBlob()) {
    const targets = [metaPath(style, id), ...(shot?.durable && shot.url ? [shot.url] : [])];
    try { await del(targets); } catch (err) { console.warn(`[saved-shots] delete failed for ${style} ${id}:`, err); throw err; }
  } else await localDrop(style, id);
  const shots = current.filter((s) => s.id !== id);
  return { style, shots, updatedAt: shots[0]?.savedAt ?? 0 };
}

/**
 * Housekeeping: the legacy index.json and any image with no metadata beside
 * it (the first cut's copies, a save that died between the copy and the
 * record). Returns what was removed.
 */
export async function collectGarbage(): Promise<string[]> {
  if (!canUseBlob()) return [];
  const all = await listAll(PREFIX);
  const metas = new Set(all.filter((b) => b.pathname.endsWith(".json")).map((b) => b.pathname.replace(/\.json$/, "")));
  const orphans = all.filter((b) => b.pathname === LEGACY_INDEX || (!b.pathname.endsWith(".json") && !metas.has(b.pathname.replace(/\.[a-z0-9]+$/i, ""))));
  if (orphans.length) await del(orphans.map((b) => b.url));
  return orphans.map((b) => b.pathname);
}
