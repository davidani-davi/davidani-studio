import { describe, expect, it } from "vitest";
import {
  buildMultiModelConsistencySuffix,
  buildMultiModelViewSuffix,
  buildOperatorNoteSuffix,
  sanitizeOperatorNote,
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
