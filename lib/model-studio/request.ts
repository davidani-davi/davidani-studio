// Pure rules of the web Model Studio: the setup key, the exact /api/model-shots body (the shape the Faire
// extension's listing-jobs normalizeShot sends), the Heal body, and how a task result lands in a slot.
// Kept free of React so the tests can pin the body shape the studio route reads.
import core, { type Known, type View } from "@/lib/model-shots-core";
import { personForStyle } from "@/lib/people";
import type { StudioJobStatus } from "@/components/studio-job-store";
import type { Catalogue, ColorSetup, Engine, ShotRequest, Slot, StudioState } from "./types";

export const MODEL_IDS: Record<Engine, string> = { gpt25: "gpt-image-25", gpt2: "gpt-image", nano: "nano-banana-pro" };

/** daily_core.colorKey: the key a colour's draft is stored under. */
export function colorKey(color: string): string {
  return String(color || "").trim().replace(/\s+/g, " ").toUpperCase();
}

export function emptySetup(): ColorSetup {
  return { picked: [], garmentSide: "", fullBase: "", humanModelId: core.AUTO_MODEL, poseId: "", engine: "gpt25", fitSource: "style", runKey: "", slots: [], fixNote: "" };
}

export function emptyState(style: string): StudioState {
  return { style, title: "", type: "", color: "", person: "", drafts: {} };
}

/** The colour's draft, or a fresh one. */
export function setupOf(state: StudioState, color = state.color): ColorSetup {
  return { ...emptySetup(), ...(state.drafts[colorKey(color)] || {}) };
}

/** What the studio is told about the garment. */
export function knownFor(state: StudioState, color = state.color): Known {
  return {
    styleCode: state.style,
    ...(state.title.trim() ? { title: state.title.trim() } : {}),
    ...(state.type.trim() ? { type: state.type.trim() } : {}),
    ...(color ? { color } : {}),
  };
}

/** Pose only: the reference lends just its pose; the fit comes from the style (Simple, a named set). */
export function isPoseOnly(setup: ColorSetup): boolean {
  return setup.humanModelId !== core.AUTO_MODEL && setup.fitSource === "style";
}

/** model_shots.js setupKey() for Simple garment swap: [photos, model, pose, engine, known, editMode, pose-only?]. */
export function setupKeyFor(setup: ColorSetup, known: Known): string {
  return JSON.stringify([setup.picked, setup.humanModelId, setup.poseId, setup.engine, known, "simple", ...(isPoseOnly(setup) ? ["pose-only"] : [])]);
}

export interface ShotRequestInput {
  view: View;
  setup: ColorSetup;
  known: Known;
  requestId: string;
  note?: string;
  styleNotes?: string[];
  anchorImageUrl?: string;
  /** #3: the look sheet, sent with later views as well as the front anchor. */
  anchorSheetUrl?: string;
}

/**
 * The POST /api/model-shots body for one view, as listing-jobs normalizeShot builds it from the extension's
 * "model-shot-generate" message: Simple garment swap, async with a reusable requestId, 1K, the front render
 * as the anchor for every other view, and Pose only riding as fitSource "style" plus the other colours' notes.
 */
export function buildShotRequest(input: ShotRequestInput): ShotRequest {
  const { view, setup, known } = input;
  const garmentImageUrls = core.garmentRefs(setup.picked);
  const fullBase = view === "full" && core.isBottoms(core.categoryFor(known)) && setup.fullBase ? setup.fullBase : "";
  // A bottoms full base is any full-body photo, so its own pants never set the fit (extension 2.185.0).
  const poseOnly = isPoseOnly(setup) || Boolean(fullBase);
  const styleNotes = isPoseOnly(setup) ? (input.styleNotes || []).filter(Boolean).slice(0, 6) : [];
  const side = setup.garmentSide && !garmentImageUrls.includes(setup.garmentSide) ? setup.garmentSide : "";
  return {
    async: true,
    garmentImageUrls,
    humanModelId: setup.humanModelId,
    poseId: setup.poseId || "",
    view,
    resolution: "1K",
    modelId: MODEL_IDS[setup.engine],
    known: { ...known },
    note: core.fixNote(input.note || ""),
    ...(poseOnly ? { fitSource: "style", ...(styleNotes.length ? { styleNotes } : {}) } : {}),
    restore: false,
    ...(fullBase ? { fullReferenceUrl: fullBase } : {}),
    ...(side ? { garmentSideImageUrl: side } : {}),
    ...(view !== "front" && input.anchorImageUrl ? { anchorImageUrl: input.anchorImageUrl } : {}),
    ...(view !== "front" && input.anchorSheetUrl ? { anchorSheetUrl: input.anchorSheetUrl } : {}),
    editMode: "simple",
    requestId: input.requestId,
  };
}

/** Heal: the same request again, on the model and pose the render used, with heal {url, renderedAt}. Free. */
export function buildHealRequest(slot: Slot): Record<string, unknown> | null {
  if (!canHeal(slot) || !slot.request) return null;
  const { async: _async, requestId: _id, ...request } = slot.request;
  const reference = (slot.reference || {}) as { autoContour?: unknown };
  return {
    ...request,
    humanModelId: slot.humanModelId || request.humanModelId,
    poseId: slot.poseId || request.poseId || "",
    heal: { url: slot.url, renderedAt: new Date(slot.startedAt ?? Date.now()).toISOString(), ...(reference.autoContour ? { autoContour: reference.autoContour } : {}) },
  };
}

/** A finished Simple render the studio did not line up yet (no preservation.alignment). */
export function canHeal(slot: Slot): boolean {
  const preservation = (slot.preservation || {}) as { alignment?: unknown };
  return slot.status === "done" && Boolean(slot.url) && slot.editMode === "simple" && !preservation.alignment && Boolean(slot.request);
}

/** The slot after its task finished, the way model_shots.js records a result. */
export function slotFromResult(slot: Slot, result: Record<string, unknown> | undefined, now = Date.now()): Slot {
  const r = result || {};
  if (r.ok !== true || typeof r.url !== "string") {
    return { ...slot, status: "failed", phase: undefined, pending: false, error: String(r.error || "The studio could not render this view."), finishedAt: now };
  }
  const anchor = typeof slot.request?.anchorImageUrl === "string" ? slot.request.anchorImageUrl : "";
  return {
    ...slot, status: "done", phase: undefined, pending: false, error: "", url: r.url, approved: false, finishedAt: now,
    prompt: typeof r.prompt === "string" ? r.prompt : undefined,
    engine: typeof r.engine === "string" ? r.engine : slot.engine,
    modelId: typeof r.modelId === "string" ? r.modelId : undefined,
    humanModelId: typeof r.humanModelId === "string" ? r.humanModelId : undefined,
    poseId: typeof r.poseId === "string" ? r.poseId : undefined,
    resolution: typeof r.resolution === "string" ? r.resolution : undefined,
    editMode: typeof r.editMode === "string" ? r.editMode : "simple",
    preservation: r.preservation, faceCheck: r.faceCheck, reference: r.reference,
    fromFront: slot.view === "front" ? undefined : anchor,
    savedId: undefined,
  };
}

/** RenderStatus's status for a slot. The task only says running/done/failed, so the card never invents steps. */
export function renderStatusOf(slot: Slot): StudioJobStatus {
  if (slot.status === "done") return "done";
  if (slot.status === "failed") return "failed";
  return slot.phase === "submitting" ? "queued" : "generating";
}

/** The ERP file name for a download: the extension's shotFilename, .png for Simple renders (lossless face). */
export function downloadName(style: string, slot: Slot, color: string, seq?: number): string {
  const name = core.shotFilename(style, slot.view, color, seq);
  return slot.editMode === "simple" || slot.preservation ? name.replace(/\.jpg$/i, ".png") : name;
}

/** The person a model or set shows, from the catalogue. */
export function personOfModel(catalogue: Catalogue | null, humanModelId: string | undefined): string {
  if (!catalogue || !humanModelId) return "";
  return catalogue.models.find((m) => m.id === humanModelId)?.person || "";
}

/** One person per colour gallery: the person this style's other renders and saved shots were made on. */
export function stylePerson(state: StudioState, catalogue: Catalogue | null, saved: { humanModelId?: string }[] = []): string {
  const used = [
    ...Object.values(state.drafts).flatMap((d) => (d.slots || []).filter((s) => s.status === "done").map((s) => s.humanModelId || d.humanModelId)),
    ...saved.map((s) => s.humanModelId),
  ].map((id) => personOfModel(catalogue, id));
  return personForStyle(used);
}

/** The other colours' drafts as core.otherColorNotes reads them. */
export function otherNotes(state: StudioState, color: string): string[] {
  return core.otherColorNotes(state.drafts as unknown as Record<string, unknown>, color);
}

/** Simple garment swap: a Redo with nothing typed falls back to the view's own note, then the front's. */
export function redoNote(typed: string, slots: Slot[], index: number): string {
  const frontNote = core.fixNote(slots.find((s) => s.view === "front")?.note || "");
  return core.fixNote(typed) || core.fixNote(slots[index]?.note || "") || frontNote;
}
