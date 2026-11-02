// Heal (2026-11-02): fix a Simple render that came out with doubled hair or a neck seam without
// generating anything. The image model's own frame for that render is still in fal's request
// history (a free read). Find it, then run today's composite on it: line the generated head up with
// the original one (lib/face-align.ts) and put the original face back with the current outline.
// The raw frame never leaves the server; only the re-composited, verified image is returned.
import sharp from 'sharp';
import type { ReferencePixels } from './garment-only';

/** The edit endpoints a Simple render can come from (lib/models.ts). */
export const HEAL_ENDPOINTS = ['openai/gpt-image-2.5/sunburst/edit', 'openai/gpt-image-2/edit'];
const HISTORY = 'https://api.fal.ai/v1/models/requests/by-endpoint';
const MAX_PAGES = 20, MAX_CANDIDATES = 24;
/** Mean RGB difference below this over the garment area = the same frame (it is copied there pixel for pixel). */
export const MATCH_LIMIT = 1.5;

export interface HealInput { url: string; renderedAt?: number; autoContour?: unknown }
export interface RawFrame { url: string; requestId: string; endedAt: string; endpoint: string }

/** Only our own image hosts: the render was uploaded to fal storage or saved in the studio Blob store. */
export function isHealableUrl(url: unknown): url is string {
  if (typeof url !== 'string' || url.length > 2000) return false;
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && (/(^|\.)fal\.media$/.test(u.hostname) || /\.public\.blob\.vercel-storage\.com$/.test(u.hostname));
  } catch { return false; }
}

export function parseHeal(input: unknown): HealInput {
  const h = input as HealInput;
  if (!h || !isHealableUrl(h.url)) throw Error('Heal needs the render image link (fal or studio storage).');
  const at = typeof h.renderedAt === 'string' ? Date.parse(h.renderedAt) : h.renderedAt;
  return { url: h.url, renderedAt: typeof at === 'number' && Number.isFinite(at) ? at : undefined, autoContour: h.autoContour };
}

/** Same photo: equal URLs, or the same path on the studio's own host (it may be reached through another domain). */
export function sameReference(a: string, b: string) {
  if (a === b) return true;
  try {
    const x = new URL(a), y = new URL(b);
    return !x.hostname.includes('blob.vercel-storage.com') && x.pathname === y.pathname && decodeURIComponent(x.pathname).startsWith('/models/');
  } catch { return false; }
}

type Fetch = typeof fetch;
/** Generations whose base photo is `referenceUrl`, newest first, from fal's request history. */
export async function rawFrameCandidates(referenceUrl: string, o: { renderedAt?: number; now?: number; key?: string; fetcher?: Fetch } = {}): Promise<RawFrame[]> {
  const key = o.key ?? process.env.FAL_KEY;
  if (!key) throw Error('Heal is not configured (no fal key).');
  const fetcher = o.fetcher ?? fetch, now = o.now ?? Date.now();
  // A known render time narrows the search to a few pages; otherwise the last 14 days.
  const start = new Date(o.renderedAt ? o.renderedAt - 45 * 60e3 : now - 14 * 864e5).toISOString();
  const end = new Date(o.renderedAt ? o.renderedAt + 20 * 60e3 : now).toISOString();
  const found: RawFrame[] = [];
  for (const endpoint of HEAL_ENDPOINTS) {
    let cursor = '';
    for (let page = 0; page < MAX_PAGES; page++) {
      const q = new URLSearchParams({ endpoint_id: endpoint, expand: 'payloads', start, end, limit: '100' });
      if (cursor) q.set('cursor', cursor);
      const res = await fetcher(`${HISTORY}?${q}`, { headers: { Authorization: `Key ${key}` }, cache: 'no-store' });
      if (!res.ok) throw Error(`fal history answered ${res.status}.`);
      const data: any = await res.json();
      for (const it of data.items || []) {
        const base = it?.json_input?.image_urls?.[0], out = it?.json_output?.images?.[0]?.url;
        if (it?.status_code === 200 && typeof base === 'string' && typeof out === 'string' && sameReference(base, referenceUrl))
          found.push({ url: out, requestId: String(it.request_id), endedAt: String(it.ended_at || it.started_at || ''), endpoint });
      }
      if (!data.has_more || !data.next_cursor) break;
      cursor = data.next_cursor;
    }
  }
  return found.sort((a, b) => b.endedAt.localeCompare(a.endedAt));
}

/** The render's garment area: everything below the face outline (and its blend band) plus a margin. */
export function garmentRows(mask: Buffer, width: number, height: number) {
  let bottom = -1;
  for (let i = mask.length - 1; i >= 0; i--) if (mask[i] < 255) { bottom = Math.floor(i / width); break; }
  return Math.min(height - 16, Math.max(0, bottom) + Math.round(height * 0.04));
}

/** Frame resized exactly as compositeGarment resizes it. */
export async function frameAtReference(bytes: Buffer, width: number, height: number) {
  return sharp(bytes).rotate().resize(width, height, { fit: 'fill' }).toColourspace('srgb').ensureAlpha().raw().toBuffer();
}

/** Mean RGB difference over a sparse grid of the garment area. */
export function garmentDifference(a: Buffer, b: Buffer, width: number, height: number, fromRow: number) {
  let sum = 0, n = 0;
  for (let y = fromRow; y < height; y += 3) for (let x = 1; x < width; x += 3) {
    const i = (y * width + x) * 4;
    sum += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]); n += 3;
  }
  return n ? sum / n : Infinity;
}

/**
 * Finds which generation the render was made from. Simple copies the generated frame unchanged
 * below the face, so the right frame matches there to within rounding and any other render of the
 * same photo (another garment, another colour) does not.
 */
export async function matchRawFrame(render: Buffer, ref: Pick<ReferencePixels, 'width' | 'height'>, mask: Buffer, candidates: RawFrame[], fetcher: Fetch = fetch) {
  const fromRow = garmentRows(mask, ref.width, ref.height);
  let best: { frame: RawFrame; bytes: Buffer; difference: number } | undefined;
  const list = candidates.slice(0, MAX_CANDIDATES);
  for (let i = 0; i < list.length; i += 4) {
    const batch = await Promise.all(list.slice(i, i + 4).map(async frame => {
      // One retry: a dropped download must not read as "no matching frame".
      for (let attempt = 0; attempt < 2; attempt++) try {
        const res = await fetcher(frame.url, { cache: 'no-store' });
        if (!res.ok) continue;
        const bytes = Buffer.from(await res.arrayBuffer());
        const px = await frameAtReference(bytes, ref.width, ref.height);
        return { frame, bytes, difference: garmentDifference(render, px, ref.width, ref.height, fromRow) };
      } catch { /* retry */ }
      return null;
    }));
    for (const r of batch) if (r && (!best || r.difference < best.difference)) best = r;
    if (best && best.difference < MATCH_LIMIT) return { ...best, matched: true as const, checked: Math.min(i + 4, list.length) };
  }
  return { ...best, matched: false as const, checked: list.length };
}
