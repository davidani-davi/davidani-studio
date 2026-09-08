import { describe, expect, it } from "vitest";
import { faceRefPaths, houseFaceOf, noPlateImageUrls, noPlatePrompt, noPlateVariantOf } from "./no-plate";

describe("no-plate: faces and variants", () => {
  it("reads a face from its name or the picker's face: form, and nothing else", () => {
    expect(houseFaceOf("vision")).toBe("vision");
    expect(houseFaceOf("face:celine")).toBe("celine");
    expect(houseFaceOf("Celine")).toBe("celine");
    expect(houseFaceOf("studio 03")).toBeNull();
    expect(houseFaceOf(undefined)).toBeNull();
  });

  it("defaults to flare and only knows sunburst besides", () => {
    expect(noPlateVariantOf("sunburst")).toBe("sunburst");
    expect(noPlateVariantOf("flare")).toBe("flare");
    expect(noPlateVariantOf("max")).toBe("flare");
  });

  it("orders the inputs the prompt counts on: faces, garments, anchor last", () => {
    expect(faceRefPaths("vision")).toEqual(["/models/hide/faces/vision-face.png", "/models/hide/faces/vision-smile-face.png"]);
    expect(noPlateImageUrls(["f1", "f2"], ["g1", "g2"], "a")).toEqual(["f1", "f2", "g1", "g2", "a"]);
    expect(noPlateImageUrls(["f1", "f2"], ["g1"])).toEqual(["f1", "f2", "g1"]);
  });
});

describe("no-plate: prompt", () => {
  const base = {
    view: "front" as const, framing: "crop" as const, category: "top" as const, hem: "" as const,
    known: { title: "Cable Knit Cardigan", type: "Cardigan - Women's", color: "YELLOW" },
    garmentCount: 1, anchored: false,
  };

  it("numbers the garment photo after the two faces and carries the known facts", () => {
    const p = noPlatePrompt(base);
    expect(p).toMatch(/Input images 1 and 2 are the face references/);
    expect(p).toMatch(/Input image 3 is a product photograph/);
    expect(p).toMatch(/"Cable Knit Cardigan", type: Cardigan - Women's, colourway: YELLOW/);
    expect(p).toMatch(/head to mid-thigh/);
    expect(p).not.toMatch(/LAST input image/);
  });

  it("names front and back photos as one garment, and the anchor when a front is up", () => {
    const p = noPlatePrompt({ ...base, view: "side", framing: "crop", garmentCount: 2, anchored: true });
    expect(p).toMatch(/Input images 3 to 4 are product photographs of ONE garment/);
    expect(p).toMatch(/The LAST input image is the approved FRONT view/);
    expect(p).toMatch(/Exact profile/);
  });

  it("frames bottoms waist-down over a black tank and keeps the head out of frame", () => {
    const p = noPlatePrompt({ ...base, category: "pants", framing: "low", known: {} });
    expect(p).toMatch(/waist down to the shoes/);
    expect(p).toMatch(/black ribbed tank top, tucked in/);
    expect(p).not.toMatch(/The garment is/);
  });

  it("appends the operator's fix note last", () => {
    const p = noPlatePrompt({ ...base, view: "back", framing: "full", note: "hem is hip length" });
    expect(p.endsWith("Operator correction for this view: hem is hip length.")).toBe(true);
    expect(p).toMatch(/From directly behind/);
  });
});
