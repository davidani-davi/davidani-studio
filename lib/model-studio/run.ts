// Pure run steps for the web Model Studio page: start a view, take a variant, heal, resume. The page keeps
// React state; these decide what a slot becomes, so the tests can pin each step without a browser.
import core, { type Known, type View } from "@/lib/model-shots-core";
import { pickVariant, variantRequests } from "./variants";
import { buildShotRequest, otherNotes } from "./request";
import type { ColorSetup, Slot, StudioState } from "./types";

/** A fresh request id. The studio returns the existing task for the same id + body, so Resume reuses it. */
export function newRequestId(style: string, color: string, view: View, now = Date.now(), rand = Math.random()): string {
  const safe = (s: string) => s.replace(/[^A-Za-z0-9]+/g, "").slice(0, 20) || "x";
  return `ms-${safe(style)}-${safe(color)}-${view}-${now.toString(36)}${Math.floor(rand * 1e6).toString(36)}`;
}

/** The slots a run shows: the setup's own, or a fresh plan for the category. */
export function slotsFor(setup: ColorSetup, known: Known): Slot[] {
  return setup.slots.length ? setup.slots : (core.newRun(core.categoryFor(known)) as Slot[]);
}

export interface StartPlan {
  /** Index into slots → the request to POST for that view. */
  requests: { index: number; request: Slot["request"] & object }[];
  /** #4: the front takes to POST instead, when more than one was asked for. */
  takes: Slot[];
  slots: Slot[];
}

/**
 * Start these views. A front starts over on the current setup (the old picture waits in history, finished views
 * are marked as made from the old front); every other view is anchored on the finished front and, when the look
 * sheet is switched on, on the sheet too. `notes` = typed Redo notes per index.
 */
export function startViews(state: StudioState, setup: ColorSetup, known: Known, indexes: number[], opts: {
  notes?: Record<number, string>; now?: number; requestId?: (view: View) => string;
} = {}): StartPlan {
  const now = opts.now ?? Date.now();
  let slots = slotsFor(setup, known).map((s) => ({ ...s }));
  const reqId = opts.requestId || ((view: View) => newRequestId(state.style, state.color, view, now));
  const frontIndex = slots.findIndex((s) => s.view === "front");
  const previousFront = frontIndex >= 0 && slots[frontIndex].status === "done" ? slots[frontIndex].url : "";
  if (indexes.includes(frontIndex) && previousFront) slots = core.markOlderFront(slots, previousFront);
  const styleNotes = otherNotes(state, state.color);
  const anchor = core.anchorFor(slots, "back");
  const sheet = setup.useSheet && setup.sheetUrl ? setup.sheetUrl : "";
  const requests: StartPlan["requests"] = [];
  let takes: Slot[] = [];
  for (const index of indexes) {
    const slot = slots[index];
    if (!slot) continue;
    const note = core.fixNote(opts.notes?.[index] ?? slot.note ?? "");
    const request = buildShotRequest({
      view: slot.view, setup, known, requestId: reqId(slot.view), note, styleNotes,
      anchorImageUrl: slot.view === "front" ? undefined : anchor,
      anchorSheetUrl: slot.view === "front" ? undefined : sheet,
    });
    const variants = slot.view === "front" ? variantRequests(request, setup.variantCount ?? 1) : [request];
    if (variants.length > 1) {
      takes = variants.map((r) => ({ view: "front", status: "running", phase: "submitting", url: "", error: "", approved: false, startedAt: now, request: r, note, editMode: "simple", engine: setup.engine, color: state.color }));
      continue;
    }
    const base = slot.url ? core.redoSlot(slot) : { ...slot, status: "running" as const, error: "", approved: false };
    slots[index] = { ...base, status: "running", phase: "submitting", pending: false, jobId: undefined, request, note, startedAt: now, engine: setup.engine, color: state.color };
    requests.push({ index, request });
  }
  return { requests, takes, slots };
}

/** #4 "Use this": the take becomes the front; the old front and the other takes wait in its history. */
export function takeVariant(slots: Slot[], takes: Slot[], index: number): Slot[] {
  const { chosen, others } = pickVariant(takes, index);
  const i = slots.findIndex((s) => s.view === "front");
  const list = core.markOlderFront(slots.map((s) => ({ ...s })), i >= 0 && slots[i].status === "done" ? slots[i].url : "");
  const old = i >= 0 ? list[i] : undefined;
  const history = [...(old?.history || []), old?.url || "", ...others.map((t) => t.url)].filter(Boolean);
  const front: Slot = { ...chosen, view: "front", approved: false, history };
  if (i >= 0) list[i] = front; else list.unshift(front);
  return list;
}

/** Heal answered: the lined-up picture replaces the render, which waits in history. */
export function healedSlot(slot: Slot, result: Record<string, unknown>): Slot {
  if (typeof result.url !== "string" || !result.url) return { ...slot, error: String(result.error || "Heal did not return a picture.") };
  return {
    ...slot, url: result.url, healedFrom: slot.url, approved: false, error: "",
    history: [...(slot.history || []), slot.url].filter(Boolean),
    preservation: result.preservation ?? slot.preservation, faceCheck: result.faceCheck ?? slot.faceCheck,
    savedId: undefined,
  };
}

/** A running slot whose answer could not be confirmed: after 15 min, or a task the studio no longer knows. */
export const STALE_RUN_MS = 15 * 60_000;
export const LOST_TASK_MS = 2 * 60_000;
export function isOverdue(slot: Slot, now = Date.now()): boolean {
  return slot.status === "running" && Boolean(slot.startedAt) && now - (slot.startedAt || 0) > STALE_RUN_MS;
}
