import { describe, expect, it } from "vitest";
import {
  LONG_LAYER_STYLING,
  buildMultiModelConsistencySuffix,
  buildMultiModelViewSuffix,
  buildOperatorNoteSuffix,
  sanitizeOperatorNote,
  stylingFor,
} from "./multi-model-prompt";

describe("buildMultiModelViewSuffix", () => {
  it("defaults to the four-view full-length set, as before", () => {
    const s = buildMultiModelViewSuffix("front", false);
    expect(s).toContain("one four-view ecommerce photoshoot set: front, side, back, and full.");
    expect(s).toContain("full-length figure from head to shoes");
  });
  it("names the real view count and the plate's framing", () => {
    const low = buildMultiModelViewSuffix("front", false, { framing: "low", views: ["front", "side", "full"] });
    expect(low).toContain("one three-view ecommerce photoshoot set: front, side, and full.");
    expect(low).toContain("from the natural waist down to the shoes");
    expect(low).toContain("Do not add a head");
    const crop = buildMultiModelViewSuffix("side", false, { framing: "crop" });
    expect(crop).toContain("head-to-mid-thigh");
    expect(crop).toContain("Do not zoom out");
  });
  it("a long layer carries the house styling under its hem; nothing else does", () => {
    const s = buildMultiModelViewSuffix("front", false, { framing: "full", styling: stylingFor("outerwear", "long") });
    expect(s).toContain("STYLING RULE: below the garment's hem the model wears plain black straight-leg trousers and plain black ankle boots");
    expect(buildMultiModelViewSuffix("front", false, { framing: "crop" })).not.toContain("STYLING RULE");
    expect(stylingFor("top", "long")).toBe(LONG_LAYER_STYLING);
    expect(stylingFor("outerwear", "")).toBe("");
    expect(stylingFor("outerwear", "short")).toBe("");
    expect(stylingFor("dress", "long")).toBe("");
  });
  it("the consistency contract fixes the garment's scale on the body", () => {
    expect(buildMultiModelConsistencySuffix("a coat", "")).toContain(
      "SCALE RULE: the garment is worn in the model's own size: shoulder seams at her natural shoulder line, sleeves ending at the wrist bone"
    );
  });
  it("the consistency contract counts the same views", () => {
    expect(buildMultiModelConsistencySuffix("a vest", "", ["front", "side", "full"])).toContain(
      "All three outputs must look like one real garment photographed from front, side, and full-body angles"
    );
    expect(buildMultiModelConsistencySuffix("a vest", "")).toContain("four-view set");
  });
});

describe("operator note", () => {
  it("is one clean line, capped at 300 characters", () => {
    expect(sanitizeOperatorNote("  zip-front\n stand   collar,\tno lapels ")).toBe("zip-front stand collar, no lapels");
    expect(sanitizeOperatorNote(undefined)).toBe("");
    expect(sanitizeOperatorNote(42)).toBe("42");
    expect(sanitizeOperatorNote("x".repeat(400))).toHaveLength(300);
  });
  it("becomes a correction for that view, and nothing when empty", () => {
    expect(buildOperatorNoteSuffix("", "side")).toBe("");
    const s = buildOperatorNoteSuffix("zip-front stand collar, no lapels", "side");
    expect(s).toContain("OPERATOR CORRECTION for this side view");
    expect(s).toContain("zip-front stand collar, no lapels");
    expect(s).toContain("overrides any conflicting reading");
  });
});
