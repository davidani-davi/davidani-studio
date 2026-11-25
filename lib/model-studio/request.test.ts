import { describe, expect, it } from "vitest";
import {
  buildHealRequest, buildShotRequest, canHeal, colorKey, downloadName, emptySetup, emptyState, isPoseOnly, knownFor,
  otherNotes, redoNote, renderStatusOf, setupKeyFor, setupOf, slotFromResult, stylePerson,
} from "./request";
import type { Catalogue, ColorSetup, Slot } from "./types";

const FRONT = "https://system.davidani.com/upload/style/DT78080 NAVY_1.jpg";
const BACK = "https://system.davidani.com/upload/style/DT78080 NAVY_2.jpg";
const SIDE = "https://system.davidani.com/upload/style/DT78080 NAVY_3.jpg";
const known = { styleCode: "DT78080", title: "Linen Top", color: "NAVY" };
const setup = (over: Partial<ColorSetup> = {}): ColorSetup => ({ ...emptySetup(), picked: [FRONT, BACK], ...over });
const slot = (over: Partial<Slot> = {}): Slot => ({ view: "front", status: "done", url: "https://fal.media/f.png", error: "", approved: false, ...over });

describe("buildShotRequest", () => {
  it("matches the extension's Simple body for an Auto front", () => {
    expect(buildShotRequest({ view: "front", setup: setup(), known, requestId: "id-1", anchorImageUrl: "https://x/front.png" })).toEqual({
      async: true, garmentImageUrls: [FRONT, BACK], humanModelId: "auto", poseId: "", view: "front", resolution: "1K",
      modelId: "gpt-image-25", known, note: "", restore: false, editMode: "simple", requestId: "id-1",
    });
  });

  it("anchors a non-front view on the front render, with the side photo and pose-only notes", () => {
    const body = buildShotRequest({
      view: "back", setup: setup({ humanModelId: "studio 97", poseId: "p1", engine: "gpt2", garmentSide: SIDE }),
      known, requestId: "id-2", note: " sleeves\n to the wrist ", styleNotes: ["BLACK front: shorter hem"], anchorImageUrl: "https://fal.media/front.png",
    });
    expect(body).toEqual({
      async: true, garmentImageUrls: [FRONT, BACK], humanModelId: "studio 97", poseId: "p1", view: "back", resolution: "1K",
      modelId: "gpt-image", known, note: "sleeves to the wrist", fitSource: "style", styleNotes: ["BLACK front: shorter hem"],
      restore: false, garmentSideImageUrl: SIDE, anchorImageUrl: "https://fal.media/front.png", editMode: "simple", requestId: "id-2",
    });
  });

  it("sends Fit + pose without fitSource, and never a side photo that is already a garment photo", () => {
    const body = buildShotRequest({ view: "side", setup: setup({ humanModelId: "studio 97", poseId: "p1", fitSource: "reference", garmentSide: BACK, engine: "nano" }), known, requestId: "id-3", styleNotes: ["x"] });
    expect(body.fitSource).toBeUndefined();
    expect(body.styleNotes).toBeUndefined();
    expect(body.garmentSideImageUrl).toBeUndefined();
    expect(body.anchorImageUrl).toBeUndefined();
    expect(body.modelId).toBe("nano-banana-pro");
  });

  it("paints a bottoms full shot on the picked full-body photo with fit from the style", () => {
    const pants = { styleCode: "DP43109", type: "Pants" };
    const s = setup({ fullBase: "https://x/full.jpg" });
    expect(buildShotRequest({ view: "full", setup: s, known: pants, requestId: "r" })).toMatchObject({ fullReferenceUrl: "https://x/full.jpg", fitSource: "style" });
    expect(buildShotRequest({ view: "front", setup: s, known: pants, requestId: "r" }).fullReferenceUrl).toBeUndefined();
    expect(buildShotRequest({ view: "full", setup: s, known, requestId: "r" }).fullReferenceUrl).toBeUndefined();
  });
});

describe("setup key", () => {
  it("follows model_shots.js setupKey and marks Pose only", () => {
    expect(setupKeyFor(setup(), known)).toBe(JSON.stringify([[FRONT, BACK], "auto", "", "gpt25", known, "simple"]));
    expect(JSON.parse(setupKeyFor(setup({ humanModelId: "m", poseId: "p" }), known)).at(-1)).toBe("pose-only");
    expect(isPoseOnly(setup({ humanModelId: "m", fitSource: "reference" }))).toBe(false);
  });
});

describe("heal", () => {
  const request = buildShotRequest({ view: "front", setup: setup(), known, requestId: "id" });
  it("re-sends the request on the render's own model and pose, without async", () => {
    const s = slot({ editMode: "simple", request, humanModelId: "studio 97", poseId: "p2", startedAt: 0, reference: { autoContour: { kind: "x" } } });
    const body = buildHealRequest(s)!;
    expect(body.async).toBeUndefined();
    expect(body.requestId).toBeUndefined();
    expect(body).toMatchObject({ humanModelId: "studio 97", poseId: "p2", heal: { url: s.url, renderedAt: "1970-01-01T00:00:00.000Z", autoContour: { kind: "x" } } });
  });
  it("is offered only for a Simple render that was not lined up", () => {
    expect(canHeal(slot({ editMode: "simple", request }))).toBe(true);
    expect(canHeal(slot({ editMode: "simple", request, preservation: { alignment: {} } }))).toBe(false);
    expect(canHeal(slot({ editMode: "native", request }))).toBe(false);
    expect(buildHealRequest(slot({ editMode: "simple" }))).toBeNull();
  });
});

describe("results and status", () => {
  it("records a finished render and the front it was anchored on", () => {
    const running = slot({ view: "side", status: "running", url: "", request: { view: "side", requestId: "r", anchorImageUrl: "https://f" } });
    const done = slotFromResult(running, { ok: true, url: "https://out.png", engine: "gpt25", humanModelId: "studio 97", editMode: "simple", prompt: "p" }, 5);
    expect(done).toMatchObject({ status: "done", url: "https://out.png", fromFront: "https://f", humanModelId: "studio 97", prompt: "p", finishedAt: 5 });
    expect(slotFromResult(slot({ view: "front", status: "running" }), { ok: true, url: "u" }).fromFront).toBeUndefined();
  });
  it("records a failure with the studio's reason", () => {
    expect(slotFromResult(slot({ status: "running" }), { ok: false, error: "fal 422" })).toMatchObject({ status: "failed", error: "fal 422" });
    expect(slotFromResult(slot({ status: "running" }), undefined).error).toMatch(/could not render/);
  });
  it("maps a slot to RenderStatus", () => {
    expect(renderStatusOf(slot({ status: "running", phase: "submitting" }))).toBe("queued");
    expect(renderStatusOf(slot({ status: "running", phase: "rendering" }))).toBe("generating");
    expect(renderStatusOf(slot())).toBe("done");
    expect(renderStatusOf(slot({ status: "failed" }))).toBe("failed");
  });
  it("names downloads the ERP way, .png for Simple", () => {
    expect(downloadName("DT78080", slot({ editMode: "simple" }), "NAVY")).toBe("DT78080 NAVY MODEL FRONT.png");
    expect(downloadName("DT78080", slot({ view: "back" }), "", 2)).toBe("DT78080 MODEL BACK 2.jpg");
  });
});

describe("state helpers", () => {
  it("keys colours and reads drafts", () => {
    expect(colorKey(" navy  blue ")).toBe("NAVY BLUE");
    const state = { ...emptyState("DT78080"), title: " Linen Top ", type: "", color: "Navy", drafts: { NAVY: setup({ engine: "nano" }) } };
    expect(setupOf(state).engine).toBe("nano");
    expect(setupOf(state, "RED").engine).toBe("gpt25");
    expect(knownFor(state)).toEqual({ styleCode: "DT78080", title: "Linen Top", color: "Navy" });
    expect(knownFor({ ...state, type: "Top", title: "" }, "")).toEqual({ styleCode: "DT78080", type: "Top" });
  });
  it("picks the person this style's other colours were shot on", () => {
    const catalogue: Catalogue = { people: [], models: [{ id: "c1", person: "celine", poses: [] }, { id: "v1", person: "vision", poses: [] }] };
    const state = { ...emptyState("S1"), drafts: { RED: setup({ slots: [slot({ humanModelId: "c1" }), slot({ status: "failed", humanModelId: "v1" })] }) } };
    expect(stylePerson(state, catalogue, [{ humanModelId: "c1" }, { humanModelId: "v1" }])).toBe("celine");
    expect(stylePerson(emptyState("S1"), null)).toBe("");
  });
  it("carries notes: typed, then the view's own, then the front's; other colours' notes for Pose only", () => {
    const slots = [slot({ note: "front fix" }), slot({ view: "side", note: "" }), slot({ view: "back", note: "back fix" })];
    expect(redoNote("typed", slots, 1)).toBe("typed");
    expect(redoNote("", slots, 2)).toBe("back fix");
    expect(redoNote("", slots, 1)).toBe("front fix");
    const state = { ...emptyState("S1"), drafts: { RED: setup({ slots: [slot({ note: "hem shorter", startedAt: 2 })] }) } };
    expect(otherNotes(state, "NAVY")).toEqual(["RED front: hem shorter"]);
    expect(otherNotes(state, "red")).toEqual([]);
  });
});

describe("look sheet anchor", () => {
  it("rides with later views next to the front anchor, never on the front", () => {
    const back = buildShotRequest({ view: "back", setup: setup(), known, requestId: "s", anchorImageUrl: "https://f/front.png", anchorSheetUrl: "https://f/sheet.png" });
    expect(back).toMatchObject({ anchorImageUrl: "https://f/front.png", anchorSheetUrl: "https://f/sheet.png" });
    expect(buildShotRequest({ view: "front", setup: setup(), known, requestId: "s", anchorSheetUrl: "https://f/sheet.png" }).anchorSheetUrl).toBeUndefined();
  });
});
