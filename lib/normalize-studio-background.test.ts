// @vitest-environment node
// sharp is a native Node binding operating on Buffers; the project-wide jsdom
// environment gives these tests a different global realm and corrupts the
// raw-pixel round-trip.
import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { computeBackgroundMask, normalizeStudioBackground } from "./normalize-studio-background";
import { STUDIO_BACKGROUND_RGB } from "./studio-background";

/** Build a raw RGB buffer from a per-pixel color function. */
function makeImage(
  width: number,
  height: number,
  color: (x: number, y: number) => [number, number, number]
): { data: Uint8Array; width: number; height: number; channels: number } {
  const data = new Uint8Array(width * height * 3);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b] = color(x, y);
      const i = (y * width + x) * 3;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
    }
  }
  return { data, width, height, channels: 3 };
}

/** The drifted backdrop measured on a real run: cool and ~15 levels dark. */
const DRIFTED: [number, number, number] = [0xdf, 0xe2, 0xe9];
const GARMENT: [number, number, number] = [0x2b, 0x3a, 0x5c];
const WHITE_TRIM: [number, number, number] = [0xfa, 0xfa, 0xf8];

/**
 * Drifted backdrop with a centered dark garment block covering the middle
 * quarter of the frame, so coverage works out to 75% at any size.
 */
function studioShot(width = 60, height = 80) {
  const inGarment = (x: number, y: number) =>
    x >= width * 0.25 && x < width * 0.75 && y >= height * 0.25 && y < height * 0.75;
  return makeImage(width, height, (x, y) => (inGarment(x, y) ? GARMENT : DRIFTED));
}

describe("computeBackgroundMask", () => {
  it("classifies the drifted backdrop and leaves the garment alone", () => {
    const { data, width, height, channels } = studioShot();
    const result = computeBackgroundMask(data, width, height, channels);

    expect(result.applied).toBe(true);
    expect(result.sampled).toEqual({ r: 0xdf, g: 0xe2, b: 0xe9 });

    // 30x40 garment inside 60x80 => garment is a quarter of the frame.
    expect(result.coverage).toBeCloseTo(0.75, 2);

    const at = (x: number, y: number) => result.mask[y * width + x];
    expect(at(0, 0)).toBe(255); // corner is backdrop
    expect(at(width >> 1, height >> 1)).toBe(0); // garment center is not
  });

  it("does not reach a light detail enclosed by the garment", () => {
    // The failure mode a global near-neutral color test would have: white
    // scalloped pocket trim sitting inside a dark garment reads as "close to
    // the backdrop color" but must not be recolored.
    const width = 60;
    const height = 80;
    const inGarment = (x: number, y: number) => x >= 15 && x < 45 && y >= 20 && y < 60;
    const inTrim = (x: number, y: number) => x >= 25 && x < 35 && y >= 30 && y < 40;
    const { data, channels } = makeImage(width, height, (x, y) => {
      if (inTrim(x, y)) return WHITE_TRIM;
      if (inGarment(x, y)) return GARMENT;
      return DRIFTED;
    });

    const result = computeBackgroundMask(data, width, height, channels);

    expect(result.applied).toBe(true);
    expect(result.mask[35 * width + 30]).toBe(0); // enclosed trim survives
    expect(result.mask[0]).toBe(255); // backdrop still filled
  });

  it("declines a dark background rather than flattening it", () => {
    const { data, width, height, channels } = makeImage(40, 40, () => [0x22, 0x24, 0x28]);
    const result = computeBackgroundMask(data, width, height, channels);

    expect(result.applied).toBe(false);
    expect(result.skipReason).toMatch(/too dark/);
  });

  it("declines a saturated non-neutral background", () => {
    // A deliberately colored backdrop is not drift; leave it be. Bright
    // enough to clear the brightness guard, so it can only trip on chroma.
    const { data, width, height, channels } = makeImage(40, 40, () => [0xff, 0xe4, 0xc4]);
    const result = computeBackgroundMask(data, width, height, channels);

    expect(result.applied).toBe(false);
    expect(result.skipReason).toMatch(/not neutral/);
  });

  it("declines when the fill would swallow the whole frame", () => {
    const { data, width, height, channels } = makeImage(40, 40, () => DRIFTED);
    const result = computeBackgroundMask(data, width, height, channels);

    expect(result.applied).toBe(false);
    expect(result.skipReason).toMatch(/swallowed the frame/);
  });
});

describe("normalizeStudioBackground", () => {
  it("snaps the backdrop to exactly #edeeee end to end", async () => {
    const { data, width, height } = studioShot(120, 160);
    const png = await sharp(Buffer.from(data), { raw: { width, height, channels: 3 } })
      .png()
      .toBuffer();

    const result = await normalizeStudioBackground(png, "png");
    expect(result.applied).toBe(true);

    const { data: out, info } = await sharp(result.buffer)
      .raw()
      .toBuffer({ resolveWithObject: true });
    const px = (x: number, y: number) => {
      const i = (y * info.width + x) * info.channels;
      return [out[i], out[i + 1], out[i + 2]];
    };

    const { r, g, b } = STUDIO_BACKGROUND_RGB;
    // Corners sit far from the feathered edge, so they must be exact.
    for (const [x, y] of [
      [0, 0],
      [info.width - 1, 0],
      [0, info.height - 1],
      [info.width - 1, info.height - 1],
    ]) {
      expect(px(x, y)).toEqual([r, g, b]);
    }

    // The garment center is untouched.
    expect(px(60, 80)).toEqual([...GARMENT]);
  });

  it("returns the input untouched when the guards decline", async () => {
    const { data, width, height } = makeImage(40, 40, () => [0x22, 0x24, 0x28]);
    const png = await sharp(Buffer.from(data), { raw: { width, height, channels: 3 } })
      .png()
      .toBuffer();

    const result = await normalizeStudioBackground(png, "png");

    expect(result.applied).toBe(false);
    expect(result.buffer).toBe(png);
  });
});
