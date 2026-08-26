import { describe, expect, it } from "vitest";
import { canvasSummaryFrom, categoryLabel, routingHeadline, summarizeRouting, type RoutingPayload } from "./routing-summary";

/** The live DWTS67099 case: ERP says outerwear, the style code says set. */
const PONCHO_SET: RoutingPayload = {
  styleCode: { prefix: "DWTS", category: "set", authority: "override" },
  erp: { raw: "JACKETS / OUTWEAR", mapped: "outerwear" },
  vision: { category: "outerwear" },
  decidedBy: "style-code:DWTS",
  overrode: { field: "erp", value: "JACKETS / OUTWEAR" },
  describedFrom: { kind: "gallery", frames: 9 },
};

const rowFor = (rows: ReturnType<typeof summarizeRouting>, key: string) =>
  rows.find((r) => r.key === key)!;

describe("the overridden answer stays visible", () => {
  // Not seeing this conflict is what cost five runs — the skirt kept coming
  // back and read as contamination when it was the product.
  const rows = summarizeRouting(PONCHO_SET, {
    path: "/product-shots/canvas-set-front.png",
    isFallback: false,
    category: "set",
  });

  it("marks the ERP row as overridden and keeps its value legible", () => {
    const erp = rowFor(rows, "erp");
    expect(erp.state).toBe("overridden");
    expect(erp.struck).toBe("Jackets / Outwear");
  });

  it("credits the style code as the deciding input", () => {
    const code = rowFor(rows, "style-code");
    expect(code.state).toBe("decided");
    expect(code.value).toBe("DWTS → Coordinated set");
  });

  it("reads top to bottom in pipeline order", () => {
    expect(rows.map((r) => r.key)).toEqual(["style-code", "erp", "described-from", "canvas"]);
  });
});

describe("a style code that merely agrees does not claim credit", () => {
  const rows = summarizeRouting(
    {
      ...PONCHO_SET,
      styleCode: { prefix: "DJ", category: "outerwear", authority: "fill" },
      erp: { raw: "JACKETS / OUTWEAR", mapped: "outerwear" },
      decidedBy: "erp",
      overrode: null,
    },
    { path: "/product-shots/canvas-outerwear-front.png", isFallback: false, category: "outerwear" }
  );

  it("shows the code as confirming, not deciding", () => {
    expect(rowFor(rows, "style-code").state).toBe("muted");
    expect(rowFor(rows, "style-code").note).toMatch(/Confirms the ERP/);
  });

  it("leaves the ERP row unstruck", () => {
    expect(rowFor(rows, "erp").struck).toBeUndefined();
    expect(rowFor(rows, "erp").value).toBe("Jackets / Outwear");
  });
});

describe("missing inputs are named, not hidden", () => {
  const rows = summarizeRouting(
    {
      styleCode: null,
      erp: null,
      vision: { category: "top" },
      decidedBy: "none",
      overrode: null,
      describedFrom: { kind: "intake-photo" },
    },
    { path: "/product-shots/studio-backdrop-empty.png", isFallback: true, category: "pants" }
  );

  // The canvas row now carries two different fallbacks, and only one of them
  // is something the operator can act on from this screen.
  it("names a missing flat lay as a missing flat lay", () => {
    const note = rowFor(rows, "canvas").note ?? "";
    expect(note).toMatch(/no approved flat lay for pants/i);
    expect(note).not.toMatch(/style number/i);
  });

  it("tells the operator a style number would buy the approved canvas", () => {
    const gated = summarizeRouting(
      {
        styleCode: null,
        erp: null,
        vision: { category: "outerwear" },
        decidedBy: "none",
        overrode: null,
        describedFrom: { kind: "intake-photo" },
      },
      {
        path: "/product-shots/studio-backdrop-empty.png",
        isFallback: true,
        category: "outerwear",
        fallbackReason: "category-inferred",
      }
    );
    const note = rowFor(gated, "canvas").note ?? "";
    expect(note).toMatch(/read from the photo alone/i);
    expect(note).toMatch(/style number/i);
    expect(note).toMatch(/outerwear/i);
  });

  it("carries the fallback reason through canvasSummaryFrom", () => {
    const sweep = {
      path: "/product-shots/studio-backdrop-empty.png",
      isFallback: true,
      category: "top" as const,
      fallbackReason: "category-inferred" as const,
    };
    expect(canvasSummaryFrom({ front: sweep }, "front")?.fallbackReason).toBe(
      "category-inferred"
    );
  });

  it("says there is no style number rather than showing a blank", () => {
    expect(rowFor(rows, "erp").state).toBe("fallback");
    expect(rowFor(rows, "erp").value).toBe("No style number");
  });

  it("explains why one photo is a weaker source", () => {
    expect(rowFor(rows, "described-from").value).toBe("Uploaded photo");
    expect(rowFor(rows, "described-from").note).toMatch(/styled with/);
  });

  it("names the missing canvas by category instead of saying 'fallback'", () => {
    const canvas = rowFor(rows, "canvas");
    expect(canvas.value).toBe("Empty sweep");
    expect(canvas.note).toMatch(/No approved flat lay for pants yet/);
  });

  it("does not pretend an unrecognised prefix was considered", () => {
    expect(rowFor(rows, "style-code").value).toBe("Not a recognised prefix");
  });
});

describe("BOTTOM is flagged as under-specified rather than shown as an answer", () => {
  const rows = summarizeRouting(
    {
      styleCode: null,
      erp: { raw: "BOTTOM", mapped: "ambiguous-bottom" },
      vision: { category: "skirt" },
      decidedBy: "erp",
      overrode: null,
      describedFrom: { kind: "gallery", frames: 10 },
    },
    { path: "/product-shots/canvas-skirt-front.png", isFallback: false, category: "skirt" }
  );

  it("notes that BOTTOM covers both", () => {
    expect(rowFor(rows, "erp").note).toMatch(/skirts and trousers alike/);
  });
});

describe("headline for collapsed and batch rows", () => {
  it("names the category and what decided it", () => {
    expect(routingHeadline(PONCHO_SET, "set")).toBe("Coordinated set · by style code");
    expect(routingHeadline({ ...PONCHO_SET, decidedBy: "erp" }, "outerwear")).toBe(
      "Outerwear · by ERP"
    );
    expect(routingHeadline({ ...PONCHO_SET, decidedBy: "vision" }, "top")).toBe("Top · by photo");
  });

  it("says so plainly before anything has been analyzed", () => {
    expect(routingHeadline(null, null)).toBe("Not analyzed yet");
  });
});

describe("category labels", () => {
  it("uses words a person would say", () => {
    expect(categoryLabel("set")).toBe("Coordinated set");
    expect(categoryLabel("unknown")).toBe("Unclassified");
  });
});

describe("nothing to summarize", () => {
  it("returns no rows rather than empty placeholders", () => {
    expect(summarizeRouting(null, null)).toEqual([]);
  });
});

describe("canvasSummaryFrom", () => {
  const front = { path: "/product-shots/canvas-top-front.png", isFallback: false, category: "top" as const };
  const back = { path: "/product-shots/canvas-outerwear-back.png", isFallback: false, category: "outerwear" as const };

  it("reads the requested view", () => {
    expect(canvasSummaryFrom({ front, back }, "front")?.path).toContain("top-front");
    expect(canvasSummaryFrom({ front, back }, "back")?.path).toContain("outerwear-back");
  });

  it("returns null when the user's own canvas outranks routing", () => {
    // An uploaded canvas beats the routed one, so there is no routed canvas to
    // report and the rail drops the row rather than naming one that lost.
    expect(canvasSummaryFrom({ front, back }, "front", true)).toBeNull();
  });

  it("returns null when the analyzer sent no canvas for that view", () => {
    expect(canvasSummaryFrom({ front }, "back")).toBeNull();
    expect(canvasSummaryFrom(undefined, "front")).toBeNull();
  });

  it("carries the fallback flag through", () => {
    // Pants have no approved flat lay, so they land on the empty sweep. That
    // is the single most important thing the rail says, and dropping it here
    // would silently promote a fallback to an approved canvas.
    const sweep = { path: "/product-shots/studio-backdrop-empty.png", isFallback: true, category: "pants" as const };
    expect(canvasSummaryFrom({ front: sweep }, "front")?.isFallback).toBe(true);
  });

  it("does not alias the caller's object", () => {
    // The summary is persisted onto history items; sharing a reference with
    // live analyze state would let a later run mutate a finished run's record.
    const result = canvasSummaryFrom({ front }, "front");
    expect(result).not.toBe(front);
    expect(result).toEqual(front);
  });
});
