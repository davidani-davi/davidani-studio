import sharp from 'sharp';
import type { AutoContour } from './model-admin-core';
import { referencePixels, type ReferencePixels } from './garment-only';

/**
 * Thigh-up views from full-length reference photos (2026-11-02, DCJ67197).
 *
 * A recast or Listing Team draft set built for pants has only head-to-toe photos. A top's Front, Side and
 * Back are framed head to mid-thigh (knee for a mid-length hem), so Simple drew the top's Front head to toe
 * on those sets. Crop such a photo to the house thigh-up window before the swap, then scale the crop back up to
 * the photo's own height (at most 2x, Lanczos) so every view of a set comes out the same size. The face outline
 * is moved and scaled with it, and the new photo is a different picture with its own hash.
 *
 * The window was measured on the house pairs where a crop reference is a crop of a full-length one
 * (studio/crop 108, 109, 112, front): about 3% of the crop above the head, and the bottom edge at
 * head top + 0.60-0.66 of the head-to-feet height (mid-thigh); 112's knee-length side/back end at about 0.76.
 */
export type CropBox = { x: number; y: number; width: number; height: number };
export type Silhouette = { headTop: number; feet: number; bottomClear: boolean; centerX: number };

const TOP_MARGIN = 0.032;
const BOTTOM_AT = { crop: 0.64, knee: 0.76 } as const;

/**
 * Where the person is, from small RGB pixels (about 400 px wide). Each row's backdrop is its median colour
 * (the backdrop fills most of every row, wall and floor alike); a pixel is the person when it differs from
 * both that and the wall colour above the head. `bottomClear` is true when the last rows are bare floor,
 * i.e. the feet are inside the frame. Coordinates are fractions of the image.
 */
export function silhouette(rgb: Uint8Array | Buffer, width: number, height: number, channels = 3): Silhouette | null {
  if (width < 50 || height < 75) return null;
  const at = (x: number, y: number, c: number) => rgb[(y * width + x) * channels + c];
  const wall = [0, 1, 2].map(c => { const v: number[] = []; for (let y = 0; y < Math.max(3, height / 50); y++) for (let x = 0; x < width; x++) v.push(at(x, y, c)); return median(v); });
  const extent: number[] = [], centre: number[] = [];
  for (let y = 0; y < height; y++) {
    const bg = [0, 1, 2].map(c => { const v: number[] = []; for (let x = 0; x < width; x++) v.push(at(x, y, c)); return median(v); });
    const xs: number[] = [];
    for (let x = 0; x < width; x++) {
      let d1 = 0, d2 = 0;
      for (let c = 0; c < 3; c++) { const p = at(x, y, c); d1 += (p - bg[c]) ** 2; d2 += (p - wall[c]) ** 2; }
      if (d1 > 900 && d2 > 900) xs.push(x);
    }
    if (xs.length < 2) { extent.push(0); centre.push(width / 2); continue; }
    const lo = xs[Math.floor(xs.length * 0.02)], hi = xs[Math.min(xs.length - 1, Math.floor(xs.length * 0.98))];
    extent.push((hi - lo) / width); centre.push((lo + hi) / 2);
  }
  const body = extent.map((e, y) => e > 0.03 ? y : -1).filter(y => y >= 0);
  if (body.length < height * 0.3) return null;
  const top = body[0], bottom = body[body.length - 1];
  const tail = Math.max(2, Math.round(height * 0.006));
  const bottomClear = extent.slice(height - tail).every(e => e < 0.03);
  const rows = body.filter(y => y <= top + (bottom - top) * 0.6);
  const centerX = rows.reduce((s, y) => s + centre[y], 0) / rows.length / width;
  return { headTop: top / height, feet: (bottom + 1) / height, bottomClear, centerX };
}

/** A full-length photo: feet inside the frame above bare floor, and the person filling most of the height. */
export const isFullLength = (s: Silhouette | null) => Boolean(s && s.bottomClear && s.feet >= 0.85 && s.feet - s.headTop >= 0.75);

/** The 2:3 thigh-up (or knee) window of a full-length photo, in pixels, or null when it would not fit. */
export function viewCropBox(width: number, height: number, s: Silhouette, framing: 'crop' | 'knee'): CropBox | null {
  const top = s.headTop * height, body = (s.feet - s.headTop) * height;
  const bottom = top + BOTTOM_AT[framing] * body;
  let h = Math.round((bottom - top) / (1 - TOP_MARGIN) / 3) * 3;
  if (h * 2 / 3 > width) h = Math.floor(width * 3 / 2 / 3) * 3;
  const w = h * 2 / 3;
  if (h < 600 || h >= height) return null;
  const y = clamp(Math.round(top - TOP_MARGIN * h), 0, height - h);
  const x = clamp(Math.round(s.centerX * width - w / 2), 0, width - w);
  return { x, y, width: w, height: h };
}

/** The face outline moved into the crop; null when any of it falls outside (the crop would cut the head). */
export function cropContour(c: AutoContour, box: CropBox, sha256: string): AutoContour | null {
  if (c.kind !== 'contour' || !Array.isArray(c.points)) return null;
  const points = c.points.map(([x, y]) => [x - box.x, y - box.y] as [number, number]);
  if (points.some(([x, y]) => x < 0 || y < 0 || x > box.width || y > box.height)) return null;
  return { ...c, width: box.width, height: box.height, sha256, points,
    ...(typeof c.garmentBoundaryY === 'number' ? { garmentBoundaryY: c.garmentBoundaryY - box.y } : {}) };
}

export type ViewCrop = { url: string; box: CropBox; scale: number; contour: AutoContour; ref: ReferencePixels };

/**
 * The thigh-up reference for a non-full view, or null when the photo is not full-length (already framed), the
 * window would not fit, or the face would leave it. `store` saves the PNG under the given key and returns its
 * URL; the key is fixed for a photo and window, so a render, its retries and Heal all use the same picture.
 */
export async function thighUpReference(ref: ReferencePixels, contour: AutoContour, framing: 'crop' | 'knee',
  store: (key: string, png: Buffer) => Promise<string>): Promise<ViewCrop | null> {
  const raw = { raw: { width: ref.width, height: ref.height, channels: 4 as const } };
  const small = await sharp(ref.data, raw).resize({ width: 400 }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const s = silhouette(small.data, small.info.width, small.info.height, small.info.channels);
  if (!isFullLength(s)) return null;
  const box = viewCropBox(ref.width, ref.height, s!, framing);
  if (!box || !cropContour(contour, box, '')) return null;
  const scale = Math.min(2, ref.height / box.height);
  const height = Math.round(box.height * scale), width = Math.round(box.width * scale);
  const png = await sharp(ref.data, raw).extract({ left: box.x, top: box.y, width: box.width, height: box.height })
    .resize({ width, height, kernel: 'lanczos3' }).png({ compressionLevel: 6 }).toBuffer();
  const out = await referencePixels(png);
  const kx = out.width / box.width, ky = out.height / box.height;
  const moved: AutoContour = { ...contour, width: out.width, height: out.height, sha256: out.sha256,
    points: contour.points!.map(([x, y]) => [Math.round((x - box.x) * kx), Math.round((y - box.y) * ky)] as [number, number]),
    ...(typeof contour.featherPixels === 'number' ? { featherPixels: Math.max(1, Math.round(contour.featherPixels * ky)) } : {}),
    ...(typeof contour.garmentBoundaryY === 'number' ? { garmentBoundaryY: Math.round((contour.garmentBoundaryY - box.y) * ky) } : {}) };
  const key = `view-crops/${ref.sha256.slice(0, 32)}-${framing}-${box.x}-${box.y}-${box.width}x${box.height}-${out.width}x${out.height}.png`;
  return { url: await store(key, png), box, scale: +ky.toFixed(4), contour: moved, ref: out };
}

function median(v: number[]) { const s = v.sort((a, b) => a - b); return s[s.length >> 1]; }
function clamp(n: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, n)); }
