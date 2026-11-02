import fs from "node:fs/promises";
import path from "node:path";
import { del, head, list } from "@vercel/blob";
import sharp from "sharp";

// Model Studio's "Add model" form used to send its photos inside one request, which Vercel caps at 4.5 MB,
// so the browser shrank them to 2048 px first (and refused the set when PNGs stayed too big). Now the browser
// uploads each original straight to Blob under this prefix and the save request carries only the links.
export const INCOMING_PREFIX = "user-models/incoming/";
export const MAX_INCOMING_BYTES = 20 * 1024 * 1024;
export const INCOMING_TYPES = ["image/png", "image/jpeg", "image/webp"];
/** Same cap as Model library ("maximum 4096 pixels per side"). */
export const MAX_EDGE = 4096;
const LOCAL_DIR = path.join(process.cwd(), "public", "user-assets");
const TYPES = { png: "image/png", jpg: "image/jpeg", webp: "image/webp" } as const;

export function validIncomingPath(value: string): boolean {
  return /^user-models\/incoming\/[a-f0-9-]{36}\.(png|jpg|webp)$/.test(value);
}

export function localIncomingFile(key: string): string {
  return path.join(LOCAL_DIR, key);
}

async function incomingBytes(url: string): Promise<Buffer> {
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    let parsed: URL;
    try { parsed = new URL(url); } catch { throw Error("Upload the photo again: its link is not valid."); }
    const key = parsed.pathname.slice(1);
    if (parsed.protocol !== "https:" || !/^[a-z0-9]+\.public\.blob\.vercel-storage\.com$/.test(parsed.hostname) || parsed.search || parsed.hash || !validIncomingPath(key)) {
      throw Error("Upload the photo again: only photos uploaded from this form can be saved.");
    }
    // Listing this store proves the photo is ours; any other URL is never fetched.
    const owned = await list({ prefix: key, limit: 1 });
    if (!owned.blobs.some((b) => b.url === url)) throw Error("Upload the photo again: it is not in this studio's storage.");
    const info = await head(url);
    if (info.size > MAX_INCOMING_BYTES) throw Error("Use a photo no larger than 20 MB.");
    const res = await fetch(url, { cache: "no-store", redirect: "error" });
    if (!res.ok) throw Error("The uploaded photo could not be read. Try again.");
    return Buffer.from(await res.arrayBuffer());
  }
  const key = url.replace(/^\/user-assets\//, "");
  if (!url.startsWith("/user-assets/") || !validIncomingPath(key)) throw Error("Upload the photo again: only photos uploaded from this form can be saved.");
  return fs.readFile(localIncomingFile(key));
}

/**
 * The photo the browser uploaded for one view, ready for saveUserModel. The bytes are kept exactly as uploaded,
 * unless the photo is larger than 4096 px per side or carries a camera rotation tag: then it is turned upright and
 * scaled to fit 4096 px once, at high quality, in its own format.
 */
export async function readIncomingPhoto(url: string, view: string): Promise<File> {
  const bytes = await incomingBytes(url);
  if (!bytes.length || bytes.length > MAX_INCOMING_BYTES) throw Error("Use a photo no larger than 20 MB.");
  const meta = await sharp(bytes, { limitInputPixels: 100_000_000 }).metadata();
  const ext = meta.format === "jpeg" ? "jpg" : meta.format;
  if (ext !== "png" && ext !== "jpg" && ext !== "webp") throw Error("Use a PNG, JPEG or WebP photo.");
  if ((meta.pages || 1) > 1) throw Error("Use a still photo, not an animation.");
  const rotated = (meta.orientation || 1) > 1;
  const longest = Math.max(meta.width || 0, meta.height || 0);
  let out: Buffer = bytes;
  if (rotated || longest > MAX_EDGE) {
    const img = sharp(bytes, { limitInputPixels: 100_000_000 }).rotate().resize({ width: MAX_EDGE, height: MAX_EDGE, fit: "inside", withoutEnlargement: true });
    out = await (ext === "png" ? img.png() : ext === "webp" ? img.webp({ quality: 95 }) : img.jpeg({ quality: 95, chromaSubsampling: "4:4:4" })).toBuffer();
  }
  return new File([new Uint8Array(out)], `${view}.${ext}`, { type: TYPES[ext] });
}

/** Best effort: the set keeps its own copies, so the incoming uploads are no longer needed. */
export async function removeIncoming(urls: string[]): Promise<void> {
  for (const url of urls) {
    try {
      if (process.env.BLOB_READ_WRITE_TOKEN) {
        const key = new URL(url).pathname.slice(1);
        if (validIncomingPath(key)) await del(url);
      } else {
        const key = url.replace(/^\/user-assets\//, "");
        if (validIncomingPath(key)) await fs.rm(localIncomingFile(key), { force: true });
      }
    } catch {
      // A leftover upload only costs storage; the saved set is unaffected.
    }
  }
}
