import { describe, expect, it } from "vitest";
import { parseGarmentView, resolveShotMode, viewRowState } from "./garment-view";

describe("parseGarmentView", () => {
  it("reads the analyzer's answer either way", () => {
    expect(parseGarmentView("BACK")).toBe("back");
    expect(parseGarmentView(" front ")).toBe("front");
  });

  it("tolerates a qualified answer", () => {
    // The extractor is told to answer with one word, but a model that adds a
    // clause should not silently become "unknown" and flip the run to front.
    expect(parseGarmentView("back view of the garment")).toBe("back");
  });

  it("is unknown when there is no answer", () => {
    expect(parseGarmentView(null)).toBe("unknown");
    expect(parseGarmentView("")).toBe("unknown");
    expect(parseGarmentView("side")).toBe("unknown");
  });
});

const base = { hasFrontPhoto: true, hasBackPhoto: false, detected: "front" as const };

describe("two photos IS the contract mode", () => {
  it("resolves to a contract whenever both slots are filled", () => {
    expect(resolveShotMode({ ...base, hasBackPhoto: true })).toBe("front-back-contract");
  });

  it("outranks an override, because one photo cannot make a pair", () => {
    expect(
      resolveShotMode({ ...base, hasBackPhoto: true, override: "back" })
    ).toBe("front-back-contract");
  });

  it("is not offered as an editable row", () => {
    expect(viewRowState({ ...base, hasBackPhoto: true }).editable).toBe(false);
  });
});

describe("the photo decides the side", () => {
  it("follows a detected back", () => {
    expect(resolveShotMode({ ...base, detected: "back" })).toBe("single-back");
  });

  it("follows a detected front", () => {
    expect(resolveShotMode({ ...base, detected: "front" })).toBe("single-front");
  });

  it("falls back to front when the analyzer could not tell", () => {
    expect(resolveShotMode({ ...base, detected: "unknown" })).toBe("single-front");
  });
});

describe("the one case detection cannot cover", () => {
  // "I gave you a front photo, render me the back." The side directive
  // explicitly supports inferring the hidden side, so removing the override
  // along with the cards would delete a real run type.
  it("lets an override beat the detected side", () => {
    expect(resolveShotMode({ ...base, detected: "front", override: "back" })).toBe("single-back");
  });

  it("lets an override beat a detected back too", () => {
    expect(resolveShotMode({ ...base, detected: "back", override: "front" })).toBe("single-front");
  });
});

describe("what the rail says about the side", () => {
  it("marks a detected value as detected, so it reads as worked out", () => {
    expect(viewRowState({ ...base, detected: "back" })).toEqual({
      view: "back",
      source: "detected",
      editable: true,
    });
  });

  it("marks a corrected value as the operator's", () => {
    expect(viewRowState({ ...base, detected: "back", override: "front" }).source).toBe("override");
  });

  it("distinguishes an unread photo from a detected front", () => {
    // Both render "Front"; only one of them is a claim about the photograph.
    expect(viewRowState({ ...base, detected: "unknown" }).source).toBe("default");
    expect(viewRowState({ ...base, detected: "front" }).source).toBe("detected");
  });
});
