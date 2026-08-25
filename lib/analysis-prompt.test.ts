import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// The analyzer system prompt is module-private, so assert against the source.
// It is the first half of the fix: the template can only isolate one garment
// if the analyzer named one garment rather than describing a whole outfit.
const SRC = readFileSync(join(process.cwd(), "lib", "fal.ts"), "utf8");
const BLOCK = SRC.slice(
  SRC.indexOf("PICK EXACTLY ONE GARMENT"),
  SRC.indexOf("SHAPE DISAMBIGUATION — check the overall silhouette")
);

describe("analyzer picks one garment from a styled shot", () => {
  it("has the hero-garment selection rule", () => {
    expect(BLOCK).not.toBe("");
    expect(BLOCK).toMatch(/Choose the single HERO garment/);
    expect(BLOCK).toMatch(/most fully visible/);
  });

  it("forbids merging two garments into one description", () => {
    expect(BLOCK).toMatch(/NEVER merge two garments into one description/);
    expect(BLOCK).toMatch(/Pick one and drop the other entirely/);
  });

  it("stops an under-layer adding features to the hero", () => {
    expect(BLOCK).toMatch(/NEVER let a garment worn UNDER the hero add features/);
    expect(BLOCK).toMatch(/A skirt visible below a poncho does not make the poncho longer/);
  });

  // ERP ground truth: DETS60234 is category SET, "Two-piece active set".
  // The analyzer called it a "tennis dress", so the set/one-piece test must
  // key on construction at the waist, not on matching fabric.
  it("distinguishes a set from a one-piece by the waist, not by matching fabric", () => {
    expect(BLOCK).toMatch(/ONE-PIECE vs TWO-PIECE SET/);
    expect(BLOCK).toMatch(/two independent hems = TWO-PIECE SET/);
    expect(BLOCK).toMatch(/Matching fabric and colour do NOT make it one garment/);
  });

  it("breaks the tie toward SET, the safer error", () => {
    expect(BLOCK).toMatch(/If you genuinely cannot tell, say SET/);
    expect(BLOCK).toMatch(/silently merges two products/);
  });
});
