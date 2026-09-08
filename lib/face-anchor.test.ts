import { describe, expect, it } from "vitest";
import { locateHead, CROP_SCALE } from "./face-anchor";

const W = 200, H = 400;

/** A figure matte: a head disc on a neck on shoulders and a body. */
function figure(opts: { hair?: boolean } = {}): Uint8Array {
  const m = new Uint8Array(W * H);
  const set = (x: number, y: number) => { if (x >= 0 && x < W && y >= 0 && y < H) m[y * W + x] = 255; };
  // head: disc radius 24 centred at (100, 60) → crown at y 36, chin at y 84
  for (let y = 36; y <= 84; y++) for (let x = 76; x <= 124; x++) if ((x - 100) ** 2 + (y - 60) ** 2 <= 24 * 24) set(x, y);
  // neck: 16 wide, y 84..100
  for (let y = 84; y <= 100; y++) for (let x = 92; x <= 108; x++) set(x, y);
  // shoulders + body: 90 wide from y 100 to 380
  for (let y = 100; y <= 380; y++) for (let x = 55; x <= 145; x++) set(x, y);
  if (opts.hair) for (let y = 40; y <= 160; y++) for (let x = 70; x <= 130; x++) set(x, y); // hair down to the chest
  return m;
}

describe("locateHead", () => {
  it("finds the neck and boxes the head at CROP_SCALE", () => {
    const found = locateHead(figure(), W, H);
    expect(found).not.toBeNull();
    expect(found!.method).toBe("neck");
    const { box } = found!;
    // head height ≈ 48 (36..84) → crop side ≈ 91, centred on (100, 60)
    expect(box.width).toBeGreaterThanOrEqual(Math.round(44 * CROP_SCALE));
    expect(box.width).toBeLessThanOrEqual(Math.round(52 * CROP_SCALE));
    expect(box.left + box.width / 2).toBeGreaterThan(95);
    expect(box.left + box.width / 2).toBeLessThan(105);
    expect(box.top).toBeLessThan(36);
    expect(box.top + box.height).toBeGreaterThan(84);
  });

  it("falls back to a share of the figure when hair hides the neck", () => {
    const found = locateHead(figure({ hair: true }), W, H);
    expect(found).not.toBeNull();
    expect(found!.method).toBe("share");
    const { box } = found!;
    expect(box.top).toBeLessThanOrEqual(36);
    expect(box.top + box.height).toBeGreaterThan(84);
    expect(box.height).toBeLessThan(200);
  });

  it("returns null for an empty matte", () => {
    expect(locateHead(new Uint8Array(W * H), W, H)).toBeNull();
  });
});
