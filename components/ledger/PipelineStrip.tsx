"use client";

import type { PipelineStep, StepTone } from "@/lib/run-pipeline";

/**
 * The four words under a run: Intake › Side › Canvas › Backdrop.
 *
 * Deliberately not a table and not a list of rows. The rail already renders
 * the full routing trail with labels and notes; this is the glanceable
 * version, and its whole job is to let a column of run cards be scanned
 * downward for the one that went to the sweep. So every card prints the same
 * four positions whether or not it has an answer for them — a missing step
 * would shift the others and break the column.
 */

const TONE_DOT: Record<StepTone, string> = {
  ok: "bg-brand-500",
  warn: "bg-amber-400",
  muted: "bg-neutral-300",
};

const TONE_TEXT: Record<StepTone, string> = {
  ok: "text-neutral-600",
  warn: "text-amber-700",
  muted: "text-neutral-400",
};

export default function PipelineStrip({
  steps,
  size = "sm",
}: {
  steps: PipelineStep[];
  /** "sm" for run cards, "md" for the stage header. */
  size?: "sm" | "md";
}) {
  const text = size === "md" ? "text-[10px]" : "text-[9px]";
  const dot = size === "md" ? "h-1.5 w-1.5" : "h-[5px] w-[5px]";

  return (
    <div className={`flex flex-wrap items-center gap-x-1.5 gap-y-1 ${text}`}>
      {steps.map((step, i) => (
        <div key={step.key} className="flex items-center gap-1.5">
          {i > 0 && <span className="text-neutral-300">›</span>}
          <span
            className={`flex items-center gap-1 font-medium uppercase tracking-[0.09em] ${
              TONE_TEXT[step.tone]
            }`}
            title={step.detail}
          >
            <span aria-hidden="true" className={`${dot} rounded-full ${TONE_DOT[step.tone]}`} />
            {step.label}
          </span>
        </div>
      ))}
    </div>
  );
}
