import sharp from "sharp";
import { matteOf, type Matte } from "./matte";
import { figureBox } from "./plate-restore";
import { uploadToFal } from "./fal";

/**
 * Face anchor for the side and full views (2026-09-08).
 *
 * The continuity anchor (the whole front render, ANCHOR_RULE) fixed the
 * garment's length and styling across a set, but the face still drifted:
 * on a full-length shot the head is a hundred pixels tall, too little for
 * the generator to hold the likeness. So the side and full views get one
 * more reference: a close crop of the head, cut from the front render, and
 * a FACE rule that names it (lib/multi-model-prompt.ts, applyAnchor).
 *
 * The head is located from the front render's matte, not by a vision
 * call: the figure's top is the crown, the first narrowing below the
 * widest rows of the head is the neck. Long hair over the shoulders hides
 * the neck; then the head is taken as a fixed share of the figure.
 */

export interface HeadBox { left: number; top: number; width: number; height: number }

export interface FaceAnchorReport {
  applied: boolean;
  /** Head crop in the front render's pixels. */
  box?: HeadBox;
  /** How the head's bottom was found. */
  method?: "neck" | "share";
  skipReason?: string;
  failed?: boolean;
}

/** The crop's side, as a multiple of the head's height (crown to chin). */
export const CROP_SCALE = 1.9;
/** Longest side of the uploaded crop. */
export const CROP_MAX = 1024;
/**
 * The head's share of the figure's height when the matte shows no neck
 * (hair over the shoulders): a head is a seventh and a half of a standing
 * body, so about 0.135 of a full-length figure and 0.22 of a head-to-thigh
 * one. Keyed by the front plate's framing (lib/plate-framing.ts).
 */
export const HEAD_SHARE: Record<"full" | "crop", number> = { full: 0.135, crop: 0.22 };

/**
 * Where the head is in a figure matte. `min` is the alpha threshold.
 * Returns null when the matte has no figure or the figure is too small.
 */
export function locateHead(
  alpha: Uint8Array | Buffer, width: number, height: number, headShare = HEAD_SHARE.crop, min = 128
): { box: HeadBox; method: "neck" | "share" } | null {
  const fig = figureBox(alpha, width, height, min);
  if (!fig) return null;
  const figH = fig.y1 - fig.y0 + 1;
  if (figH < 32) return null;

  // Row profile of the figure's upper half: width and centre per row.
  const rows = Math.min(figH, Math.round(figH * 0.5));
  const w = new Int32Array(rows), cx = new Float64Array(rows);
  for (let i = 0; i < rows; i++) {
    const y = fig.y0 + i, row = y * width;
    let n = 0, sx = 0;
    for (let x = fig.x0; x <= fig.x1; x++) if (alpha[row + x] >= min) { n++; sx += x; }
    w[i] = n; cx[i] = n ? sx / n : NaN;
  }

  // Scan down from the crown with a running maximum width (the head, hair
  // included). The neck is the first place the row narrows to well under
  // that maximum; the chin is the first row of that narrowest stretch. If
  // the width never drops before the shoulders (hair over them), there is
  // no neck to find.
  const neckEnd = Math.min(rows, Math.round(figH * 0.4));
  let headMax = 0, dropAt = -1;
  for (let i = 0; i < neckEnd; i++) {
    if (w[i] > headMax) headMax = w[i];
    if (i > 2 && w[i] < headMax * 0.72) { dropAt = i; break; }
  }
  let neckAt = -1;
  if (dropAt > 0) {
    let neckW = Infinity;
    for (let i = dropAt; i < neckEnd; i++) {
      if (w[i] < neckW) { neckW = w[i]; neckAt = i; }
      else if (w[i] > neckW * 1.15) break; // widening again: shoulders
    }
  }
  let headH: number, method: "neck" | "share";
  if (neckAt > 0) {
    headH = neckAt; method = "neck";
  } else {
    // hair over the shoulders: the framing's share of the figure, and never
    // taller than 1.3 of the head's width
    headH = Math.round(Math.min(figH * headShare, headMax * 1.3)); method = "share";
  }
  headH = Math.max(headH, 8);

  // The face's centre line: the mean x of the rows between the brow and the chin.
  let sx = 0, n = 0;
  for (let i = Math.round(headH * 0.25); i < Math.min(rows, headH); i++) if (!Number.isNaN(cx[i])) { sx += cx[i]; n++; }
  const centreX = n ? sx / n : (fig.x0 + fig.x1) / 2;

  const side = Math.round(headH * CROP_SCALE);
  const centreY = fig.y0 + headH * 0.5;
  let left = Math.round(centreX - side / 2), top = Math.round(centreY - side / 2);
  let cw = side, ch = side;
  if (left < 0) left = 0;
  if (top < 0) top = 0;
  if (left + cw > width) cw = width - left;
  if (top + ch > height) ch = height - top;
  return { box: { left, top, width: cw, height: ch }, method };
}

/** The head crop of an image, as a JPEG buffer, from its matte. */
export async function headCrop(image: Buffer, matte: Matte, headShare = HEAD_SHARE.crop): Promise<{ buffer: Buffer; box: HeadBox; method: "neck" | "share" } | null> {
  const meta = await sharp(image).metadata();
  const W = meta.width || 0, H = meta.height || 0;
  if (!W || !H) throw new Error("front render has no size");
  // the matte is at the image's size; if not, scale the box
  const found = locateHead(matte.alpha, matte.width, matte.height, headShare);
  if (!found) return null;
  const sx = W / matte.width, sy = H / matte.height;
  const box: HeadBox = {
    left: Math.round(found.box.left * sx), top: Math.round(found.box.top * sy),
    width: Math.max(1, Math.round(found.box.width * sx)), height: Math.max(1, Math.round(found.box.height * sy)),
  };
  if (box.left + box.width > W) box.width = W - box.left;
  if (box.top + box.height > H) box.height = H - box.top;
  if (box.width < 48 || box.height < 48) return null;
  const buffer = await sharp(image)
    .extract(box)
    .resize({ width: Math.min(CROP_MAX, box.width), height: Math.min(CROP_MAX, box.height), fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 92, mozjpeg: true })
    .toBuffer();
  return { buffer, box, method: found.method };
}

const crops = new Map<string, Promise<FaceAnchorRun>>();

export interface FaceAnchorRun {
  /** fal-hosted URL of the head crop, or null when none could be cut. */
  url: string | null;
  report: FaceAnchorReport;
  ms: number;
}

/**
 * The head crop of the front render at `frontUrl`, hosted on fal. Cached per
 * URL and share for the life of the process: the side and full views of one
 * set share the same front. `headShare` is the head's share of the figure
 * when no neck shows (HEAD_SHARE, by the front plate's framing).
 */
export function faceAnchorFor(frontUrl: string, headShare = HEAD_SHARE.crop): Promise<FaceAnchorRun> {
  const key = `${headShare}|${frontUrl}`;
  let p = crops.get(key);
  if (!p) {
    p = run(frontUrl, headShare).catch((err) => { crops.delete(key); throw err; });
    crops.set(key, p);
  }
  return p;
}

async function run(frontUrl: string, headShare: number): Promise<FaceAnchorRun> {
  const started = Date.now();
  const [res, matte] = await Promise.all([fetch(frontUrl), matteOf(frontUrl)]);
  if (!res.ok) throw new Error(`fetch ${res.status} for the front render`);
  const image = Buffer.from(await res.arrayBuffer());
  const crop = await headCrop(image, matte, headShare);
  if (!crop) return { url: null, report: { applied: false, skipReason: "no head found in the front render's matte" }, ms: Date.now() - started };
  const url = await uploadToFal(new Blob([Uint8Array.from(crop.buffer)], { type: "image/jpeg" }), "face-anchor.jpg");
  return { url, report: { applied: true, box: crop.box, method: crop.method }, ms: Date.now() - started };
}
