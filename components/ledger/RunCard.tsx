"use client";

import { AnimatedBadge, type AnimatedBadgeStatus } from "@/components/motion/animated-badge";
import PipelineStrip from "./PipelineStrip";
import type { HistoryItem } from "../types";
import {
  runPipeline,
  runSubtitle,
  runTitle,
  runVerdict,
  type RunTone,
} from "@/lib/run-pipeline";

/**
 * One run in the ledger: both variants at thumbnail size, what it is, and the
 * four-step strip that says how it got made.
 *
 * Both variants rather than the picked one, because the reason to look back at
 * a run is usually to see the take you did NOT keep. The kept slot is marked
 * with a ring and the other is dimmed, so the pick reads without a label.
 */

/**
 * Verdict tone -> beUI badge status.
 *
 * "loading" is not a spelling of "running" here, it is the whole point: the
 * badge spins its own icon and pulses for that status, so a run in flight
 * announces itself from the feed without this component owning an animation.
 */
const VERDICT_STATUS: Record<RunTone, AnimatedBadgeStatus> = {
  running: "loading",
  kept: "success",
  check: "warning",
  clean: "neutral",
};

export default function RunCard({
  run,
  active,
  running,
  onSelect,
}: {
  run: HistoryItem;
  active: boolean;
  running?: boolean;
  onSelect: () => void;
}) {
  const verdict = runVerdict(run, { running });
  const picked = run.abTest?.selectedImage;
  const shots = run.imageUrls.slice(0, 2);
  const time = new Date(run.timestamp).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={active ? "true" : undefined}
      className={`w-full rounded-xl border p-3 text-left transition ${
        active
          ? "border-neutral-900 bg-white shadow-sm ring-1 ring-neutral-900"
          : verdict.tone === "check"
          ? "border-amber-200 bg-amber-50/50 hover:border-amber-300"
          : "border-neutral-200 bg-white hover:border-neutral-400"
      }`}
    >
      <div className="mb-2.5 flex items-center gap-2">
        <span className="font-mono text-[10px] font-bold tracking-tight">
          #{run.id.slice(0, 4)}
        </span>
        <span className="text-[9.5px] text-neutral-500">{time}</span>
        {run.batch && (
          <span className="rounded-full bg-indigo-100 px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-wider text-indigo-700">
            Batch
          </span>
        )}
        <span className="flex-1" />
        {/* No badge for an unremarkable run. A badge on every card is not a
            signal, and "Clean" collided with the backdrop step's own "Clean"
            in the strip below — two different meanings, one word, one card. */}
        {verdict.tone !== "clean" && (
          <AnimatedBadge
            status={VERDICT_STATUS[verdict.tone]}
            size="sm"
            className="h-5 px-1.5 text-[8.5px] font-bold uppercase tracking-wider"
          >
            {verdict.label}
          </AnimatedBadge>
        )}
      </div>

      <div className="mb-2.5 flex gap-1.5">
        {shots.map((url, i) => {
          const isPick = (picked === "left" && i === 0) || (picked === "right" && i === 1);
          const dimmed = Boolean(picked) && !isPick;
          return (
            <div
              key={`${url}-${i}`}
              className={`h-20 w-16 shrink-0 overflow-hidden rounded-md border bg-[#edeeee] ${
                isPick ? "border-neutral-900 ring-1 ring-neutral-900" : "border-neutral-200"
              } ${dimmed ? "opacity-50" : ""}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={url}
                alt={`${runTitle(run)} variant ${i + 1}`}
                className="h-full w-full object-cover"
              />
            </div>
          );
        })}
        {shots.length === 0 && (
          <div className="flex h-20 w-16 items-center justify-center rounded-md border border-dashed border-neutral-300 text-[9px] text-neutral-400">
            —
          </div>
        )}
        <div className="min-w-0 flex-1 pl-1">
          <div className="line-clamp-2 text-[11px] font-bold leading-tight">{runTitle(run)}</div>
          <div className="mt-1 font-mono text-[9px] text-neutral-500">{runSubtitle(run)}</div>
        </div>
      </div>

      <PipelineStrip steps={runPipeline(run)} />
    </button>
  );
}
