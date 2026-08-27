import { describe, expect, it } from "vitest";
import { candidatesFromRows } from "./erp-style-search";

// Shaped like a real result for "52056", which returns four codes across two
// twins — the search that made this necessary.
const ROWS = [
  { idStyle: "DJ52056D", color: "331", category: "JACKET" },
  { idStyle: "PJ52056D", color: "253", category: "JACKET" },
  { idStyle: "PJ52056D", color: "331", category: "JACKET" },
  { idStyle: "DJ52056", color: "46", category: "JACKET" },
  { idStyle: "DJ52056", color: "16", category: "JACKET" },
  { idStyle: "PJ52056", color: "16", category: "JACKET" },
];

describe("resolving a typed fragment", () => {
  // Photos are filed against the D-style, so offering both twins offers the
  // same gallery twice under two names.
  it("collapses Plus twins into the style that holds the photos", () => {
    expect(candidatesFromRows(ROWS, "52056").map((c) => c.style)).toEqual([
      "DJ52056D",
      "DJ52056",
    ]);
  });

  it("counts the colourways it saw, across both twins", () => {
    const [first, second] = candidatesFromRows(ROWS, "52056");
    expect(first).toEqual({ style: "DJ52056D", category: "JACKET", colorways: 2 });
    expect(second.colorways).toBe(2);
  });

  it("puts an exact match first, however the ERP ordered it", () => {
    expect(candidatesFromRows(ROWS, "DJ52056")[0].style).toBe("DJ52056");
    // ...including when the exact match was typed as its Plus twin.
    expect(candidatesFromRows(ROWS, "PJ52056")[0].style).toBe("DJ52056");
  });

  it("keeps a style whose rows never named a category", () => {
    expect(candidatesFromRows([{ idStyle: "DJ1", color: "1" }], "DJ1")).toEqual([
      { style: "DJ1", category: null, colorways: 1 },
    ]);
  });

  it("ignores rows with nothing usable in them", () => {
    expect(candidatesFromRows([{}, { idStyle: "  " }, { color: "16" }], "x")).toEqual([]);
  });
});
