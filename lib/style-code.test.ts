import { describe, expect, it, vi } from "vitest";
import { decodeStyleCode, reconcileStyleCode } from "./style-code";

describe("style codes that name two garments resolve to a set", () => {
  // Every one of these was confirmed against live ERP records before being
  // added to the table — see the sample counts in lib/style-code.ts.
  it.each([
    ["DWTS67099", "DWTS"], // the poncho-and-skirt that started this
    ["DWTP24003LAL", "DWTP"],
    ["DETS50046ATJ", "DETS"],
    ["DETP40335LS", "DETP"],
    ["DEPT60168A", "DEPT"],
    ["DEJP55004ABAR", "DEJP"],
    ["DCTP32622", "DCTP"],
    ["DTP67003TBN", "DTP"],
    ["DTS03032ELV", "DTS"],
  ])("%s -> set via %s", (style, prefix) => {
    expect(decodeStyleCode(style)).toEqual({
      category: "set",
      authority: "override",
      prefix,
    });
  });
});

describe("set-lookalike codes are not mistaken for sets", () => {
  // These read like two-garment codes to a human and are single garments in
  // the ERP. A letter grammar would split them; the digit anchor is what keeps
  // them out, so this is the test guarding that anchor.
  it.each([
    ["DCJT22059", "TOP in the ERP, not a jacket-and-top set"],
    ["DWDT68204TBN", "TOP in the ERP, not a dress-and-top set"],
    ["DSCP42416", "ACCESSORIES in the ERP"],
  ])("%s yields no signal (%s)", (style) => {
    expect(decodeStyleCode(style)).toBeNull();
  });

  it("DET is absent because its live sample was mixed (4 TOP / 2 SET)", () => {
    expect(decodeStyleCode("DET42016BAR")).toBeNull();
  });
});

describe("longest prefix wins", () => {
  it("reads DWTS67099 as DWTS, not as DWT with a trailing S", () => {
    expect(decodeStyleCode("DWTS67099")?.prefix).toBe("DWTS");
  });

  it("reads DCTP32622 as DCTP, not as DCT", () => {
    expect(decodeStyleCode("DCTP32622")?.prefix).toBe("DCTP");
  });

  it("still reads a plain DWT style as a top", () => {
    expect(decodeStyleCode("DWT91004DRU")).toMatchObject({
      category: "top",
      prefix: "DWT",
    });
  });
});

describe("no signal at all", () => {
  it.each([null, undefined, "", "   ", "99999", "XYZ1234"])("%s", (style) => {
    expect(decodeStyleCode(style as string | null | undefined)).toBeNull();
  });
});

describe("authority — how far a code may push against the ERP", () => {
  it("a set code overrides a wrong ERP category", () => {
    // The live failure: DWTS67099 is filed under JACKETS / OUTWEAR.
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    expect(reconcileStyleCode("DWTS67099", "outerwear")).toEqual({
      category: "set",
      source: "style-code:DWTS",
    });
    expect(log).toHaveBeenCalled(); // the disagreement is not silent
    log.mockRestore();
  });

  it("a bottom code splits the ERP's BOTTOM", () => {
    expect(reconcileStyleCode("DS65007TBN", "ambiguous-bottom")).toEqual({
      category: "skirt",
      source: "erp:BOTTOM+style-code:DS",
    });
    expect(reconcileStyleCode("DP60045AP", "ambiguous-bottom")).toEqual({
      category: "pants",
      source: "erp:BOTTOM+style-code:DP",
    });
  });

  it("a bottom code does NOT override a category the ERP actually stated", () => {
    // One DS style in the live sample really is a DRESS. The code is a
    // tie-breaker for BOTTOM, not a second opinion on everything.
    expect(reconcileStyleCode("DS02006ELV", "dress")).toEqual({
      category: "dress",
      source: "erp",
    });
  });

  it("a single-garment code fills a blank ERP category", () => {
    // Several DWJ styles have the category left unset.
    expect(reconcileStyleCode("DWJ020617", null)).toEqual({
      category: "outerwear",
      source: "style-code:DWJ",
    });
  });

  it("a single-garment code defers to the ERP when the ERP has an answer", () => {
    expect(reconcileStyleCode("DD20538LAL", "top")).toEqual({
      category: "top",
      source: "erp",
    });
  });

  it("an unknown code leaves the ERP exactly as it was", () => {
    expect(reconcileStyleCode("XYZ1234", "ambiguous-bottom")).toEqual({
      category: "ambiguous-bottom",
      source: "erp",
    });
    expect(reconcileStyleCode(null, null)).toEqual({ category: null, source: "none" });
  });
});
