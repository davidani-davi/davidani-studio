import { describe, expect, it } from "vitest";
import { buildTryOnInput, garmentForView, tryOnCategory, tryOnSeed, TRYON_OUTPUT } from "./tryon-engine";

describe("tryOnCategory", () => {
  it("maps our shot categories onto the try-on model's three", () => {
    expect(tryOnCategory("top")).toBe("tops");
    expect(tryOnCategory("outerwear")).toBe("tops");
    expect(tryOnCategory("pants")).toBe("bottoms");
    expect(tryOnCategory("skirt")).toBe("bottoms");
    expect(tryOnCategory("dress")).toBe("one-pieces");
    expect(tryOnCategory("set")).toBe("auto");
    expect(tryOnCategory("unknown")).toBe("auto");
    expect(tryOnCategory(undefined)).toBe("auto");
  });
});

describe("garmentForView", () => {
  it("paints the back view from the back photo when there is one, everything else from the front", () => {
    expect(garmentForView("front", ["f", "b"])).toBe("f");
    expect(garmentForView("side", ["f", "b"])).toBe("f");
    expect(garmentForView("full", ["f", "b"])).toBe("f");
    expect(garmentForView("back", ["f", "b"])).toBe("b");
    expect(garmentForView("back", ["f"])).toBe("f");
    expect(() => garmentForView("front", [])).toThrow(/garmentImageUrls/);
  });
});

describe("tryOnSeed", () => {
  it("is stable per style and view, differs per view and per fix note, and fits a 31-bit seed", () => {
    const a = tryOnSeed("DWJ62218", "front");
    expect(tryOnSeed("dwj62218 ", "front")).toBe(a);
    expect(tryOnSeed("DWJ62218", "back")).not.toBe(a);
    expect(tryOnSeed("DWJ62218", "front", "sleeves too long")).not.toBe(a);
    expect(a).toBeGreaterThanOrEqual(0);
    expect(a).toBeLessThan(2147483647);
  });
});

describe("buildTryOnInput", () => {
  it("sends the plate as the person and the ERP photo as the garment, quality mode, no prompt", () => {
    const input = buildTryOnInput({ plateUrl: "https://x/plate.jpg", garmentUrl: "https://x/g.jpg", category: "pants", seed: 7 });
    expect(input).toEqual({
      model_image: "https://x/plate.jpg", garment_image: "https://x/g.jpg", category: "bottoms", mode: "quality",
      garment_photo_type: "auto", segmentation_free: true, output_format: "png", num_samples: 1,
      moderation_level: "permissive", seed: 7,
    });
    expect("prompt" in input).toBe(false);
    expect(TRYON_OUTPUT.width / TRYON_OUTPUT.height).toBeCloseTo(2 / 3, 5);
  });
  it("caps samples at 4 and floors at 1; omits the seed when none is given", () => {
    expect(buildTryOnInput({ plateUrl: "p", garmentUrl: "g", samples: 9 }).num_samples).toBe(4);
    expect(buildTryOnInput({ plateUrl: "p", garmentUrl: "g", samples: 0 }).num_samples).toBe(1);
    expect("seed" in buildTryOnInput({ plateUrl: "p", garmentUrl: "g" })).toBe(false);
    expect(() => buildTryOnInput({ plateUrl: "", garmentUrl: "g" })).toThrow(/plateUrl/);
  });
});
