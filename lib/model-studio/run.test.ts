import { describe, expect, it } from "vitest";
import { emptySetup, emptyState } from "./request";
import { healedSlot, isOverdue, newRequestId, startViews, STALE_RUN_MS, takeVariant } from "./run";
import type { ColorSetup, Slot, StudioState } from "./types";

const FRONT = "https://system.davidani.com/upload/style/DT78080 NAVY_1.jpg";
const known = { styleCode: "DT78080", title: "Linen Top", color: "NAVY" };
const state: StudioState = { ...emptyState("DT78080"), color: "NAVY" };
const done = (view: Slot["view"], url: string, over: Partial<Slot> = {}): Slot => ({ view, status: "done", url, error: "", approved: false, ...over });
const setup = (over: Partial<ColorSetup> = {}): ColorSetup => ({ ...emptySetup(), picked: [FRONT], ...over });
const ids = (view: string) => `id-${view}`;

describe("startViews", () => {
  it("plans a fresh run and sends only the front", () => {
    const plan = startViews(state, setup(), known, [0], { now: 5, requestId: ids });
    expect(plan.slots.map((s) => s.view)).toEqual(["front", "side", "back", "full"]);
    expect(plan.slots[0]).toMatchObject({ status: "running", phase: "submitting", startedAt: 5 });
    expect(plan.requests).toHaveLength(1);
    expect(plan.requests[0].request).toMatchObject({ view: "front", requestId: "id-front", editMode: "simple" });
    expect(plan.requests[0].request.anchorImageUrl).toBeUndefined();
  });

  it("anchors later views on the front and, when switched on, the look sheet too", () => {
    const slots = [done("front", "https://fal/front.png"), { ...done("back", ""), status: "queued" as const }];
    const off = startViews(state, setup({ slots, sheetUrl: "https://fal/sheet.png" }), known, [1], { requestId: ids });
    expect(off.requests[0].request).toMatchObject({ anchorImageUrl: "https://fal/front.png" });
    expect(off.requests[0].request.anchorSheetUrl).toBeUndefined();
    const on = startViews(state, setup({ slots, sheetUrl: "https://fal/sheet.png", useSheet: true }), known, [1], { requestId: ids });
    expect(on.requests[0].request).toMatchObject({ anchorImageUrl: "https://fal/front.png", anchorSheetUrl: "https://fal/sheet.png" });
  });

  it("makes N front takes as separate requests and leaves the front slot alone", () => {
    const slots = [done("front", "https://fal/old.png"), done("back", "https://fal/back.png")];
    const plan = startViews(state, setup({ slots, variantCount: 3 }), known, [0], { requestId: ids });
    expect(plan.requests).toHaveLength(0);
    expect(plan.takes.map((t) => t.request?.requestId)).toEqual(["id-front-v1", "id-front-v2", "id-front-v3"]);
    expect(plan.slots[0].url).toBe("https://fal/old.png");
    expect(plan.slots[1].fromFront).toBe("https://fal/old.png");
  });

  it("a redo keeps the old picture in history and the typed note", () => {
    const plan = startViews(state, setup({ slots: [done("front", "https://fal/a.png")] }), known, [0], { notes: { 0: "shorter hem" }, requestId: ids });
    expect(plan.slots[0]).toMatchObject({ status: "running", url: "", history: ["https://fal/a.png"], note: "shorter hem" });
    expect(plan.requests[0].request.note).toBe("shorter hem");
  });
});

describe("takes, heal, overdue", () => {
  it("Use this makes the take the front and keeps the rest in history", () => {
    const slots = [done("front", "https://fal/old.png"), done("back", "https://fal/back.png")];
    const takes = [done("front", "https://fal/t1.png"), done("front", "https://fal/t2.png")];
    const next = takeVariant(slots, takes, 1);
    expect(next[0]).toMatchObject({ url: "https://fal/t2.png", history: ["https://fal/old.png", "https://fal/t1.png"] });
    expect(next[1].fromFront).toBe("https://fal/old.png");
    expect(() => takeVariant(slots, [{ ...done("front", ""), status: "running" }], 0)).toThrow();
  });

  it("heal swaps the picture and keeps the render in history", () => {
    const s = done("front", "https://fal/raw.png");
    expect(healedSlot(s, { url: "https://fal/healed.png", preservation: { alignment: {} } })).toMatchObject({ url: "https://fal/healed.png", healedFrom: "https://fal/raw.png", history: ["https://fal/raw.png"] });
    expect(healedSlot(s, { ok: false, error: "no face" })).toMatchObject({ url: "https://fal/raw.png", error: "no face" });
  });

  it("flags a run past 15 minutes and makes request ids per view", () => {
    expect(isOverdue({ ...done("front", ""), status: "running", startedAt: 1 }, STALE_RUN_MS + 2)).toBe(true);
    expect(isOverdue({ ...done("front", ""), status: "running", startedAt: 1 }, 10)).toBe(false);
    expect(newRequestId("DT78080", "LIGHT BLUE", "back", 1, 0.5)).toMatch(/^ms-DT78080-LIGHTBLUE-back-/);
  });
});
