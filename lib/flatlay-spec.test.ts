import { describe, expect, it } from "vitest";
import {
  FLATLAY_CANVAS,
  FLATLAY_MARGIN_RATIO,
  FLATLAY_MAX_HEIGHT_RATIO,
  FLATLAY_MAX_WIDTH_RATIO,
  FLATLAY_SIDE_MARGIN_PX,
  flatlayFramingClause,
  flatlayOccupancy,
  flatlaySafeArea,
} from "./flatlay-spec";

/**
 * Approved canvases in public/product-shots/, measured against #edeeee at
 * threshold 8. These are the only tall-garment evidence there is — the comp
 * itself is width-bound — so they are what pins the vertical limit.
 */
const LIBRARY = [
  { name: "canvas-top-front", w: 0.83, h: 0.534, binds: "width" },
  { name: "style-reference-9", w: 0.825, h: 0.533, binds: "width" },
  { name: "canvas-outerwear-front", w: 0.774, h: 0.541, binds: "width" },
  { name: "canvas-dress-front", w: 0.505, h: 0.761, binds: "height" },
  { name: "canvas-set-front", w: 0.629, h: 0.701, binds: "height" },
  { name: "canvas-skirt-front", w: 0.525, h: 0.692, binds: "height" },
] as const;

/**
 * The comp these numbers were measured from. Keeping the raw measurement in
 * the test rather than only the derived ratio means a future edit to the ratio
 * has to argue with the PSD, not just with itself.
 */
const COMP = {
  canvas: { width: 2160, height: 2700 },
  // Garment bounding box on the `Reference` layer of davi-flatlay.psd.
  garment: { x0: 189, y0: 623, x1: 1970, y1: 2060 },
};
const COMP_W = COMP.garment.x1 - COMP.garment.x0 + 1; // 1782
const COMP_H = COMP.garment.y1 - COMP.garment.y0 + 1; // 1438

describe("the spec matches the measured comp", () => {
  it("uses the comp's canvas", () => {
    expect(FLATLAY_CANVAS).toEqual(COMP.canvas);
  });

  it("derives the margin ratio from the measured side margin", () => {
    expect(FLATLAY_SIDE_MARGIN_PX / COMP.canvas.width).toBe(FLATLAY_MARGIN_RATIO);
  });

  it("accounts for every pixel across the frame", () => {
    // 189 + 1782 + 189 = 2160. If this stops holding, the margin and the
    // occupancy have drifted apart and one of them is wrong.
    expect(FLATLAY_SIDE_MARGIN_PX * 2 + COMP_W).toBe(COMP.canvas.width);
  });

  it("places the safe area exactly where the comp's garment sits", () => {
    const safe = flatlaySafeArea();
    expect(safe.x).toBe(FLATLAY_SIDE_MARGIN_PX);
    expect(safe.width).toBe(COMP_W);
  });
});

describe("contain-fit reproduces the comp", () => {
  // The cardigan is wide, so width binds and height falls out of the aspect
  // ratio — which is how the comp measures 82.5% x 53.3%.
  const occ = flatlayOccupancy({ width: COMP_W, height: COMP_H });

  it("binds on width for a broad garment", () => {
    expect(occ.width).toBeCloseTo(0.825, 4);
  });

  it("lands on the comp's measured height occupancy", () => {
    expect(occ.height * 100).toBeCloseTo(53.3, 1);
  });

  it("does not scale a garment already at the safe area", () => {
    // Contain-fit on something exactly safe-area-sized is the identity.
    const safe = flatlaySafeArea();
    const same = flatlayOccupancy({ width: safe.width, height: safe.height });
    expect(same.width).toBeCloseTo(FLATLAY_MAX_WIDTH_RATIO, 6);
    expect(same.height).toBeCloseTo(FLATLAY_MAX_HEIGHT_RATIO, 6);
  });
});

describe("the limits do not contradict the approved canvas library", () => {
  // A square safe area would have enlarged canvas-dress-front from 76.1% to
  // 82.5% — i.e. re-framed the tightest approved tall garment in the library.
  // That is the mistake this guards against.
  it("admits every approved canvas without re-framing it", () => {
    for (const c of LIBRARY) {
      expect(c.w, `${c.name} width`).toBeLessThanOrEqual(FLATLAY_MAX_WIDTH_RATIO + 0.006);
      expect(c.h, `${c.name} height`).toBeLessThanOrEqual(FLATLAY_MAX_HEIGHT_RATIO + 0.002);
    }
  });

  it("is pinned by the tightest height-bound canvas", () => {
    const tallest = Math.max(...LIBRARY.filter((c) => c.binds === "height").map((c) => c.h));
    expect(FLATLAY_MAX_HEIGHT_RATIO).toBeCloseTo(tallest, 2);
  });

  it("keeps the two axes distinct", () => {
    expect(FLATLAY_MAX_HEIGHT_RATIO).toBeLessThan(FLATLAY_MAX_WIDTH_RATIO);
  });
});

describe("tall garments are capped", () => {
  // The reason the rule is a safe area and not a target width. Trousers were
  // framing at 89-92% of frame height against a 53-76% norm; fit-to-width with
  // no cap is what allowed that.
  const trousers = flatlayOccupancy({ width: 900, height: 2600 });

  it("binds on height, not width", () => {
    expect(trousers.height).toBeCloseTo(FLATLAY_MAX_HEIGHT_RATIO, 4);
    expect(trousers.width).toBeLessThan(trousers.height);
  });

  it("keeps a tall garment inside the 53-76% norm it was overshooting", () => {
    // Observed drift was 89-92% of frame height.
    expect(trousers.height).toBeLessThanOrEqual(0.76);
  });

  it("never exceeds the safe area on either axis", () => {
    for (const g of [
      { width: 900, height: 2600 },
      { width: 2400, height: 600 },
      { width: 1782, height: 1438 },
      { width: 50, height: 50 },
    ]) {
      const o = flatlayOccupancy(g);
      expect(o.width).toBeLessThanOrEqual(FLATLAY_MAX_WIDTH_RATIO + 1e-9);
      expect(o.height).toBeLessThanOrEqual(FLATLAY_MAX_HEIGHT_RATIO + 1e-9);
    }
  });
});

describe("the framing clause", () => {
  const clause = flatlayFramingClause();

  it("states the margin as a percentage rather than as prose", () => {
    expect(clause).toContain("8.75%");
  });

  it("states both axis limits, because they differ", () => {
    expect(clause).toContain("82.5%");
    expect(clause).toContain("76%");
  });

  it("describes a contain-fit, so neither axis is assumed to bind", () => {
    expect(clause).toContain("the axis that binds first");
  });

  it("does not carry the vague wording it replaces", () => {
    expect(clause).not.toContain("comfortable");
  });
});
