import { describe, expect, it } from "vitest";
import { styleNumberFromFilename, styleNumbersForQueue } from "./style-from-filename";

describe("real Davi & Dani photo filenames", () => {
  // Pulled from the ERP's own galleries for DWTS67099, DSP50066 and DDT9040.
  it.each([
    ["DWTS67099 CHARCOAL_1.png", "DWTS67099"],
    ["DSP50066_8.jpg", "DSP50066"],
    ["DDT9040 (7).JPG", "DDT9040"],
    ["DTP67003TBN.jpg", "DTP67003TBN"], // colourway suffix is part of the id
    ["T_DETS50046ATJ.png", null], // ERP thumbnail prefix — not a style code
  ])("%s -> %s", (filename, expected) => {
    expect(styleNumberFromFilename(filename)).toBe(expected);
  });
});

describe("normalisation", () => {
  it("uppercases and drops the extension", () => {
    expect(styleNumberFromFilename("dwts67099_front.jpeg")).toBe("DWTS67099");
  });

  it("takes the basename from a path", () => {
    expect(styleNumberFromFilename("/Users/x/photos/DTP67003TBN.jpg")).toBe("DTP67003TBN");
  });

  it("steps over one copy marker", () => {
    expect(styleNumberFromFilename("copy of DWTS67099.png")).toBe("DWTS67099");
    expect(styleNumberFromFilename("Final DD20538.jpg")).toBe("DD20538");
  });

  it("reads the start, not a trailing token", () => {
    // A trailing number is far more often a colourway or sequence index.
    expect(styleNumberFromFilename("charcoal-flatlay-DWTS67099.png")).toBeNull();
  });
});

describe("nothing to extract", () => {
  it.each([null, undefined, "", "   ", ".png", "photo.jpg", "scan-001.png"])(
    "%s",
    (name) => {
      expect(styleNumberFromFilename(name as string | null | undefined)).toBeNull();
    }
  );

  it("rejects a bare number and bare letters", () => {
    expect(styleNumberFromFilename("67099.png")).toBeNull();
    expect(styleNumberFromFilename("CHARCOAL.png")).toBeNull();
  });

  it("rejects too many leading letters to be a style prefix", () => {
    expect(styleNumberFromFilename("PRODUCTION12345.png")).toBeNull();
  });
});

describe("shape is not proof", () => {
  // The regex only says "this looks like a style code". Whether the file was
  // named correctly is a different question, which is why callers treat the
  // result as inferred rather than asserted.
  it("happily returns a candidate that is not a real style", () => {
    expect(styleNumberFromFilename("ZZZZ99999.png")).toBe("ZZZZ99999");
    // Five letters and three digits is a valid shape, so this gets through the
    // pattern and is rejected one layer down by the ERP.
    expect(styleNumberFromFilename("image005(107).png")).toBe("IMAGE005");
    expect(styleNumberFromFilename("IMG_4821.HEIC")).toBeNull(); // underscore breaks it
  });
});

describe("mapping a batch queue", () => {
  it("pairs each url with its candidate, keeping rows that have none", () => {
    const urls = ["https://f/a.png", "https://f/b.png", "https://f/c.png"];
    const names = {
      "https://f/a.png": "DWTS67099 CHARCOAL_1.png",
      "https://f/b.png": "image005(107).png",
      // c.png deliberately absent from the map
    };
    expect(styleNumbersForQueue(urls, names)).toEqual([
      { url: "https://f/a.png", filename: "DWTS67099 CHARCOAL_1.png", style: "DWTS67099" },
      { url: "https://f/b.png", filename: "image005(107).png", style: "IMAGE005" },
      { url: "https://f/c.png", filename: "", style: null },
    ]);
  });
});
