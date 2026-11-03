import { describe, it, expect } from 'vitest';
import { checkFace, faceBadness } from './face-check';
import type { Alignment } from './face-align';
import type { ReferencePixels } from './garment-only';

const W = 360, H = 540;
// The face: kept (mask 0) inside this box, AI frame (255) everywhere else.
const BOX = { x0: 120, x1: 240, y0: 60, y1: 200 };

function photo(seed = 1): ReferencePixels {
  const data = Buffer.alloc(W * H * 4);
  let s = seed;
  for (let i = 0; i < W * H; i++) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    const v = 60 + (s % 120);
    data[i * 4] = v; data[i * 4 + 1] = v * 0.8; data[i * 4 + 2] = v * 0.6; data[i * 4 + 3] = 255;
  }
  return { data, width: W, height: H, sha256: 'test' };
}
function faceMask() {
  const m = Buffer.alloc(W * H, 255);
  for (let y = BOX.y0; y < BOX.y1; y++) for (let x = BOX.x0; x < BOX.x1; x++) m[y * W + x] = 0;
  return m;
}
/** The AI frame with a stretch just inside the outline drawn differently (old strap, doubled hair). */
function paint(src: Buffer, x0: number, x1: number, y0: number, y1: number) {
  const out = Buffer.from(src);
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const p = (y * W + x) * 4; out[p] = 250; out[p + 1] = 250; out[p + 2] = 250; }
  return out;
}
const aligned = (score: number, reason?: Alignment['reason']): Alignment =>
  ({ applied: !reason, scale: 1, rotationDeg: 0, dx: 0, dy: 0, scoreBefore: score, scoreAfter: score, maxShiftPx: 0, reason });

describe('checkFace', () => {
  it('passes when the AI drew the same thing under the outline', () => {
    const ref = photo();
    const c = checkFace(ref, Buffer.from(ref.data), faceMask(), aligned(0.97));
    expect(c).toMatchObject({ ok: true, reasons: [], worstEdge: 0, headMatch: 0.97, version: 'face-check-v1' });
  });

  it('ignores what the AI changed outside the outline (a new collar is supposed to differ)', () => {
    const ref = photo();
    const c = checkFace(ref, paint(ref.data, 0, W, BOX.y1, H), faceMask(), aligned(0.95));
    expect(c.ok).toBe(true);
  });

  it('flags a seam on one side and says where', () => {
    const ref = photo();
    const c = checkFace(ref, paint(ref.data, BOX.x1 - 12, BOX.x1, BOX.y0 + 30, BOX.y1 - 30), faceMask(), aligned(0.95));
    expect(c.ok).toBe(false);
    expect(c.worstAt).toBe('right');
    expect(c.worstEdge).toBeGreaterThan(0.5);
    expect(c.reasons).toEqual([expect.stringContaining('(right of the face)')]);
  });

  it('flags a head the AI drew at another size or place', () => {
    const ref = photo();
    const moved = checkFace(ref, Buffer.from(ref.data), faceMask(), aligned(0.4, 'out-of-range'));
    expect(moved.ok).toBe(false);
    expect(moved.reasons[0]).toMatch(/different size or place/);
    const off = checkFace(ref, Buffer.from(ref.data), faceMask(), aligned(0.45));
    expect(off.reasons[0]).toMatch(/does not line up/);
  });

  it('has nothing to judge when nothing is kept', () => {
    const ref = photo();
    expect(checkFace(ref, Buffer.from(ref.data), Buffer.alloc(W * H, 255))).toMatchObject({ ok: true, worstEdge: 0 });
  });

  it('ranks two attempts: the cleaner join wins', () => {
    const ref = photo(), mask = faceMask();
    const bad = checkFace(ref, paint(ref.data, BOX.x0, BOX.x1, BOX.y0, BOX.y0 + 12), mask, aligned(0.9));
    const good = checkFace(ref, Buffer.from(ref.data), mask, aligned(0.9));
    expect(faceBadness(good)).toBeLessThan(1);
    expect(faceBadness(bad)).toBeGreaterThan(1);
    expect(bad.worstAt).toBe('top');
  });
});
