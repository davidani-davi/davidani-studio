import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import {
  canvasForGarment,
  coveredCategories,
  inferCategory,
  resolveCanvas,
  type GarmentCategory,
} from "./canvas-registry";
import { STUDIO_BACKDROP_PATH, STUDIO_BACKGROUND_RGB } from "./studio-background";

const pub = (p: string) => join(process.cwd(), "public", p);

describe("category inference", () => {
  it.each<[string, GarmentCategory]>([
    ["boxy black cotton bomber jacket", "outerwear"],
    ["cropped leather moto jacket", "outerwear"],
    ["grey wool varsity letterman", "outerwear"],
    ["oversized fuzzy knit baby blue cardigan", "top"],
    ["cropped white ribbed cotton tank top", "top"],
    ["blue striped sleeveless vest", "top"],
    ["floral print cotton maxi dress", "dress"],
    ["denim pinafore jumpsuit", "dress"],
    ["brown pleated chiffon maxi skirt", "skirt"],
    ["barrel-fit dark indigo denim jeans", "pants"],
    ["wide-leg hot pink leopard print sweatpants", "pants"],
    ["grey cotton two-piece set", "set"],
  ])("classifies %s", (text, expected) => {
    expect(inferCategory(text)).toBe(expected);
  });

  // First-match ordering is load-bearing; these are the collisions it resolves.
  it("reads 'denim jacket' as outerwear, not pants", () => {
    expect(inferCategory("oversized washed denim jacket")).toBe("outerwear");
  });

  it("reads 'shirt dress' as a dress, not a top", () => {
    expect(inferCategory("striped cotton shirt dress")).toBe("dress");
  });

  // The reverse collision: here the modifier names the wrong category and the
  // head noun is right. Measured on IMG_7755, a button-down that vision called
  // a "dress shirt" and that routed to the maxi dress canvas as a result.
  it("reads 'dress shirt' as a top, not a dress", () => {
    expect(inferCategory("a lavender ribbed cotton dress shirt with burgundy piping")).toBe(
      "top"
    );
    expect(inferCategory("crisp white dress shirts")).toBe("top");
  });

  it("reads 'dress pants' as pants, not a dress", () => {
    expect(inferCategory("charcoal wool dress pants")).toBe("pants");
    expect(inferCategory("navy dress trousers")).toBe("pants");
  });

  // The compound list must not swallow the plain cases it sits in front of.
  it("still reads an ordinary dress as a dress", () => {
    expect(inferCategory("a floral cotton midi dress")).toBe("dress");
    expect(inferCategory("striped cotton shirt dress")).toBe("dress");
  });

  it("reads a matching set as a set, not its component piece", () => {
    expect(inferCategory("matching set of a knit top and a mini skirt")).toBe("set");
  });

  it("does not read 'short sleeve' as shorts", () => {
    expect(inferCategory("white short sleeve cotton tee")).toBe("top");
  });

  it("returns unknown rather than guessing", () => {
    expect(inferCategory("hand-beaded ceremonial garment")).toBe("unknown");
    expect(inferCategory("")).toBe("unknown");
  });
});

describe("category trust gates the canvas", () => {
  // An approved canvas is a garment, and "preserve" mode tells the model to
  // match its composition. On a wrong category it replaces the product rather
  // than framing it — IMG_7756, a camo-yoke shirt filed as outerwear, came
  // back as the bomber that is on canvas-outerwear-front.
  it("declines the approved canvas when only the photo named the category", () => {
    const choice = resolveCanvas("outerwear", "front", "inferred");
    expect(choice.isFallback).toBe(true);
    expect(choice.mode).toBe("backdrop");
    expect(choice.fallbackReason).toBe("category-inferred");
    // The category is still reported, so the rail can name what was declined.
    expect(choice.category).toBe("outerwear");
  });

  it("spends the canvas when the ERP or a style code asserted the category", () => {
    const choice = resolveCanvas("outerwear", "front", "asserted");
    expect(choice.isFallback).toBe(false);
    expect(choice.mode).toBe("preserve");
    expect(choice.fallbackReason).toBeUndefined();
  });

  it("defaults to asserted so existing callers are unchanged", () => {
    expect(resolveCanvas("outerwear", "front")).toEqual(
      resolveCanvas("outerwear", "front", "asserted")
    );
  });

  // The two fallbacks are different facts: one is a shoot to schedule, the
  // other is a style number to type in.
  it("distinguishes a missing flat lay from a distrusted category", () => {
    expect(resolveCanvas("pants", "front", "asserted").fallbackReason).toBe("no-canvas");
    expect(resolveCanvas("pants", "front", "inferred").fallbackReason).toBe("no-canvas");
    expect(resolveCanvas("top", "front", "inferred").fallbackReason).toBe("category-inferred");
  });

  it("passes trust through canvasForGarment", () => {
    expect(canvasForGarment("oversized denim jacket", "front", "inferred").isFallback).toBe(true);
    expect(canvasForGarment("oversized denim jacket", "front", "asserted").isFallback).toBe(false);
  });
});

describe("canvas resolution", () => {
  it("gives each covered category its own approved canvas", () => {
    const paths = coveredCategories().map((c) => resolveCanvas(c).path);
    expect(new Set(paths).size).toBe(paths.length);
    for (const p of paths) expect(p).not.toBe(STUDIO_BACKDROP_PATH);
  });

  it("pairs the canvas mode with the canvas, so the prompt cannot describe the wrong one", () => {
    expect(resolveCanvas("outerwear").mode).toBe("preserve");
    expect(resolveCanvas("unknown").mode).toBe("backdrop");
  });

  // The whole point of the fallback: never let a missing canvas mean no canvas,
  // because image_urls[0] then becomes the customer's phone photo and the model
  // preserves the floor it was shot on.
  it("falls back to the empty sweep for a category with no canvas", () => {
    const choice = resolveCanvas("pants");
    expect(choice.path).toBe(STUDIO_BACKDROP_PATH);
    expect(choice.mode).toBe("backdrop");
    expect(choice.isFallback).toBe(true);
  });

  it("never returns an empty or null canvas path for any category", () => {
    const all: GarmentCategory[] = [
      "outerwear", "top", "dress", "skirt", "pants", "set", "unknown",
    ];
    for (const c of all) {
      for (const view of ["front", "back"] as const) {
        expect(resolveCanvas(c, view).path).toBeTruthy();
      }
    }
  });

  it("uses the approved back canvas where one exists", () => {
    expect(resolveCanvas("outerwear", "back").path).toMatch(/canvas-outerwear-back/);
    expect(resolveCanvas("outerwear", "back").isFallback).toBe(false);
  });

  it("falls back rather than reusing a front canvas for a back render", () => {
    // A front-facing canvas would ask the model to match a front composition
    // while rendering a back view.
    expect(resolveCanvas("dress", "back").path).toBe(STUDIO_BACKDROP_PATH);
  });

  it("routes an unrecognised garment to the sweep end to end", () => {
    const choice = canvasForGarment("hand-beaded ceremonial garment");
    expect(choice.isFallback).toBe(true);
    expect(choice.category).toBe("unknown");
  });

  it("keeps the detected category on a fallback, for diagnostics", () => {
    // "recognised as pants, no canvas yet" must stay distinguishable from
    // "could not classify at all" — both fall back, for different reasons.
    const jeans = canvasForGarment("barrel-fit dark indigo denim jeans");
    expect(jeans.isFallback).toBe(true);
    expect(jeans.category).toBe("pants");
  });
});

describe("every canvas file is a valid studio plate", () => {
  const paths = [
    ...coveredCategories().flatMap((c) => [
      resolveCanvas(c, "front").path,
      resolveCanvas(c, "back").path,
    ]),
    STUDIO_BACKDROP_PATH,
  ].filter((p, i, a) => a.indexOf(p) === i);

  it.each(paths)("%s exists, is 4:5 at 2160x2700, and is corner-exact #edeeee", async (p) => {
    expect(existsSync(pub(p)), `missing ${p}`).toBe(true);
    const img = sharp(pub(p));
    const { width, height } = await img.metadata();
    expect({ width, height }).toEqual({ width: 2160, height: 2700 });

    const { r, g, b } = STUDIO_BACKGROUND_RGB;
    for (const [x, y] of [
      [2, 2],
      [width! - 3, 2],
      [2, height! - 3],
      [width! - 3, height! - 3],
    ]) {
      const px = await sharp(pub(p)).extract({ left: x, top: y, width: 1, height: 1 }).raw().toBuffer();
      expect([px[0], px[1], px[2]], `corner ${x},${y} of ${p}`).toEqual([r, g, b]);
    }
  });
});
