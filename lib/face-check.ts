// Looks at a finished Simple render before anyone sees it (2026-11-03).
//
// The protected-pixel report only proves the face pixels were copied back unchanged. It cannot tell
// whether the outline sat on the face or whether the AI's head lined up under it, so two broken renders
// of DJ60275A passed it: a face split across the mouth (the outline stopped at the nose and the AI drew
// her 16% smaller) and the base photo's tank strap pasted over the coat (the outline covered the
// shoulder). Both show up just inside the outline: there the original photo is pasted back, and if the
// AI drew something different under it (a smaller face, a coat instead of a strap), the paste meets the
// AI's frame at a visible seam. A good render matches the original there. The head-match score from
// lib/face-align.ts is the second signal. What the AI drew outside the outline is not judged: a new
// collar or neckline is supposed to differ from the old photo.
import type { Alignment } from './face-align';
import type { ReferencePixels } from './garment-only';

export interface FaceCheck {
  ok: boolean;
  /** Plain-words reasons, shown to the person under the render. Empty when ok. */
  reasons: string[];
  /** Original vs AI head inside the outline (normalised cross-correlation, after any alignment). */
  headMatch?: number;
  /** Share of the band just inside the outline where the AI drew something different from the pasted photo. */
  edgeMismatch: number;
  /** The worst 45° stretch of that band, and where it is. */
  worstEdge: number;
  worstAt: 'top' | 'upper right' | 'right' | 'lower right' | 'bottom' | 'lower left' | 'left' | 'upper left';
  version: 'face-check-v1';
}

/** Cut-offs from 146 team renders (2026-11-03): the 5 broken ones scored 0.48-1.0, the worst good one 0.20. */
export const FACE_CHECK_LIMITS = {
  /** Width of the band just inside the outline, as a share of the image width. */
  ring: 0.03,
  /** Colour distance (0-255) at which a ring pixel counts as different. */
  colourDistance: 36,
  /** Fail when the worst 45° stretch of the ring differs more than this. */
  worstEdge: 0.3,
  /** Fail when the AI head and the original head match less than this. */
  headMatch: 0.6,
};

/** How far a check is from passing: 1 or less passes, lower is better. Picks the better of two renders. */
export function faceBadness(c: FaceCheck, limits = FACE_CHECK_LIMITS): number {
  const head = c.headMatch === undefined ? 0 : (1 - c.headMatch) / (1 - limits.headMatch);
  return Math.max(c.worstEdge / limits.worstEdge, head);
}

const SIDES: FaceCheck['worstAt'][] =['right', 'lower right', 'bottom', 'lower left', 'left', 'upper left', 'top', 'upper right'];

/**
 * `candidate` is the AI frame at reference size after alignment (RGBA), `mask` the face mask
 * (0 keeps the original, 255 is the AI frame, the feather in between lies outside the outline).
 */
export function checkFace(ref: ReferencePixels, candidate: Buffer, mask: Buffer, alignment?: Alignment, limits = FACE_CHECK_LIMITS): FaceCheck {
  const { width: w, height: h } = ref;
  const k = Math.max(1, Math.ceil(w / 360)), W = Math.floor(w / k), H = Math.floor(h / k);
  // Low-resolution grid: mean colour of original and AI frame; `kept` = every pixel is the original (mask 0).
  const a = new Float32Array(W * H * 3), b = new Float32Array(W * H * 3);
  const kept = new Uint8Array(W * H);
  for (let Y = 0; Y < H; Y++) for (let X = 0; X < W; X++) {
    let sr = 0, sg = 0, sb = 0, tr = 0, tg = 0, tb = 0, all = 1;
    for (let y = Y * k; y < Y * k + k; y++) for (let x = X * k; x < X * k + k; x++) {
      const i = y * w + x, p = i * 4;
      sr += ref.data[p]; sg += ref.data[p + 1]; sb += ref.data[p + 2];
      tr += candidate[p]; tg += candidate[p + 1]; tb += candidate[p + 2];
      if (mask[i]) all = 0;
    }
    const n = k * k, o = (Y * W + X) * 3;
    a[o] = sr / n; a[o + 1] = sg / n; a[o + 2] = sb / n; b[o] = tr / n; b[o + 1] = tg / n; b[o + 2] = tb / n;
    kept[Y * W + X] = all;
  }
  // Chamfer distance (in low-res pixels) of each kept cell from the AI side of the outline.
  const INF = 1e9, d = new Float32Array(W * H);
  for (let i = 0; i < d.length; i++) d[i] = kept[i] ? INF : 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x; if (!d[i]) continue;
    if (x) d[i] = Math.min(d[i], d[i - 1] + 1); if (y) d[i] = Math.min(d[i], d[i - W] + 1);
    if (x && y) d[i] = Math.min(d[i], d[i - W - 1] + 1.414); if (y && x < W - 1) d[i] = Math.min(d[i], d[i - W + 1] + 1.414);
  }
  for (let y = H - 1; y >= 0; y--) for (let x = W - 1; x >= 0; x--) {
    const i = y * W + x; if (!d[i]) continue;
    if (x < W - 1) d[i] = Math.min(d[i], d[i + 1] + 1); if (y < H - 1) d[i] = Math.min(d[i], d[i + W] + 1);
    if (x < W - 1 && y < H - 1) d[i] = Math.min(d[i], d[i + W + 1] + 1.414); if (y < H - 1 && x) d[i] = Math.min(d[i], d[i + W - 1] + 1.414);
  }
  let cx = 0, cy = 0, m = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (kept[y * W + x]) { cx += x; cy += y; m++; }
  const none: FaceCheck = { ok: true, reasons: [], edgeMismatch: 0, worstEdge: 0, worstAt: 'top', version: 'face-check-v1' };
  if (!m) return none;
  cx /= m; cy /= m;
  const reach = Math.max(2, limits.ring * W), bins = 16;
  const total = new Float64Array(bins), off = new Float64Array(bins);
  let ring = 0, different = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (!kept[i] || d[i] > reach) continue;
    const o = i * 3, dist = Math.hypot(a[o] - b[o], a[o + 1] - b[o + 1], a[o + 2] - b[o + 2]) / Math.sqrt(3);
    const bin = Math.floor(((Math.atan2(y - cy, x - cx) / (2 * Math.PI) + 1) % 1) * bins) % bins;
    total[bin]++; ring++;
    if (dist > limits.colourDistance) { off[bin]++; different++; }
  }
  // Worst 45° stretch (two adjacent 22.5° bins) with enough ring to judge.
  let worstEdge = 0, worstBin = 0;
  const enough = ring / bins / 4;
  for (let i = 0; i < bins; i++) {
    const j = (i + 1) % bins, t = total[i] + total[j];
    if (t < enough) continue;
    const v = (off[i] + off[j]) / t;
    if (v > worstEdge) { worstEdge = v; worstBin = i; }
  }
  const worstAt = SIDES[Math.floor(((worstBin + 1) % bins) / 2)];
  const headMatch = alignment && alignment.reason !== 'no-region'
    ? +(alignment.applied ? alignment.scoreAfter : alignment.scoreBefore).toFixed(4) : undefined;
  const reasons: string[] = [];
  if (headMatch !== undefined && headMatch < limits.headMatch)
    reasons.push(alignment?.reason === 'out-of-range'
      ? 'The AI drew the model at a different size or place, so the real face does not line up with the head.'
      : 'The AI head does not line up with the real face.');
  if (worstEdge > limits.worstEdge)
    reasons.push(`The real face does not join the new image cleanly (${worstAt} of the face): look for a cut through the face, doubled hair, or the old clothes showing.`);
  return { ok: !reasons.length, reasons, ...(headMatch !== undefined ? { headMatch } : {}),
    edgeMismatch: +(ring ? different / ring : 0).toFixed(4), worstEdge: +worstEdge.toFixed(4), worstAt, version: 'face-check-v1' };
}
