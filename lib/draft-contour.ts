import type { AutoContour } from './model-admin-core';
import type { ReferencePixels } from './garment-only';

/**
 * Face outlines for Listing Team draft reference sets. A reviewed contour (simple-contour-presets.json)
 * is required for every installed reference; a draft is a private test set, so it gets an outline
 * found automatically when it is saved (Florence-2 "head", "face" and "clothing" boxes): the same 12-point head
 * shape the library review uses (output/contour-library-audit/build-library-contours.py), feathered
 * outward, ending above the garment line, and bound to the decoded pixels. When the head cannot be
 * found confidently the view gets no outline and Simple garment swap refuses it, exactly as for an unreviewed reference.
 */
const UNIT: [number, number][] = [[.2,0],[.8,0],[.98,.15],[1,.5],[.96,.7],[.8,.86],[.62,.98],[.45,1],[.27,.91],[.1,.77],[0,.52],[.02,.18]];

export type Box = { x: number; y: number; w: number; h: number };
/** Florence-2 phrase-grounding boxes (pixels of the stored image) for "head", "face" and "clothing". */
export type Grounding = { head: Box[]; face?: Box[]; clothing: Box[] };

/** Convex hull (monotone chain), so the outline always contains every point it was built from. */
function hull(pts: [number, number][]): [number, number][] {
  const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: number[], a: number[], b: number[]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const half = (list: [number, number][]) => { const h: [number, number][] = []; for (const q of list) { while (h.length >= 2 && cross(h[h.length - 2], h[h.length - 1], q) <= 0) h.pop(); h.push(q); } h.pop(); return h; };
  return [...half(p), ...half([...p].reverse())];
}

/**
 * Builds the outline from the head box, ending a feather above the garment line (the top of the
 * clothing box, less a 0.5% margin for grounding error, 3% on a back view), or null when the two boxes do
 * not add up. Measured on the reviewed library (see the studio PR), the head box always encloses the chin
 * and the clothing top lands at or above the reviewed garment row except under long hair on back views.
 */
export function buildAutoContour(ref: Pick<ReferencePixels, 'width' | 'height' | 'sha256'>, g: Grounding, view: string, now = new Date()): AutoContour | null {
  const base = { width: ref.width, height: ref.height, sha256: ref.sha256, source: 'auto-draft-v1' as const, detectedAt: now.toISOString() };
  const W = ref.width, H = ref.height;
  // A head in a waist-up to full-length shot: not a sliver, not most of the frame, in the upper half.
  // A head that touches the top edge is cut off (or not a head at all); that view needs a reviewed contour.
  const head = g.head.filter(b => b.w >= W * .04 && b.w <= W * .6 && b.h >= H * .08 && b.h <= H * .45 && b.y >= H * .01 && b.y + b.h / 2 < H * .5)
    .sort((a, b) => b.w * b.h - a.w * a.h)[0];
  const clothes = g.clothing.filter(b => b.w >= W * .1 && b.h >= H * .1);
  // Clothing from the top of the frame down is a waist-down crop: nothing to protect.
  if (clothes.some(b => b.y <= H * .07)) return { ...base, kind: 'no-head' };
  if (!head) return null;
  const below = clothes.filter(b => b.y > head.y + head.h * .5).map(b => b.y);
  if (!below.length) return null;
  // Hair over a back view hides the collar, so the clothing box starts low there: keep a wider margin.
  const garmentRow = Math.floor(Math.min(...below) - H * (view === 'back' ? .03 : .005));
  const headBottom = head.y + head.h;
  // The face box pins the profile (nose, lips, chin) that a hair-centred head box can miss on a side view.
  const face = (g.face || []).filter(f => f.w * f.h < head.w * head.h && f.x + f.w / 2 > head.x && f.x + f.w / 2 < head.x + head.w && f.y + f.h / 2 > head.y && f.y + f.h / 2 < headBottom)
    .sort((a, b) => b.w * b.h - a.w * a.h)[0];
  // Narrow the feather (down to 6 px) when the chin sits close to the garment.
  const feather = Math.max(6, Math.min(Math.round(W * .025), Math.floor(Math.min(W, H) / 4) - 1, Math.floor(garmentRow - headBottom - 2)));
  // Like the reviewed library, the outline covers head and neck down to a feather above the garment,
  // but not a bare chest above a low neckline: a new garment may need to paint straps there.
  const b = Math.min(garmentRow - feather - 2, headBottom + head.h * .35);
  // Never cut the chin off (it would be left to the garment edit). Hair below it lying over the garment
  // may go, as in the reviewed outlines; without a face box, allow that only on a back view.
  if (face ? face.y + face.h > b : headBottom - b > head.h * (view === 'back' ? .3 : .08)) return null;
  const l = Math.max(0, head.x - head.w * .03), r = Math.min(W - 1, head.x + head.w * 1.03), t = Math.max(0, head.y - head.h * .03);
  const shape = UNIT.map(([x, y]) => [l + x * (r - l), t + y * (b - t)] as [number, number]);
  if (face) {
    const fl = Math.max(0, face.x - face.w * .1), fr = Math.min(W - 1, face.x + face.w * 1.1), ft = Math.max(0, face.y - face.h * .05), fb = Math.min(b, face.y + face.h * 1.05);
    shape.push([fl, ft], [fr, ft], [fr, fb], [fl, fb]);
  }
  const points = hull(shape).map(([x, y]) => [Math.round(x * 100) / 100, Math.round(y * 100) / 100] as [number, number]);
  if (garmentRow >= H * .75 || b - t < H * .03) return null;
  return { ...base, kind: 'contour', points, featherPixels: feather, garmentBoundaryY: garmentRow };
}

/** Detects one view: decodes the stored bytes exactly as a render will, then grounds head and clothing. */
export async function detectAutoContour(url: string, view: string, deps: {
  fetch?: typeof fetch; referencePixels: (bytes: Buffer) => Promise<ReferencePixels>; ground: (url: string, text: string) => Promise<Box[]>;
}): Promise<AutoContour | null> {
  const f = deps.fetch || fetch;
  const response = await f(url, { cache: 'no-store' });
  if (!response.ok) return null;
  const ref = await deps.referencePixels(Buffer.from(await response.arrayBuffer()));
  const [head, face, clothing] = await Promise.all([deps.ground(url, 'head'), deps.ground(url, 'face'), deps.ground(url, 'clothing')]);
  return buildAutoContour(ref, { head, face, clothing }, view);
}
