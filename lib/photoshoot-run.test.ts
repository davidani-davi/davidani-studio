import { describe, expect, it } from "vitest";
import { anchorFor, renderStatusOf, runSummary, shotFileName, type Shot } from "./photoshoot-run";

const ref = { id: "studio-1", label: "Studio · clean daylight", url: "/r.jpg", builtIn: true };
const shot = (n: number, patch: Partial<Shot> = {}): Shot => ({
  id: `s${n}`, reference: ref, shotNumber: n, status: "queued", variationIndex: n - 1, ...patch,
});

describe("photoshoot run helpers", () => {
  it("maps shot state onto the render-status steps", () => {
    expect(renderStatusOf(shot(1))).toBe("queued");
    expect(renderStatusOf(shot(1, { status: "running" }))).toBe("analyzing");
    expect(renderStatusOf(shot(1, { status: "running", phase: "generating" }))).toBe("generating");
    expect(renderStatusOf(shot(1, { status: "done" }))).toBe("done");
    expect(renderStatusOf(shot(1, { status: "failed" }))).toBe("failed");
  });

  it("anchors on the earliest finished shot that is not the one being made", () => {
    const shots = [shot(1, { status: "failed" }), shot(3, { status: "done", url: "c" }), shot(2, { status: "done", url: "b" })];
    expect(anchorFor(shots, "s1")).toBe("b");
    expect(anchorFor(shots, "s2")).toBe("c");
    expect(anchorFor([shot(1)], "s1")).toBeUndefined();
  });

  it("summarises the run in one line", () => {
    expect(runSummary([], 4)).toMatch(/^4 shots/);
    const shots = [shot(1, { status: "done", url: "a" }), shot(2, { status: "failed" }), shot(3, { status: "running", phase: "generating" }), shot(4)];
    expect(runSummary(shots, 4)).toBe("1 of 4 done · 1 failed · shot 3 rendering");
  });

  it("names downloads after the reference and shot", () => {
    expect(shotFileName(shot(2))).toBe("photoshoot-studio-clean-daylight-shot-2.png");
  });
});
