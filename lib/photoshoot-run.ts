// Photoshoot Studio run state (Kobra redesign, 2026-11-27). Pure helpers so the
// page and its tests share one source: how a shot maps onto the render-status
// card, which finished shot anchors the model's identity, and the one-line run
// summary. The request bodies themselves are unchanged from the old page.

import type { StudioJobStatus } from "@/components/studio-job-store";
import type { RenderStepKey } from "@/lib/render-status";

export type ShotReference = { id: string; label: string; url: string; builtIn?: boolean };

/** Where a running shot is: writing its prompt, or rendering it. */
export type ShotPhase = "analyzing" | "generating";

export interface Shot {
  id: string;
  reference: ShotReference;
  shotNumber: number;
  status: "queued" | "running" | "done" | "failed";
  variationIndex: number;
  phase?: ShotPhase;
  startedAt?: number;
  shotVariation?: string;
  url?: string;
  error?: string;
  failedAt?: RenderStepKey;
}

/** Usual time for one shot: prompt writing plus a 2K GPT Image render. */
export const SHOT_ESTIMATE_MS = 90_000;

export const SHOT_COUNTS = [2, 3, 4, 5, 6] as const;

export function renderStatusOf(shot: Shot): StudioJobStatus {
  if (shot.status === "done") return "done";
  if (shot.status === "failed") return "failed";
  if (shot.status === "queued") return "queued";
  return shot.phase ?? "analyzing";
}

/**
 * The identity anchor for a shot: the earliest finished shot other than this one.
 * Matches the old page, where the first shot that finished anchored every shot after it.
 */
export function anchorFor(shots: Shot[], shotId: string): string | undefined {
  return [...shots]
    .filter((s) => s.id !== shotId && s.status === "done" && s.url)
    .sort((a, b) => a.shotNumber - b.shotNumber)[0]?.url;
}

export function runSummary(shots: Shot[], shotCount: number): string {
  if (!shots.length) return `${shotCount} shots · GPT Image · auto aspect · 2K · one model, one shoot day`;
  const done = shots.filter((s) => s.status === "done").length;
  const failed = shots.filter((s) => s.status === "failed").length;
  const active = shots.find((s) => s.status === "running");
  const parts = [`${done} of ${shots.length} done`];
  if (failed) parts.push(`${failed} failed`);
  if (active) parts.push(`shot ${active.shotNumber} ${active.phase === "generating" ? "rendering" : "being planned"}`);
  return parts.join(" · ");
}

export function shotFileName(shot: Shot): string {
  const ref = shot.reference.label.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "reference";
  return `photoshoot-${ref}-shot-${shot.shotNumber}.png`;
}
