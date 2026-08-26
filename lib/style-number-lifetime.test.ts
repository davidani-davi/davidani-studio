import { describe, expect, it } from "vitest";
import { styleNumberSurvives } from "./style-number-lifetime";

const A = "https://cdn/sku-a.jpg";
const B = "https://cdn/sku-b.jpg";

describe("a style typed before any photo survives the first upload", () => {
  // Type the style, then drop the photo. Clearing here would delete what the
  // user just typed, which is worse than the bug being fixed.
  it("keeps it when there is no previous photo", () => {
    expect(styleNumberSurvives(null, A)).toBe(true);
  });
});

describe("replacing one photo with another clears it", () => {
  // The bug: SKU B routed through SKU A's ERP category AND A's gallery
  // contact sheet, so B was described from A's photographs.
  it("clears when a different photo takes the slot", () => {
    expect(styleNumberSurvives(A, B)).toBe(false);
  });

  it("keeps it when the same photo is reported again", () => {
    // Re-renders and slot reassignments to the same URL are not SKU changes.
    expect(styleNumberSurvives(A, A)).toBe(true);
  });
});

describe("emptying the slot is not a SKU change", () => {
  it("keeps it while the slot is empty", () => {
    expect(styleNumberSurvives(A, null)).toBe(true);
  });

  it("keeps it when nothing has ever been uploaded", () => {
    expect(styleNumberSurvives(null, null)).toBe(true);
  });
});

describe("the Remove-then-Upload loop still counts as a replacement", () => {
  // This is the per-SKU loop an operator actually runs: a filled slot has no
  // file picker, so swapping means Remove, then Upload. If callers tracked the
  // CURRENT photo rather than the last non-empty one, the null in the middle
  // would make step two look like a first upload and the stale style number
  // would survive — the exact bug, reintroduced.
  it("clears across an intermediate empty state", () => {
    let lastNonEmpty: string | null = null;
    let survives = true;
    for (const photo of [A, null, B]) {
      survives = styleNumberSurvives(lastNonEmpty, photo);
      if (photo) lastNonEmpty = photo;
    }
    expect(survives).toBe(false);
  });

  it("does not clear when the same photo is removed and re-added", () => {
    let lastNonEmpty: string | null = null;
    let survives = true;
    for (const photo of [A, null, A]) {
      survives = styleNumberSurvives(lastNonEmpty, photo);
      if (photo) lastNonEmpty = photo;
    }
    expect(survives).toBe(true);
  });
});
