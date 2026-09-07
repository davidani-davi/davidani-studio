import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { measureSubjectX } from "./square-subject";

/** A 400x600 beige sweep with a dark figure whose centre sits at `cx` (0..1). */
async function figureAt(cx: number): Promise<Buffer> {
  const w = 400, h = 600, figW = 120;
  const left = Math.round(cx * w - figW / 2);
  const svg = `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#f1e6da"/><stop offset="1" stop-color="#d9c8b8"/></linearGradient></defs>
    <rect width="${w}" height="${h}" fill="url(#g)"/>
    <rect x="${left}" y="60" width="${figW}" height="500" fill="#3b2f2a"/>
  </svg>`;
  return sharp(Buffer.from(svg)).jpeg().toBuffer();
}

describe("measureSubjectX", () => {
  it("finds a figure standing off to the right", async () => {
    expect(await measureSubjectX(await figureAt(0.68))).toBeCloseTo(0.68, 1);
  });
  it("finds a figure standing off to the left", async () => {
    expect(await measureSubjectX(await figureAt(0.35))).toBeCloseTo(0.35, 1);
  });
  it("falls back to the middle of an empty sweep", async () => {
    const empty = await sharp({ create: { width: 400, height: 600, channels: 3, background: "#e8ddd0" } }).jpeg().toBuffer();
    expect(await measureSubjectX(empty)).toBe(0.5);
  });
});
