import { describe, expect, it } from "vitest";
import { modelComposerSlots } from "./model-composer-slots";

describe("modelComposerSlots", () => {
  it("takes one garment photo by default", () => {
    expect(modelComposerSlots(["/a.jpg"], false, "two-images")).toEqual([
      { url: "/a.jpg", label: "Garment", required: true },
    ]);
  });

  it("names the pair Top and Bottom, in the order the extractor reads them", () => {
    expect(modelComposerSlots(["/top.jpg", "/bottom.jpg"], true, "two-images")).toEqual([
      { url: "/top.jpg", label: "Top", required: true },
      { url: "/bottom.jpg", label: "Bottom", required: true },
    ]);
  });

  it("offers one tile for a set held in a single photo", () => {
    const slots = modelComposerSlots(["/set.jpg", "/ignored.jpg"], true, "single-image");
    expect(slots).toHaveLength(1);
    expect(slots[0].label).toBe("Set");
  });

  it("keeps empty tiles rather than collapsing them", () => {
    expect(modelComposerSlots([], true, "two-images").map((s) => s.url)).toEqual([null, null]);
  });
});
