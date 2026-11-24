import { describe, it, expect } from "vitest";
import { variantRequests, clampVariants, variantCostText, pickVariant } from "./variants";
import { applyPreset, questionsFor, recipeLine } from "./intake";
import type { ColorSetup, ShotRequest, StudioState } from "./types";

const req = { view: "front", requestId: "DP1-navy-front-1", async: true } as ShotRequest;

describe("front variants (#4)", () => {
  it("defaults to one and caps at three", () => {
    expect(clampVariants(undefined)).toBe(1);
    expect(clampVariants(0)).toBe(1);
    expect(clampVariants(9)).toBe(3);
  });
  it("one take keeps the request as is", () => {
    expect(variantRequests(req, 1)).toEqual([req]);
  });
  it("each take is its own task with a shared requestId prefix and the same inputs", () => {
    const takes = variantRequests(req, 3);
    expect(takes.map(t => t.requestId)).toEqual(["DP1-navy-front-1-v1", "DP1-navy-front-1-v2", "DP1-navy-front-1-v3"]);
    expect(takes.every(t => t.async === true && t.view === "front")).toBe(true);
  });
  it("shows the cost", () => {
    expect(variantCostText(1)).toBe("1 render · about $0.12");
    expect(variantCostText(3)).toBe("3 renders · about $0.36");
  });
  it("Use this needs a finished take", () => {
    const takes = [{ url: "a" }, { url: "" }, { url: "c" }];
    expect(pickVariant(takes, 2)).toEqual({ chosen: { url: "c" }, others: [{ url: "a" }] });
    expect(() => pickVariant(takes, 1)).toThrow(/no image/);
  });
});

const setup = (o: Partial<ColorSetup> = {}): ColorSetup => ({ picked: [], garmentSide: "", fullBase: "", humanModelId: "", poseId: "", engine: "" as ColorSetup["engine"], fitSource: "" as ColorSetup["fitSource"], runKey: "", slots: [], fixNote: "", ...o });
const state = (o: Partial<StudioState> = {}): StudioState => ({ style: "DP1", title: "Shirt", type: "", color: "NAVY", person: "", drafts: {}, ...o });

describe("guided intake (#5)", () => {
  it("the preset fills only blanks", () => {
    expect(applyPreset(setup())).toMatchObject({ engine: "gpt25", humanModelId: "auto" });
    expect(applyPreset(setup({ engine: "nano", fitSource: "style", humanModelId: "studio 98" }))).toMatchObject({ engine: "nano", fitSource: "style", humanModelId: "studio 98" });
  });
  it("asks at most three questions, only for what is missing", () => {
    expect(questionsFor(state(), setup(), true).map(q => q.id)).toEqual(["front", "person", "back"]);
    expect(questionsFor(state({ person: "celine" }), setup({ picked: ["f", "b"] }), true)).toEqual([]);
    expect(questionsFor(state(), setup({ picked: ["f"], humanModelId: "studio 98" }), false)).toEqual([]);
  });
  it("sums the recipe in one line", () => {
    expect(recipeLine(state(), setup({ engine: "gpt25", fitSource: "reference", picked: ["f", "b"] }), "Celine")).toBe("NAVY · Celine · GPT 2.5 · fit + pose · front + back");
    expect(recipeLine(state({ color: "" }), setup({ engine: "gpt25", fitSource: "style" }))).toBe("all colours · Auto by style · GPT 2.5 · pose only · no photo yet");
  });
});
