import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { figureBox, fillHole, grow, horizontalShift, restoreOnPlate } from "./plate-restore";

const W = 80, H = 120;

/** A one-channel mask with a filled rectangle. */
function rect(x0: number, x1: number, y0: number, y1: number, w = W, h = H): Uint8Array {
  const m = new Uint8Array(w * h);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) m[y * w + x] = 255;
  return m;
}

describe("figureBox / horizontalShift", () => {
  it("boxes the matte and moves the render's centre onto the plate's", () => {
    const render = figureBox(rect(8, 27, 20, 100), W, H);
    const plate = figureBox(rect(20, 39, 20, 100), W, H);
    expect(render).toEqual({ x0: 8, x1: 27, y0: 20, y1: 100 });
    expect(horizontalShift(render, plate, W)).toBe(12);
    expect(horizontalShift(plate, render, W)).toBe(-12);
  });

  it("does not move a figure that runs into a side of the frame, or an implausible distance", () => {
    const cut = figureBox(rect(0, 19, 20, 100), W, H);
    const plate = figureBox(rect(30, 49, 20, 100), W, H);
    expect(horizontalShift(cut, plate, W)).toBe(0);
    // 4..11 vs 66..73: 62px on an 80px frame is more than a fifth
    expect(horizontalShift(figureBox(rect(4, 11, 20, 100), W, H), figureBox(rect(66, 73, 20, 100), W, H), W)).toBe(0);
    expect(horizontalShift(null, plate, W)).toBe(0);
  });
});

describe("fillHole", () => {
  it("continues a vertical gradient through the hole", () => {
    const rgb = new Uint8Array(W * H * 3);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const v = 150 + Math.round(y * 0.8); rgb.set([v, v, v], (y * W + x) * 3); }
    const hole = grow(rect(30, 49, 20, 100), W, H, 1);
    const out = fillHole(rgb, hole, W, H);
    // inside the hole the fill tracks the row's gradient, within the blur's reach
    const mid = (60 * W + 40) * 3;
    expect(Math.abs(out[mid] - 198)).toBeLessThanOrEqual(4);
    // outside the hole nothing is black and the trend is preserved
    expect(out[(10 * W + 2) * 3]).toBeLessThan(out[(110 * W + 2) * 3]);
  });
});

describe("restoreOnPlate", () => {
  const png = (r: number, g: number, b: number, mark?: { x: number; w: number; rgb: [number, number, number] }) => {
    const buf = Buffer.alloc(W * H * 3);
    for (let p = 0; p < W * H; p++) {
      const x = p % W;
      const inMark = mark && x >= mark.x && x < mark.x + mark.w;
      buf.set(inMark ? mark.rgb : [r, g, b], p * 3);
    }
    return sharp(buf, { raw: { width: W, height: H, channels: 3 } }).png().toBuffer();
  };
  const matte = (x0: number, x1: number) => ({ alpha: Buffer.from(rect(x0, x1, 0, H - 1)), width: W, height: H });

  it("puts the render's figure on the plate's backdrop, re-centred", async () => {
    // the render: a blue figure at x 8..27 on a grey backdrop; the plate: cream, model at x 20..39
    const render = await png(120, 120, 120, { x: 8, w: 20, rgb: [0, 0, 255] });
    const plate = await png(240, 230, 220, { x: 20, w: 20, rgb: [90, 60, 40] });
    const { buffer, report } = await restoreOnPlate(render, plate, { render: matte(8, 27), plate: matte(20, 39) });
    expect(report.applied).toBe(true);
    expect(report.shiftX).toBe(12);
    const { data } = await sharp(buffer).raw().toBuffer({ resolveWithObject: true });
    const px = (x: number, y: number) => Array.from(data.subarray((y * W + x) * 3, (y * W + x) * 3 + 3));
    // the figure landed where the plate's model stood
    expect(px(30, 60)[2]).toBeGreaterThan(200);
    expect(px(30, 60)[0]).toBeLessThan(60);
    // the render's grey backdrop is gone: the corners are the plate's cream
    expect(px(2, 2)[0]).toBeGreaterThan(225);
    expect(px(77, 117)[0]).toBeGreaterThan(225);
    // and where the render's figure stood there is now the plate's sweep
    expect(px(10, 60)[0]).toBeGreaterThan(200);
  });

  it("declines when the matte has no figure", async () => {
    const render = await png(120, 120, 120);
    const plate = await png(240, 230, 220);
    const empty = { alpha: Buffer.alloc(W * H), width: W, height: H };
    const { report } = await restoreOnPlate(render, plate, { render: empty, plate: empty });
    expect(report.applied).toBe(false);
    expect(report.skipReason).toMatch(/no figure/);
  });
});
