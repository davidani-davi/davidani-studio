// One render-status model for every studio tool (redesign Phase 1, 2026-11-24).
//
// The job store only knows the current status and when the run started, so the
// copy stays honest: it names the step, the time so far and the usual time, and
// the bar follows an estimate curve that never reaches 100% before the image lands
// (same curve as RunProgress's ProgressBar).

import type { StudioJobStatus } from "@/components/studio-job-store";

export type RenderStepKey = "queued" | "analyzing" | "generating" | "saving";
export type RenderStepState = "done" | "current" | "todo" | "failed";

export const RENDER_STEPS: { key: RenderStepKey; label: string }[] = [
  { key: "queued", label: "Queued" },
  { key: "analyzing", label: "Reading garment" },
  { key: "generating", label: "Generating" },
  { key: "saving", label: "Saving" },
];

export interface RenderStatusInput {
  status: StudioJobStatus;
  startedAt: number;
  now: number;
  /** Usual run time for this tool; defaults to 60 s. */
  estimateMs?: number;
  /** The step the run was on when it failed, so the failed mark lands there. */
  failedAt?: RenderStepKey;
}

export interface RenderStatusView {
  steps: { key: RenderStepKey; label: string; state: RenderStepState }[];
  /** "Generating · 42 s, usually about 1:00" */
  headline: string;
  /** 0..100; 100 only once done. */
  progress: number;
  elapsedMs: number;
  /** Past 1.5x the usual time and still running. */
  slow: boolean;
  running: boolean;
}

const RUNNING: StudioJobStatus[] = ["queued", "analyzing", "generating", "saving"];

export function formatSeconds(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s} s`;
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function estimatedProgress(elapsedMs: number, estimateMs: number): number {
  const curve = 1 - Math.pow(2, (-elapsedMs / Math.max(1000, estimateMs)) * 2.5);
  return Math.min(98, Math.max(0, curve * 100));
}

export function describeRender(input: RenderStatusInput): RenderStatusView {
  const estimateMs = input.estimateMs ?? 60_000;
  const elapsedMs = Math.max(0, input.now - input.startedAt);
  const running = RUNNING.includes(input.status);

  const order = RENDER_STEPS.map((s) => s.key);
  const at =
    input.status === "done"
      ? order.length
      : input.status === "failed"
        ? order.indexOf(input.failedAt ?? "generating")
        : order.indexOf(input.status as RenderStepKey);

  const steps = RENDER_STEPS.map((step, i) => ({
    ...step,
    state: (i < at
      ? "done"
      : i === at
        ? input.status === "failed"
          ? "failed"
          : "current"
        : "todo") as RenderStepState,
  }));

  const slow = running && elapsedMs > estimateMs * 1.5;
  const usual = `usually about ${formatSeconds(estimateMs)}`;
  let headline: string;
  if (input.status === "done") headline = `Saved · took ${formatSeconds(elapsedMs)}`;
  else if (input.status === "failed") headline = `Stopped at ${RENDER_STEPS[at]?.label.toLowerCase() ?? "a step"}`;
  else if (slow) headline = `${RENDER_STEPS[at].label} · ${formatSeconds(elapsedMs)}, taking longer than usual`;
  else headline = `${RENDER_STEPS[at].label} · ${formatSeconds(elapsedMs)}, ${usual}`;

  const progress =
    input.status === "done" ? 100 : input.status === "failed" ? 0 : estimatedProgress(elapsedMs, estimateMs);

  return { steps, headline, progress, elapsedMs, slow, running };
}
