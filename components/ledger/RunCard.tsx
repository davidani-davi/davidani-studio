"use client";

import { AnimatedBadge, type AnimatedBadgeStatus } from "@/components/motion/animated-badge";
import PipelineStrip from "./PipelineStrip";
import type { HistoryItem } from "../types";
import {
  intakeShots,
  runPipeline,
  runSubtitle,
  runTitle,
  runVerdict,
  type PipelineStep,
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

export interface RunCardProps {
  run: HistoryItem;
  active: boolean;
  running?: boolean;
  onSelect: () => void;
  /**
   * How this studio reads a run. Image Studio's four steps are about a flat
   * lay on an approved canvas; a Model Studio run has no canvas and can shoot
   * four views, so it passes its own reader rather than being described in
   * words that do not apply to it.
   */
  pipeline?: (run: HistoryItem) => PipelineStep[];
  title?: (run: HistoryItem) => string;
  /** Thumbnails to show. Two variants here, four views in Model Studio. */
  maxSlots?: number;
}

export default function RunCard({
  run,
  active,
  running,
  onSelect,
  pipeline = runPipeline,
  title = runTitle,
  maxSlots = 2,
}: RunCardProps) {
  const verdict = runVerdict(run, { running });
  const picked = run.abTest?.selectedImage;
  /**
   * One entry per slot this run will end up with, in order.
   *
   * By slot rather than "images then placeholders": variant 1 can land while
   * variant 2 is still painting, and rendering all the placeholders first put
   * the empty box to the LEFT of the image that had already arrived.
   */
  const slotCount = Math.min(maxSlots, Math.max(run.imageUrls.length, run.pending?.variants ?? 0));
  const slots = Array.from({ length: slotCount }, (_, i) => run.imageUrls[i] ?? null);
  const intake = intakeShots(run);
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

      {/* Its own line. Sharing the row with the thumbnails it had about
          fourteen characters and clamped almost every garment name. */}
      <div className="mb-2.5">
        <div className="line-clamp-2 text-[12px] font-bold leading-tight">{title(run)}</div>
        <div className="mt-0.5 font-mono text-[9.5px] text-neutral-500">{runSubtitle(run)}</div>
      </div>

      {/*
        Source on the left, results on the right, with the arrow the pipeline
        strip already uses between them. The one question worth asking of a
        finished render is whether it is still the same garment, and until this
        the card showed only the answer, never the question.

        The result tiles flex rather than sitting at a fixed width: two takes
        fill the row at their natural size, and a Model Studio run's four views
        share it instead of running off the edge of the card.
      */}
      <div className="mb-2.5 flex items-center gap-1.5">
        {intake.length > 0 && (
          <>
            <div className="flex gap-1">
              {intake.slice(0, 2).map((shot) => (
                <div
                  key={shot.url}
                  className="relative h-[76px] w-[58px] shrink-0 overflow-hidden rounded-md border border-neutral-200 bg-[#edeeee]"
                >
                  {/* Contain, because an intake photo is whatever shape the
                      phone took it in — cover cropped the hem off. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={shot.url}
                    alt={`${shot.label} intake photo`}
                    className="h-full w-full object-contain"
                  />
                  <span className="absolute inset-x-0 bottom-0 bg-white/85 py-px text-center font-mono text-[7.5px] font-bold uppercase tracking-[0.1em] text-neutral-500">
                    {shot.label}
                  </span>
                </div>
              ))}
            </div>
            {/* A rule, not an arrow: four boxes of the same size in a row
                read as four takes. The intake pair is also drawn smaller, so
                the size says which side of the rule you are on. */}
            <span aria-hidden="true" className="mx-1 h-14 w-px shrink-0 bg-neutral-200" />
          </>
        )}
        {slots.map((url, i) => {
          if (!url) {
            return (
              <div
                key={`awaited-${i}`}
                aria-label={`Variant ${i + 1} is being generated`}
                className="h-24 min-w-0 max-w-[76px] flex-1 animate-pulse rounded-md border border-dashed border-neutral-300 bg-neutral-100"
              />
            );
          }
          const isPick = (picked === "left" && i === 0) || (picked === "right" && i === 1);
          const dimmed = Boolean(picked) && !isPick;
          return (
            <div
              key={`${url}-${i}`}
              className={`h-24 min-w-0 max-w-[76px] flex-1 overflow-hidden rounded-md border bg-[#edeeee] ${
                isPick ? "border-neutral-900 ring-1 ring-neutral-900" : "border-neutral-200"
              } ${dimmed ? "opacity-50" : ""}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={url}
                alt={`${title(run)} variant ${i + 1}`}
                className="h-full w-full object-cover"
              />
            </div>
          );
        })}
        {slotCount === 0 && (
          <div className="flex h-24 w-[76px] items-center justify-center rounded-md border border-dashed border-neutral-300 text-[9px] text-neutral-400">
            —
          </div>
        )}
      </div>

      <PipelineStrip steps={pipeline(run)} />
    </button>
  );
}
