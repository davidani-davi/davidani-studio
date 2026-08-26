import { describe, expect, it } from "vitest";
import {
  BACKGROUND_COVERAGE_LOW,
  BACKGROUND_DRIFT_NOTABLE,
  backgroundDrift,
  sampledHex,
  summarizeBackgroundSnap,
  type BackgroundSnapReport,
} from "./background-snap";
import { STUDIO_BACKGROUND_RGB } from "./studio-background";

const ON_TARGET = { ...STUDIO_BACKGROUND_RGB };
/** The measured real-world drift that prompted the snap pass: #dfe2e9. */
const MEASURED_DRIFT = { r: 0xdf, g: 0xe2, b: 0xe9 };

function report(over: Partial<BackgroundSnapReport> = {}): BackgroundSnapReport {
  return { applied: true, coverage: 0.45, sampled: ON_TARGET, ...over };
}

describe("backgroundDrift", () => {
  it("is zero when the model hit the hex", () => {
    expect(backgroundDrift(ON_TARGET)).toBe(0);
  });

  it("reports the widest channel, not an average", () => {
    // #dfe2e9 is 14 off on R, 12 on G, 5 on B. An average would call this 10
    // and understate the channel that actually moved.
    expect(backgroundDrift(MEASURED_DRIFT)).toBe(14);
  });

  it("is null when nothing was sampled", () => {
    expect(backgroundDrift(null)).toBeNull();
  });
});

describe("sampledHex", () => {
  it("round-trips the measured drift", () => {
    expect(sampledHex(MEASURED_DRIFT)).toBe("#dfe2e9");
  });

  it("pads single-digit channels", () => {
    expect(sampledHex({ r: 1, g: 2, b: 3 })).toBe("#010203");
  });

  it("is null when nothing was sampled", () => {
    expect(sampledHex(null)).toBeNull();
  });
});

describe("a skipped pass is the signal, not the noise", () => {
  // This is the case the whole feature exists for. A render on a painted
  // cinderblock ledge produces a warm textured border, the chroma gate
  // rejects it, and the pass declines — correctly. The image then ships
  // looking like every other output.
  it("warns when the guards declined", () => {
    const s = summarizeBackgroundSnap(
      report({ applied: false, skipReason: "border not neutral (channel spread 41 > 32)" })
    );
    expect(s.tone).toBe("warn");
    expect(s.detail).toContain("border not neutral");
  });

  it("says what happened to the image, not what happened to the pass", () => {
    // "skipped" reads as a step that was not needed. The truth is the render
    // kept whatever background it came back with.
    const s = summarizeBackgroundSnap(report({ applied: false, skipReason: "x" }));
    expect(s.headline).not.toMatch(/skip/i);
    expect(s.headline).toMatch(/as generated/i);
  });

  it("still warns when there is no reason to give", () => {
    const s = summarizeBackgroundSnap(report({ applied: false }));
    expect(s.tone).toBe("warn");
    expect(s.detail).toBeTruthy();
  });

  it("warns when the pass threw", () => {
    const s = summarizeBackgroundSnap(report({ applied: false, failed: true }));
    expect(s.tone).toBe("warn");
    expect(s.headline).toMatch(/failed/i);
  });
});

describe("a fill that barely found any backdrop is suspicious", () => {
  it("warns below the coverage floor even though it applied", () => {
    const s = summarizeBackgroundSnap(report({ coverage: 0.1 }));
    expect(s.tone).toBe("warn");
    expect(s.headline).toContain("10.0%");
  });

  it("does not warn at ordinary flat-lay coverage", () => {
    // The spec caps the garment at 82.5% x 76%, so a conforming flat lay
    // leaves well over half the frame as sweep. The floor must sit under
    // anything real.
    expect(summarizeBackgroundSnap(report({ coverage: 0.45 })).tone).not.toBe("warn");
    expect(BACKGROUND_COVERAGE_LOW).toBeLessThan(0.4);
  });
});

describe("drift worth mentioning", () => {
  it("names both hexes when the model landed measurably off", () => {
    const s = summarizeBackgroundSnap(report({ sampled: MEASURED_DRIFT }));
    expect(s.tone).toBe("snapped");
    expect(s.headline).toContain("#edeeee");
    expect(s.headline).toContain("#dfe2e9");
    expect(s.detail).toContain("14 levels");
  });

  it("stays quiet when the model effectively hit the hex", () => {
    const s = summarizeBackgroundSnap(report({ sampled: ON_TARGET }));
    expect(s.tone).toBe("clean");
    expect(s.detail).toBeNull();
  });

  it("mentions a small drift without escalating it", () => {
    const s = summarizeBackgroundSnap(report({ sampled: { r: 0xec, g: 0xee, b: 0xee } }));
    expect(s.tone).toBe("clean");
    expect(s.detail).toContain("within 1 level");
  });

  it("puts the reference failure above the notable threshold", () => {
    // If this ever inverts, the pass reports "already #edeeee" for the exact
    // render that motivated building it.
    expect(backgroundDrift(MEASURED_DRIFT)!).toBeGreaterThanOrEqual(BACKGROUND_DRIFT_NOTABLE);
  });
});
