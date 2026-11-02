// GPT Image 2.5 edits do not keep the person exactly where the base photo has them: on Jeonga's
// DT70115 renders (2026-11-02) the head came back 1-3% smaller and 10-20 px off. Restoring the
// original face onto that frame blends two heads that do not line up (doubled hair strands, a
// second jaw edge). This finds the similarity transform that puts the generated head back on the
// original one and resamples the generated frame with it. Original pixels are never moved.
import type { ReferencePixels } from './garment-only';

export interface Alignment {
  applied: boolean;
  scale: number; rotationDeg: number; dx: number; dy: number;
  scoreBefore: number; scoreAfter: number; maxShiftPx: number;
  reason?: 'already-aligned' | 'no-match' | 'out-of-range' | 'no-region';
}
interface Params { s: number; th: number; tx: number; ty: number }
interface Level { w: number; h: number; ref: Float32Array; gen: Float32Array; region: Uint8Array }

const LIMITS = { scale: 0.08, rotationDeg: 4, shift: 0.06 };

function luma(rgba: Buffer | Uint8Array, w: number, h: number) {
  const out = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) out[i] = rgba[i * 4] * 0.299 + rgba[i * 4 + 1] * 0.587 + rgba[i * 4 + 2] * 0.114;
  return out;
}
function half(a: Float32Array, w: number, h: number) {
  const W = w >> 1, H = h >> 1, out = new Float32Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = 2 * y * w + 2 * x;
    out[y * W + x] = (a[i] + a[i + 1] + a[i + w] + a[i + w + 1]) / 4;
  }
  return out;
}
function bilinear(a: Float32Array, w: number, h: number, x: number, y: number) {
  x = Math.min(Math.max(x, 0), w - 1.001); y = Math.min(Math.max(y, 0), h - 1.001);
  const x0 = x | 0, y0 = y | 0, fx = x - x0, fy = y - y0, i = y0 * w + x0;
  return (a[i] * (1 - fx) + a[i + 1] * fx) * (1 - fy) + (a[i + w] * (1 - fx) + a[i + w + 1] * fx) * fy;
}

/** Normalised cross-correlation of the reference region with the warped generated frame. */
function score(L: Level, p: Params, cx: number, cy: number, k: number) {
  const s = p.s, c = Math.cos(p.th) * s, n = Math.sin(p.th) * s, tx = p.tx / k, ty = p.ty / k, ox = cx / k, oy = cy / k;
  let sa = 0, sb = 0, saa = 0, sbb = 0, sab = 0, m = 0;
  for (let y = 0; y < L.h; y++) for (let x = 0; x < L.w; x++) {
    const i = y * L.w + x; if (!L.region[i]) continue;
    const X = x - ox, Y = y - oy;
    const b = bilinear(L.gen, L.w, L.h, c * X - n * Y + ox + tx, n * X + c * Y + oy + ty), a = L.ref[i];
    sa += a; sb += b; saa += a * a; sbb += b * b; sab += a * b; m++;
  }
  if (m < 64) return -1;
  const va = saa - sa * sa / m, vb = sbb - sb * sb / m;
  return va > 0 && vb > 0 ? (sab - sa * sb / m) / Math.sqrt(va * vb) : -1;
}

function bicubicWeights(t: number, out: Float64Array) {
  // Catmull-Rom
  const t2 = t * t, t3 = t2 * t;
  out[0] = -0.5 * t3 + t2 - 0.5 * t; out[1] = 1.5 * t3 - 2.5 * t2 + 1;
  out[2] = -1.5 * t3 + 2 * t2 + 0.5 * t; out[3] = 0.5 * t3 - 0.5 * t2;
}

/** Resample `gen` (gw×gh RGBA) into the reference frame through the found transform. */
export function warpGenerated(gen: Buffer, gw: number, gh: number, width: number, height: number, a: Pick<Alignment, 'scale' | 'rotationDeg' | 'dx' | 'dy'>, cx: number, cy: number) {
  const out = Buffer.alloc(width * height * 4);
  const th = a.rotationDeg * Math.PI / 180, c = Math.cos(th) * a.scale, n = Math.sin(th) * a.scale;
  const kx = gw / width, ky = gh / height, wx = new Float64Array(4), wy = new Float64Array(4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const X = x - cx, Y = y - cy;
    const qx = (c * X - n * Y + cx + a.dx + 0.5) * kx - 0.5, qy = (n * X + c * Y + cy + a.dy + 0.5) * ky - 0.5;
    const x0 = Math.floor(qx), y0 = Math.floor(qy);
    bicubicWeights(qx - x0, wx); bicubicWeights(qy - y0, wy);
    for (let ch = 0; ch < 4; ch++) {
      let v = 0;
      for (let j = 0; j < 4; j++) {
        const yy = Math.min(Math.max(y0 - 1 + j, 0), gh - 1);
        let row = 0;
        for (let i = 0; i < 4; i++) row += gen[(yy * gw + Math.min(Math.max(x0 - 1 + i, 0), gw - 1)) * 4 + ch] * wx[i];
        v += row * wy[j];
      }
      out[(y * width + x) * 4 + ch] = v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
    }
  }
  return out;
}

/**
 * Finds where the generated frame put the protected head. `candidate` is the generated frame
 * already resized to the reference size (RGBA); `mask` is the face mask (0 = keep original).
 * Only pixels inside the outline and its blend band are compared, so the new garment never
 * steers the fit.
 */
export function findAlignment(ref: ReferencePixels, candidate: Buffer, mask: Buffer): { alignment: Alignment; cx: number; cy: number } {
  const { width: w, height: h } = ref;
  let x0 = w, x1 = 0, y0 = h, y1 = 0, sx = 0, sy = 0, m = 0;
  const flag = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (mask[y * w + x] < 255) {
    flag[y * w + x] = 1; m++; sx += x; sy += y;
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  const none: Alignment = { applied: false, scale: 1, rotationDeg: 0, dx: 0, dy: 0, scoreBefore: 0, scoreAfter: 0, maxShiftPx: 0 };
  if (m < 4096) return { alignment: { ...none, reason: 'no-region' }, cx: w / 2, cy: h / 2 };
  const cx = sx / m, cy = sy / m, radius = Math.max(x1 - x0, y1 - y0) / 2;
  // Coarsest level: region about 56 px across.
  const top = Math.max(0, Math.ceil(Math.log2(Math.max(x1 - x0, 1) / 56)));
  const levels: Level[] = [];
  let r = luma(ref.data, w, h), g = luma(candidate, w, h), f = flag, lw = w, lh = h;
  for (let l = 0; l <= top; l++) {
    const region = new Uint8Array(lw * lh);
    for (let i = 0; i < region.length; i++) region[i] = f[i] >= 0.5 ? 1 : 0;
    levels.push({ w: lw, h: lh, ref: r, gen: g, region });
    if (l < top) { r = half(r, lw, lh); g = half(g, lw, lh); f = half(f, lw, lh); lw >>= 1; lh >>= 1; }
  }
  const at = (l: number, p: Params) => score(levels[l], p, cx, cy, 2 ** l);
  // Exhaustive scale + shift search on the coarsest level (no rotation yet).
  const k = 2 ** top, reach = Math.max(k, Math.round(LIMITS.shift * w / k) * k);
  let best: Params = { s: 1, th: 0, tx: 0, ty: 0 }, bestScore = at(top, best);
  for (let s = 1 - LIMITS.scale + 0.02; s <= 1 + LIMITS.scale - 0.02 + 1e-9; s += 0.01)
    for (let ty = -reach; ty <= reach; ty += k) for (let tx = -reach; tx <= reach; tx += k) {
      const p = { s, th: 0, tx, ty }, v = at(top, p);
      if (v > bestScore) { bestScore = v; best = p; }
    }
  // Pattern search, coarse to fine, including rotation.
  for (let l = top; l >= 0; l--) {
    const kk = 2 ** l;
    let step = { s: kk / radius, th: kk / radius, t: kk }, cur = at(l, best);
    for (let it = 0; it < 80 && step.t >= kk / 4; it++) {
      let moved = false;
      for (const [key, d] of [['s', step.s], ['th', step.th], ['tx', step.t], ['ty', step.t]] as const)
        for (const sign of [1, -1]) {
          const p = { ...best, [key]: best[key] + sign * d }, v = at(l, p);
          if (v > cur + 1e-6) { cur = v; best = p; moved = true; }
        }
      if (!moved) step = { s: step.s / 2, th: step.th / 2, t: step.t / 2 };
    }
  }
  const before = at(0, { s: 1, th: 0, tx: 0, ty: 0 }), after = at(0, best);
  const corners = [[x0, y0], [x1, y0], [x0, y1], [x1, y1]].map(([x, y]) => {
    const X = x - cx, Y = y - cy, c = Math.cos(best.th) * best.s, n = Math.sin(best.th) * best.s;
    return Math.hypot(c * X - n * Y + cx + best.tx - x, n * X + c * Y + cy + best.ty - y);
  });
  const alignment: Alignment = { applied: false, scale: +best.s.toFixed(4), rotationDeg: +(best.th * 180 / Math.PI).toFixed(3),
    dx: +best.tx.toFixed(2), dy: +best.ty.toFixed(2), scoreBefore: +before.toFixed(4), scoreAfter: +after.toFixed(4),
    maxShiftPx: +Math.max(...corners).toFixed(2) };
  if (Math.abs(best.s - 1) > LIMITS.scale || Math.abs(alignment.rotationDeg) > LIMITS.rotationDeg ||
      Math.hypot(best.tx, best.ty) > LIMITS.shift * w) return { alignment: { ...alignment, reason: 'out-of-range' }, cx, cy };
  if (after < 0.5 || after < before + 0.005) return { alignment: { ...alignment, reason: alignment.maxShiftPx < 1 ? 'already-aligned' : 'no-match' }, cx, cy };
  if (alignment.maxShiftPx < 1) return { alignment: { ...alignment, reason: 'already-aligned' }, cx, cy };
  return { alignment: { ...alignment, applied: true }, cx, cy };
}
