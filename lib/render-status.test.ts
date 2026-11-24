import { describe, expect, it } from "vitest";
import { describeRender, estimatedProgress, formatSeconds } from "./render-status";

const t0 = 1_000_000;

describe("describeRender", () => {
  it("names the step, time so far and usual time while generating", () => {
    const v = describeRender({ status: "generating", startedAt: t0, now: t0 + 42_000 });
    expect(v.headline).toBe("Generating · 42 s, usually about 1:00");
    expect(v.steps.map((s) => s.state)).toEqual(["done", "done", "current", "todo"]);
    expect(v.running).toBe(true);
    expect(v.progress).toBeGreaterThan(0);
    expect(v.progress).toBeLessThan(98);
  });

  it("never reports 100% before the image lands", () => {
    expect(estimatedProgress(10 * 60_000, 60_000)).toBe(98);
    const v = describeRender({ status: "saving", startedAt: t0, now: t0 + 600_000 });
    expect(v.progress).toBeLessThan(100);
  });

  it("says plainly when a run is slower than usual", () => {
    const v = describeRender({ status: "generating", startedAt: t0, now: t0 + 100_000, estimateMs: 60_000 });
    expect(v.slow).toBe(true);
    expect(v.headline).toBe("Generating · 1:40, taking longer than usual");
  });

  it("marks every step done and reports the real time when saved", () => {
    const v = describeRender({ status: "done", startedAt: t0, now: t0 + 63_000 });
    expect(v.steps.every((s) => s.state === "done")).toBe(true);
    expect(v.progress).toBe(100);
    expect(v.headline).toBe("Saved · took 1:03");
  });

  it("puts the failure mark on the step that failed", () => {
    const v = describeRender({ status: "failed", startedAt: t0, now: t0 + 5_000, failedAt: "analyzing" });
    expect(v.steps.map((s) => s.state)).toEqual(["done", "failed", "todo", "todo"]);
    expect(v.headline).toBe("Stopped at reading garment");
    expect(v.running).toBe(false);
  });
});

describe("formatSeconds", () => {
  it("uses seconds under a minute and m:ss above", () => {
    expect(formatSeconds(9_400)).toBe("9 s");
    expect(formatSeconds(65_000)).toBe("1:05");
  });
});
