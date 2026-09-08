import sharp from "sharp";
import type { Matte } from "./matte";

/**
 * Put a finished model-shot render back onto its plate's real backdrop and
 * line its figure up with the plate's.
 *
 * WHY THIS EXISTS
 * ---------------
 * The front view is one edit on a real plate photo, so it keeps the plate's
 * sweep and stays where the plate put the model. Side, back and full are
 * separate generations anchored on the front render: each one re-invents the
 * sweep (mottled, grainy, a different cream from its neighbours) and drops
 * the figure wherever the model lands — the back in particular drifts off
 * centre. A set of four then reads as four different shoots.
 *
 * The pass is a composite, not a generation:
 *
 *   1. the figure is cut out of the render with a matte (lib/matte.ts);
 *   2. the plate's backdrop is the plate itself with its own model lifted
 *      out — the hole is filled with a wide normalised blur of the sweep
 *      around it, so the studio's real gradient and floor shadow stay;
 *   3. the render's figure is moved horizontally so its centre sits where
 *      the plate's figure centre sits (the frame the photographer chose);
 *   4. figure over backdrop through the matte's own soft edge.
 *
 * Boxes, the hole and the fill are measured at a small working size; only
 * the final composite touches full-resolution pixels.
 */

export interface PlateRestoreReport {
  /** True when the render was actually rebuilt on the plate's backdrop. */
  applied: boolean;
  /** Fraction of the render the matte calls figure (0 when skipped). */
  coverage: number;
  /** Horizontal move applied to the figure, in output pixels (+ = right). */
  shiftX: number;
  /** Why the pass declined. Only set when applied is false. */
  skipReason?: string;
  /** Set when the pass threw. The render shipped untouched. */
  failed?: boolean;
}

export interface Box { x0: number; x1: number; y0: number; y1: number }

/** Working width the boxes and the fill are measured at. */
export const WORK_WIDTH = 512;

/** Bounding box of a matte's figure (alpha above `min`). */
export function figureBox(alpha: Uint8Array | Buffer, width: number, height: number, min = 128): Box | null {
  let x0 = width, x1 = -1, y0 = height, y1 = -1;
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      if (alpha[row + x] < min) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  return x1 < 0 ? null : { x0, x1, y0, y1 };
}

/**
 * How far to move the render's figure so its horizontal centre matches the
 * plate's. Zero when either figure runs into a side of the frame (the box is
 * then not the figure's) or the move would be implausibly large — a plate
 * and its render never disagree by a fifth of the frame unless a matte is
 * wrong, and a wrong matte must not move anything.
 */
export function horizontalShift(render: Box | null, plate: Box | null, width: number, maxFraction = 0.2): number {
  if (!render || !plate) return 0;
  if (render.x0 <= 0 || render.x1 >= width - 1 || plate.x0 <= 0 || plate.x1 >= width - 1) return 0;
  const shift = Math.round((plate.x0 + plate.x1) / 2 - (render.x0 + render.x1) / 2);
  return Math.abs(shift) > width * maxFraction ? 0 : shift;
}

/** Binary dilate of a 255-mask by a square radius. */
export function grow(m: Uint8Array, width: number, height: number, r: number): Uint8Array {
  const tmp = new Uint8Array(m.length), out = new Uint8Array(m.length);
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      let v = 0;
      for (let k = Math.max(0, x - r); k <= Math.min(width - 1, x + r); k++) if (m[row + k]) { v = 255; break; }
      tmp[row + x] = v;
    }
  }
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      let v = 0;
      for (let k = Math.max(0, y - r); k <= Math.min(height - 1, y + r); k++) if (tmp[k * width + x]) { v = 255; break; }
      out[y * width + x] = v;
    }
  }
  return out;
}

/**
 * The sweep continued under a hole, row by row: each run of hole pixels is
 * a straight blend from the sweep just left of it to the sweep just right
 * of it, then a small blur inside the hole hides the row seams.
 *
 * The first version averaged the sweep around the hole with a wide blur
 * (a tenth of the height). On the first live run (DJ62231, 2026-09-08) that
 * read as a pale aura around the figure: the plate's sweep is darkest right
 * beside its model (the contact shadow), and a wide average is lighter than
 * that, so wherever the render's figure was narrower than the plate's the
 * fill showed 5 levels light. A row blend keeps each row's own tone.
 */
export function fillHole(rgb: Uint8Array | Buffer, hole: Uint8Array, width: number, height: number): Uint8Array {
  const n = width * height;
  const out = Uint8Array.from(rgb);
  const done = new Uint8Array(n); // hole pixels the row pass filled
  const TAP = 6;
  const sample = (y: number, from: number, step: number): [number, number, number] | null => {
    let r = 0, g = 0, b = 0, k = 0;
    for (let x = from, i = 0; i < TAP && x >= 0 && x < width; x += step, i++) {
      const p = y * width + x;
      if (hole[p]) break;
      r += rgb[p * 3]; g += rgb[p * 3 + 1]; b += rgb[p * 3 + 2]; k++;
    }
    return k ? [r / k, g / k, b / k] : null;
  };
  // Row pass: every run of hole pixels is a straight blend from the sweep
  // just left of it to the sweep just right of it, so each row keeps its
  // own tone — the shadow beside the plate's model included.
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width;) {
      if (!hole[y * width + x]) { x++; continue; }
      const x0 = x;
      while (x < width && hole[y * width + x]) x++;
      const x1 = x - 1;
      const L = sample(y, x0 - 1, -1), R = sample(y, x1 + 1, 1);
      if (!L && !R) continue;
      const a = L || R!, b = R || L!;
      const span = Math.max(1, x1 - x0 + 2);
      for (let xx = x0; xx <= x1; xx++) {
        const t = L && R ? (xx - x0 + 1) / span : 0;
        const p = y * width + xx;
        out[p * 3] = clamp8(a[0] + (b[0] - a[0]) * t);
        out[p * 3 + 1] = clamp8(a[1] + (b[1] - a[1]) * t);
        out[p * 3 + 2] = clamp8(a[2] + (b[2] - a[2]) * t);
        done[p] = 1;
      }
    }
  }
  // Column pass for runs that reached both sides of the frame: blend
  // between the nearest settled rows above and below.
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height;) {
      const p = y * width + x;
      if (!hole[p] || done[p]) { y++; continue; }
      const y0 = y;
      while (y < height && hole[y * width + x] && !done[y * width + x]) y++;
      const y1 = y - 1;
      const up = y0 > 0 ? (y0 - 1) * width + x : -1, dn = y1 + 1 < height ? (y1 + 1) * width + x : -1;
      if (up < 0 && dn < 0) continue;
      const a = up >= 0 ? up : dn, b = dn >= 0 ? dn : up;
      const span = Math.max(1, y1 - y0 + 2);
      for (let yy = y0; yy <= y1; yy++) {
        const t = up >= 0 && dn >= 0 ? (yy - y0 + 1) / span : 0;
        const q = yy * width + x;
        for (let c = 0; c < 3; c++) out[q * 3 + c] = clamp8(out[a * 3 + c] + (out[b * 3 + c] - out[a * 3 + c]) * t);
      }
    }
  }
  // A small blur inside the hole only, so the rows' independent blends do
  // not read as streaks; the boundary is continuous already, so the blur
  // moves no tone across it.
  const r = Math.max(1, Math.round(height / 80));
  const f = new Float32Array(n * 3);
  for (let i = 0; i < n * 3; i++) f[i] = out[i];
  const blurred = boxBlur(f, width, height, 3, r);
  for (let p = 0; p < n; p++) {
    if (!hole[p]) continue;
    out[p * 3] = clamp8(blurred[p * 3]);
    out[p * 3 + 1] = clamp8(blurred[p * 3 + 1]);
    out[p * 3 + 2] = clamp8(blurred[p * 3 + 2]);
  }
  return out;
}

export async function restoreOnPlate(
  render: Buffer, plate: Buffer, mattes: { render: Matte; plate: Matte }
): Promise<{ buffer: Buffer; report: PlateRestoreReport }> {
  const skip = (skipReason: string, coverage = 0) => ({ buffer: render, report: { applied: false, coverage, shiftX: 0, skipReason } });

  const meta = await sharp(render).metadata();
  const W = meta.width || 0, H = meta.height || 0;
  if (W < 64 || H < 64) return skip("render too small");
  const w = WORK_WIDTH, h = Math.round((H * w) / W);

  // sharp hands a resized one-channel raw back with three channels; keep
  // every alpha strictly one byte per pixel
  const gray = async (s: sharp.Sharp) => {
    const { data, info } = await s.raw().toBuffer({ resolveWithObject: true });
    if (info.channels === 1) return data;
    const one = Buffer.alloc(info.width * info.height);
    for (let p = 0; p < one.length; p++) one[p] = data[p * info.channels];
    return one;
  };
  const raw1 = (m: Matte) => sharp(m.alpha, { raw: { width: m.width, height: m.height, channels: 1 } });
  const [alphaRSmall, alphaPSmall] = await Promise.all(
    [mattes.render, mattes.plate].map((m) => gray(raw1(m).resize(w, h, { fit: "fill" })))
  );

  let figurePx = 0;
  for (let i = 0; i < alphaRSmall.length; i++) if (alphaRSmall[i] >= 128) figurePx++;
  const coverage = figurePx / (w * h);
  if (coverage < 0.02) return skip("matte found no figure in the render", coverage);
  if (coverage > 0.9) return skip("matte called the whole render figure", coverage);

  const shiftSmall = horizontalShift(figureBox(alphaRSmall, w, h), figureBox(alphaPSmall, w, h), w);
  const shiftX = Math.round((shiftSmall * W) / w);

  // the plate without its model: everything the plate's matte touches, grown
  // a little past the soft edge, is a hole filled from the sweep around it
  const holeSmall = new Uint8Array(w * h);
  for (let i = 0; i < holeSmall.length; i++) holeSmall[i] = alphaPSmall[i] >= 24 ? 255 : 0;
  const hole = grow(holeSmall, w, h, Math.max(2, Math.round(h * 0.012)));
  const plateSmall = await sharp(plate).resize(w, h, { fit: "fill" }).removeAlpha().raw().toBuffer();
  const fillSmall = fillHole(plateSmall, hole, w, h);

  const up = (px: Uint8Array | Buffer, channels: 1 | 3, extra?: (s: sharp.Sharp) => sharp.Sharp) => {
    let s = sharp(Buffer.from(px.buffer, px.byteOffset, px.byteLength), { raw: { width: w, height: h, channels } });
    if (extra) s = extra(s);
    return s.resize(W, H, { fit: "fill", kernel: "lanczos3" }).raw().toBuffer({ resolveWithObject: true });
  };
  const [fill, holeSoft, plateFull, alphaR, rgb] = await Promise.all([
    up(fillSmall, 3),
    up(hole, 1, (s) => s.blur(2)),
    sharp(plate).resize(W, H, { fit: "fill", kernel: "lanczos3" }).removeAlpha().raw().toBuffer(),
    gray(raw1(mattes.render).resize(W, H, { fit: "fill", kernel: "lanczos3" })),
    sharp(render).removeAlpha().raw().toBuffer(),
  ]);
  const hStride = holeSoft.info.channels;

  // backdrop: the plate, with the fill feathered in over the hole
  const out = Buffer.from(plateFull);
  for (let p = 0; p < W * H; p++) {
    const t = holeSoft.data[p * hStride];
    if (t === 0) continue;
    const o = p * 3;
    if (t === 255) { out[o] = fill.data[o]; out[o + 1] = fill.data[o + 1]; out[o + 2] = fill.data[o + 2]; continue; }
    const k = t / 255, u = 1 - k;
    out[o] = Math.round(out[o] * u + fill.data[o] * k);
    out[o + 1] = Math.round(out[o + 1] * u + fill.data[o + 1] * k);
    out[o + 2] = Math.round(out[o + 2] * u + fill.data[o + 2] * k);
  }

  // figure over backdrop, moved by shiftX, through the matte's own edge
  for (let y = 0; y < H; y++) {
    const row = y * W;
    const xStart = Math.max(0, shiftX), xEnd = Math.min(W, W + shiftX);
    for (let x = xStart; x < xEnd; x++) {
      const src = row + (x - shiftX);
      const a = alphaR[src];
      if (a === 0) continue;
      const o = (row + x) * 3, s = src * 3;
      if (a === 255) { out[o] = rgb[s]; out[o + 1] = rgb[s + 1]; out[o + 2] = rgb[s + 2]; continue; }
      const k = a / 255, u = 1 - k;
      out[o] = Math.round(out[o] * u + rgb[s] * k);
      out[o + 1] = Math.round(out[o + 1] * u + rgb[s + 1] * k);
      out[o + 2] = Math.round(out[o + 2] * u + rgb[s + 2] * k);
    }
  }
  const buffer = await sharp(out, { raw: { width: W, height: H, channels: 3 } }).jpeg({ quality: 95, mozjpeg: true }).toBuffer();
  return { buffer, report: { applied: true, coverage, shiftX } };
}

function clamp8(v: number): number { return v < 0 ? 0 : v > 255 ? 255 : Math.round(v); }

/** Separable box blur on an interleaved float buffer, edge-clamped. */
function boxBlur(src: Float32Array, width: number, height: number, ch: number, r: number): Float32Array {
  const tmp = new Float32Array(src.length);
  const out = new Float32Array(src.length);
  const n = 2 * r + 1;
  for (let c = 0; c < ch; c++) {
    for (let y = 0; y < height; y++) {
      const base = y * width;
      let sum = 0;
      for (let k = -r; k <= r; k++) sum += src[(base + Math.min(width - 1, Math.max(0, k))) * ch + c];
      for (let x = 0; x < width; x++) {
        tmp[(base + x) * ch + c] = sum / n;
        const add = Math.min(width - 1, x + r + 1), drop = Math.max(0, x - r);
        sum += src[(base + add) * ch + c] - src[(base + drop) * ch + c];
      }
    }
    for (let x = 0; x < width; x++) {
      let sum = 0;
      for (let k = -r; k <= r; k++) sum += tmp[(Math.min(height - 1, Math.max(0, k)) * width + x) * ch + c];
      for (let y = 0; y < height; y++) {
        out[(y * width + x) * ch + c] = sum / n;
        const add = Math.min(height - 1, y + r + 1), drop = Math.max(0, y - r);
        sum += tmp[(add * width + x) * ch + c] - tmp[(drop * width + x) * ch + c];
      }
    }
  }
  return out;
}
