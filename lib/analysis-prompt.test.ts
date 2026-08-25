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

const SHAPE = SRC.slice(
  SRC.indexOf("SHAPE DISAMBIGUATION — check the overall silhouette"),
  SRC.indexOf("ANTI-HALLUCINATION RULES")
);
const GALLERY = SRC.slice(
  SRC.indexOf("You are looking at a CONTACT SHEET"),
  SRC.indexOf("Then describe ONLY that one garment")
);

describe("layered bottoms — a skort is not shorts", () => {
  // DSP50066 is a denim skort: a skirt panel over built-in shorts. The
  // analyzer called it "sage green denim shorts" on every sample, so the
  // panel was gone before any prompt ran and the render could only be
  // shorts. The existing SHAPE DISAMBIGUATION rules pushed it there — "two
  // parallel tubes ... = BOTTOM (... shorts)" describes a skort's underlayer
  // exactly.
  it("names the skort and its distinguishing cue", () => {
    expect(SHAPE).toMatch(/LAYERED BOTTOMS/);
    expect(SHAPE).toMatch(/must end with "skort"/);
    expect(SHAPE).toMatch(/flat continuous panel/);
    expect(SHAPE).toMatch(/leg hems are visible BELOW/);
  });

  it("separates the three lookalike bottoms by construction, not by guess", () => {
    for (const cue of [
      "SKORT:", // panel + leg openings
      "SHORTS:", // inseam, leg openings are the lowest edge
      "SKIRT:", // no leg openings at all
    ]) {
      expect(SHAPE).toContain(cue);
    }
    expect(SHAPE).toMatch(/inseam running up to the crotch/);
    expect(SHAPE).toMatch(/One continuous hem all the way around/);
  });

  it("keeps the skort one garment, so it cannot fall into the SET path", () => {
    // The two-piece rule says "if you cannot tell, say SET" — a skort read as
    // a set would be split into a skirt and a pair of shorts as two products.
    expect(SHAPE).toMatch(/A skort is ONE garment, not a set/);
    expect(SHAPE).toMatch(/never call it a "skirt over shorts"/);
  });

  it("routes a skort to the skirt canvas", async () => {
    const { inferCategory } = await import("./canvas-registry");
    expect(inferCategory("sage green acid-wash denim skort")).toBe("skirt");
  });
});

describe("contact sheet frames that disagree describe one garment", () => {
  // A skort genuinely reads as a skirt from the front and as shorts from the
  // back. Both readings are correct about their frame, and picking either one
  // loses the product — so the disagreement itself is the signal.
  it("tells the analyzer to reconcile rather than pick a side", () => {
    expect(GALLERY).toMatch(/disagree about the product's CONSTRUCTION/);
    expect(GALLERY).toMatch(/skirt from the front and as shorts from the back/);
    expect(GALLERY).toMatch(/naming the construction that explains every frame/);
    expect(GALLERY).toMatch(/never by picking whichever frame you saw first/);
  });
});
