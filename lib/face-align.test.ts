import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { findAlignment, warpGenerated } from './face-align';
import { compositeGarment, referencePixels } from './garment-only';

// A textured "head" on a plain backdrop, so the fit has something to lock on to.
function scene(width: number, height: number, cx: number, cy: number, scale = 1) {
  const px = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const X = (x - cx) / scale, Y = (y - cy) / scale, i = (y * width + x) * 4;
    const inHead = (X / 70) ** 2 + (Y / 90) ** 2 < 1;
    const v = inHead ? 140 + 60 * Math.sin(X / 6) * Math.cos(Y / 9) + 30 * Math.sin((X + Y) / 13) : 235;
    px[i] = v; px[i + 1] = inHead ? v * 0.8 : 228; px[i + 2] = inHead ? v * 0.7 : 214; px[i + 3] = 255;
  }
  return px;
}
function faceMask(width: number, height: number, cx: number, cy: number) {
  const m = Buffer.alloc(width * height, 255);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const d = Math.hypot((x - cx) / 80, (y - cy) / 100);
    if (d < 1) m[y * width + x] = 0; else if (d < 1.25) m[y * width + x] = Math.round((d - 1) / 0.25 * 255);
  }
  return m;
}
const png = (px: Buffer, w: number, h: number) => sharp(px, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer();

describe('face alignment before the face is restored', () => {
  const W = 400, H = 600, CX = 200, CY = 220;
  it('finds a generated head that came back smaller and shifted', async () => {
    const ref = await referencePixels(await png(scene(W, H, CX, CY), W, H));
    // Same head, 3% smaller and 14 px left / 7 px up, like the DT70115 renders.
    const gen = scene(W, H, CX - 14, CY - 7, 0.97);
    const { alignment } = findAlignment(ref, gen, faceMask(W, H, CX, CY));
    expect(alignment.applied).toBe(true);
    expect(alignment.scale).toBeCloseTo(0.97, 2);
    expect(Math.abs(alignment.rotationDeg)).toBeLessThan(0.5);
    expect(alignment.scoreAfter).toBeGreaterThan(alignment.scoreBefore + 0.05);
    // Where the fit says the head centre went.
    expect(Math.abs(alignment.dx - -14)).toBeLessThan(1.5);
    expect(Math.abs(alignment.dy - -7)).toBeLessThan(1.5);
  });
  it('leaves an already aligned frame alone', async () => {
    const px = scene(W, H, CX, CY);
    const ref = await referencePixels(await png(px, W, H));
    const { alignment } = findAlignment(ref, Buffer.from(px), faceMask(W, H, CX, CY));
    expect(alignment.applied).toBe(false);
    expect(alignment.reason).toBe('already-aligned');
  });
  it('refuses to move the frame when nothing matches', async () => {
    const ref = await referencePixels(await png(scene(W, H, CX, CY), W, H));
    const noise = Buffer.alloc(W * H * 4); for (let i = 0; i < noise.length; i++) noise[i] = i % 4 === 3 ? 255 : (i * 2654435761 >>> 24) & 255;
    const { alignment } = findAlignment(ref, noise, faceMask(W, H, CX, CY));
    expect(alignment.applied).toBe(false);
  });
  it('warps with the identity transform without changing pixels', async () => {
    const px = scene(64, 96, 32, 40);
    expect(warpGenerated(px, 64, 96, 64, 96, { scale: 1, rotationDeg: 0, dx: 0, dy: 0 }, 32, 40).equals(px)).toBe(true);
  });
  it('restores the original face exactly and reports the alignment', async () => {
    const ref = await referencePixels(await png(scene(W, H, CX, CY), W, H));
    const mask = faceMask(W, H, CX, CY);
    const generated = await png(scene(W, H, CX - 14, CY - 7, 0.97), W, H);
    const { png: out, report } = await compositeGarment(ref, generated, mask, { matchSeam: false, align: true });
    expect(report.changedProtectedPixels).toBe(0);
    expect(report.alignment?.applied).toBe(true);
    // Just outside the outline the generated head now lines up with the original one.
    const res = await sharp(out).ensureAlpha().raw().toBuffer();
    let err = 0, n = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x; if (mask[i] === 0 || mask[i] === 255) continue;
      if (((x - CX) / 70) ** 2 + ((y - CY) / 90) ** 2 >= 1) continue;
      err += Math.abs(res[i * 4] - ref.data[i * 4]); n++;
    }
    expect(err / Math.max(n, 1)).toBeLessThan(6);
    const off = await compositeGarment(ref, generated, mask, { matchSeam: false });
    expect(off.report.alignment).toBeUndefined();
  });
});
