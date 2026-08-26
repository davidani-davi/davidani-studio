// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { beforeAll, describe, expect, it } from "vitest";
import {
  FLATLAY_CANVAS,
  FLATLAY_MAX_HEIGHT_RATIO,
  FLATLAY_MAX_WIDTH_RATIO,
} from "./flatlay-spec";
import { STUDIO_BACKGROUND_RGB } from "./studio-background";

/**
 * The canvas assets are prompt inputs, not decoration.
 *
 * In preserve mode the canvas at image_urls[0] IS the composition authority —
 * the prompt tells the model to match its framing exactly — so a canvas that
 * is off-centre teaches every render in that category to be off-centre, and no
 * amount of prompt text corrects it. Four of the six shipped off-centre:
 * outerwear-front by 11.5px, outerwear-back by 10.5px, dress-front by 6px,
 * skirt-front by 1px. Outerwear is the category the camo jacket routes to.
 *
 * Measuring the assets in CI is the only thing that keeps this honest. A
 * constant in flatlay-spec.ts asserts what the framing should be; this asserts
 * that the PNGs actually do it.
 */

const DIR = path.join(process.cwd(), "public", "product-shots");

/** Canvases whose framing is claimed to be approved. */
const CANVASES = [
  "canvas-dress-front",
  "canvas-outerwear-back",
  "canvas-outerwear-front",
  "canvas-set-front",
  "canvas-skirt-front",
  "canvas-top-front",
];

interface Measured {
  width: number;
  height: number;
  left: number;
  right: number;
  top: number;
  bottom: number;
  spanW: number;
  spanH: number;
}

/**
 * Per-channel deviation from the studio background above which a pixel counts
 * as subject.
 *
 * 8 because that is the threshold the spec in flatlay-spec.ts was derived at,
 * and a conformance test measured differently from the thing it conforms to is
 * not a test. It matters: these assets carry a soft anti-aliased halo, so
 * style-reference-9 spans 82.50% at this threshold and 84.35% at zero. Only
 * the first is comparable to FLATLAY_MAX_WIDTH_RATIO.
 */
const SUBJECT_THRESHOLD = 8;

/** Bounding box of everything that reads as subject rather than backdrop. */
async function measure(name: string): Promise<Measured> {
  const { data, info } = await sharp(path.join(DIR, `${name}.png`))
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const { r, g, b } = STUDIO_BACKGROUND_RGB;

  let left = width;
  let right = -1;
  let top = height;
  let bottom = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * channels;
      const dev = Math.max(
        Math.abs(data[i] - r),
        Math.abs(data[i + 1] - g),
        Math.abs(data[i + 2] - b)
      );
      if (dev <= SUBJECT_THRESHOLD) continue;
      if (x < left) left = x;
      if (x > right) right = x;
      if (y < top) top = y;
      if (y > bottom) bottom = y;
    }
  }
  expect(right, `${name} has no subject`).toBeGreaterThan(-1);
  return {
    width,
    height,
    left,
    right: width - 1 - right,
    top,
    bottom: height - 1 - bottom,
    spanW: (right - left + 1) / width,
    spanH: (bottom - top + 1) / height,
  };
}

const measured = new Map<string, Measured>();

beforeAll(async () => {
  for (const name of CANVASES) measured.set(name, await measure(name));
}, 60_000);

describe.each(CANVASES)("%s", (name) => {
  it("renders at the canonical canvas size", () => {
    const m = measured.get(name)!;
    expect({ width: m.width, height: m.height }).toEqual({ ...FLATLAY_CANVAS });
  });

  it("is horizontally centred to within half a pixel", () => {
    // The comp is centred to 0.5px (L = R = 189 exactly), so this is the one
    // axis where the standard is unambiguous. Four assets failed it when this
    // test was written: outerwear-front by 11.5px, outerwear-back by 10.5px,
    // dress-front by 6px, skirt-front by 1px. All four were re-centred by
    // integer translation, which is lossless here because the vacated columns
    // were pure backdrop.
    const m = measured.get(name)!;
    expect(Math.abs(m.right - m.left) / 2).toBeLessThanOrEqual(0.5);
  });

  it("stays inside the measured safe area on both axes", () => {
    const m = measured.get(name)!;
    // canvas-top-front measures 82.96% against the comp's 82.50%, and
    // dress-front 76.11% against its own 76%. Both are approved assets that
    // predate the spec, so the tolerance admits them rather than the spec
    // being loosened to match — the comp stays the tighter authority.
    expect(m.spanW).toBeLessThanOrEqual(FLATLAY_MAX_WIDTH_RATIO + 0.005);
    expect(m.spanH).toBeLessThanOrEqual(FLATLAY_MAX_HEIGHT_RATIO + 0.002);
  });

  it("sits close to the vertical centre", () => {
    // Two-sided on purpose. The first version of this asserted a one-sided
    // upward bias, which the library disproves: the sign tracks which axis
    // binds. Width-bound canvases sit 8-10px ABOVE centre (top-front +9.5,
    // style-reference-9 +8, outerwear-back +7.5); height-bound canvases sit
    // 12-14px BELOW it (dress-front -12.5, set-front -13.5, skirt-front -14).
    // Nothing in the comp explains the split, so it is treated as house style
    // and only gross drift is caught.
    const m = measured.get(name)!;
    expect(Math.abs(m.bottom - m.top) / 2).toBeLessThanOrEqual(0.01 * m.height);
  });
});

describe("the empty sweep", () => {
  it("is exactly the studio background on every pixel", async () => {
    // Back mode sends this as the background authority. If it is not flat,
    // nothing downstream can be.
    const file = path.join(DIR, "studio-backdrop-empty.png");
    expect(fs.existsSync(file)).toBe(true);
    const { data, info } = await sharp(file).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const { r, g, b } = STUDIO_BACKGROUND_RGB;
    let off = 0;
    for (let i = 0; i < data.length; i += info.channels) {
      if (data[i] !== r || data[i + 1] !== g || data[i + 2] !== b) off++;
    }
    expect(off).toBe(0);
  }, 60_000);
});
