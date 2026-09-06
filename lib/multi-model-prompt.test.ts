import { describe, expect, it } from "vitest";
import {
  LONG_LAYER_STYLING,
  applyOperatorNote,
  applyPlainBack,
  applyStyling,
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
  it("with no back photo the back is plain: front graphics and plackets stay on the front", () => {
    const s = buildMultiModelViewSuffix("back", false, { framing: "crop" });
    expect(s).toContain("there is no back reference");
    expect(s).toContain("Render a plain back");
    expect(s).toContain("do NOT appear on the back");
    expect(s).not.toContain("infer the back logically");
    expect(s).toContain("true rear view");
    // with a real back photo the second image is the truth, not the plain rule
    const withBack = buildMultiModelViewSuffix("back", true, { framing: "crop" });
    expect(withBack).toContain("second uploaded garment image");
    expect(withBack).not.toContain("Render a plain back");
    // the contract no longer asks for graphics "across the set" unqualified
    expect(buildMultiModelConsistencySuffix("a sweater", "")).toContain("graphics in the placement the reference shows them");
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

describe("applyStyling — inside the base prompt, where the GPT editor can see it", () => {
  const base =
    "Use Image A as the base image and keep the model's body, face, identity (long dark hair), pose (standing), hair, expression, lighting, shadows, camera angle, depth of field, and background (pale cream seamless studio backdrop, soft frontal lighting, blue trousers with lace patches visible at hem, black lug-sole boots, gold chain necklace, no other accessories) completely unchanged; take the coat from Image B. Negative prompt: collage, grid";
  it("drops the plate's trousers and shoes from the keep-list and states the styling right after it", () => {
    const out = applyStyling(base, LONG_LAYER_STYLING);
    expect(out).not.toContain("blue trousers");
    expect(out).not.toContain("lug-sole boots");
    expect(out).toContain(
      "and background (pale cream seamless studio backdrop, soft frontal lighting, gold chain necklace, no other accessories) completely unchanged; STYLING: below the garment's hem"
    );
    expect(out.indexOf("STYLING:")).toBeLessThan(out.indexOf("Negative prompt:"));
  });
  it("lands before the negative prompt without a keep-list, at the end without one, and leaves a prompt alone without styling", () => {
    expect(applyStyling("Make the edit. Negative prompt: grid", "wear black boots")).toBe("Make the edit. STYLING: wear black boots Negative prompt: grid");
    expect(applyStyling("Make the edit.", "wear black boots")).toBe("Make the edit. STYLING: wear black boots");
    expect(applyStyling(base, "")).toBe(base);
  });
});

describe("applyPlainBack — the plain-back rule inside the base prompt, ahead of the negative prompt", () => {
  const base = "Use Image A as the base image; take the sweater from Image B. Negative prompt: grid";
  it("puts the rule before the negative prompt for a back view with no back photo", () => {
    const out = applyPlainBack(base, "back", false);
    expect(out).toContain("BACK VIEW: For this back view there is no back reference");
    expect(out).toContain("do NOT appear on the back");
    expect(out.indexOf("BACK VIEW:")).toBeLessThan(out.indexOf("Negative prompt:"));
    expect(out.replace(/\s*Negative prompt:[\s\S]*$/i, "")).toContain("Render a plain back");
  });
  it("leaves the prompt alone for other views; with a back photo the back-reference rule goes in instead", () => {
    expect(applyPlainBack(base, "front", false)).toBe(base);
    const out = applyPlainBack(base, "back", true);
    expect(out).toContain("SECOND uploaded garment image shows the BACK");
    expect(out).toContain("if the second photo shows a plain back, the back is plain");
    expect(out).not.toContain("there is no back reference");
    expect(out.indexOf("BACK VIEW:")).toBeLessThan(out.indexOf("Negative prompt:"));
  });
});

describe("applyOperatorNote — the Redo note inside the base prompt", () => {
  const base = "Use Image A; take the tee from Image B. Negative prompt: grid";
  it("lands before the negative prompt", () => {
    const out = applyOperatorNote(base, "the back is a plain panel with no print", "back");
    expect(out).toContain("OPERATOR CORRECTION for this back view");
    expect(out.indexOf("OPERATOR CORRECTION")).toBeLessThan(out.indexOf("Negative prompt:"));
  });
  it("leaves the prompt alone without a note", () => {
    expect(applyOperatorNote(base, "", "back")).toBe(base);
  });
});
