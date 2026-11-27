"use client";

import { Check, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
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
import Thumb from "@/components/Thumb";

/**
 * One run in the ledger: both variants at thumbnail size, what it is, and the
 * four-step strip that says how it got made.
 *
 * Both variants rather than the picked one, because the reason to look back at
 * a run is usually to see the take you did NOT keep. The kept slot is marked
 * with a ring and the other is dimmed, so the pick reads without a label.
 */

/**
 * Verdict tone -> Kobra badge. A run in flight carries a spinner, so it
 * announces itself from the feed without the card owning an animation.
 */
const VERDICT_BADGE: Record<Exclude<RunTone, "clean">, "outline" | "green" | "amber"> = {
  running: "outline",
  kept: "green",
  check: "amber",
};

const CARD_SHADOW =
  "shadow-[0_0_0_1px_rgb(0_0_0/.06),0_1px_1px_rgb(0_0_0/.03),0_2px_4px_-1px_rgb(0_0_0/.03)]";

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
      className={cn(
        "w-full rounded-xl bg-white p-3 text-left transition-shadow duration-150",
        active
          ? "shadow-[0_0_0_1.5px_var(--color-foreground),0_4px_12px_-4px_rgb(0_0_0/.12)]"
          : cn(CARD_SHADOW, "hover:shadow-[0_0_0_1px_rgb(0_0_0/.12),0_2px_8px_-2px_rgb(0_0_0/.08)]"),
      )}
    >
      <div className="mb-2 flex items-center gap-2">
        <span className="font-mono text-xs font-medium text-foreground">#{run.id.slice(0, 4)}</span>
        <span className="text-xs text-muted-foreground">{time}</span>
        {run.batch && (
          <Badge variant="secondary" size="sm">
            Batch
          </Badge>
        )}
        <span className="flex-1" />
        {/* No badge for an unremarkable run. A badge on every card is not a
            signal, and "Clean" collided with the backdrop step's own "Clean"
            in the strip below — two different meanings, one word, one card. */}
        {verdict.tone !== "clean" && (
          <Badge variant={VERDICT_BADGE[verdict.tone]} size="sm">
            {verdict.tone === "running" ? (
              <Spinner data-icon="inline-start" className="size-3" aria-hidden />
            ) : verdict.tone === "kept" ? (
              <Check data-icon="inline-start" className="size-3" aria-hidden />
            ) : (
              <TriangleAlert data-icon="inline-start" className="size-3" aria-hidden />
            )}
            {verdict.label}
          </Badge>
        )}
      </div>

      {/* Its own line. Sharing the row with the thumbnails it had about
          fourteen characters and clamped almost every garment name. */}
      <div className="mb-2">
        <div className="line-clamp-2 text-[13px] font-medium leading-snug text-foreground">{title(run)}</div>
        <div className="mt-0.5 text-xs text-muted-foreground">{runSubtitle(run)}</div>
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
      <div className="mb-2 flex items-center gap-1.5">
        {intake.length > 0 && (
          <>
            <div className="flex gap-1">
              {intake.slice(0, 2).map((shot) => (
                <div key={shot.url} className="flex w-10 shrink-0 flex-col items-center gap-1">
                  {/* A 2:3 box (Paper's 48x72 list-row photo). Contain, because
                      an intake photo is whatever shape the phone took it in —
                      cover cropped the hem off. */}
                  <div className="relative h-[60px] w-10 overflow-hidden rounded-lg bg-[#edeeee] shadow-[inset_0_0_0_1px_rgb(0_0_0/.06)]">
                    <Thumb
                      src={shot.url}
                      size={256}
                      alt={`${shot.label} intake photo`}
                      className="h-full w-full object-contain"
                      fallback={<span className="flex h-full w-full items-center justify-center px-1 text-center text-[11px] leading-tight text-muted-foreground">Expired</span>}
                    />
                  </div>
                  <span className="text-[11px] leading-none text-muted-foreground">{shot.label}</span>
                </div>
              ))}
            </div>
            {/* A rule, not an arrow: four boxes of the same size in a row
                read as four takes. The intake pair is also drawn smaller, so
                the size says which side of the rule you are on. */}
            <span aria-hidden="true" className="mx-1 h-12 w-px shrink-0 bg-border" />
          </>
        )}
        {slots.map((url, i) => {
          if (!url) {
            return (
              <div
                key={`awaited-${i}`}
                aria-label={`Variant ${i + 1} is being generated`}
                className="studio-skeleton relative h-20 min-w-0 max-w-[64px] flex-1 overflow-hidden rounded-lg"
              />
            );
          }
          const isPick = (picked === "left" && i === 0) || (picked === "right" && i === 1);
          const dimmed = Boolean(picked) && !isPick;
          return (
            <div
              key={`${url}-${i}`}
              data-picked={isPick ? "" : undefined}
              className={cn(
                "h-20 min-w-0 max-w-[64px] flex-1 overflow-hidden rounded-lg bg-[#edeeee]",
                isPick ? "shadow-[0_0_0_1.5px_var(--color-foreground)]" : "shadow-[inset_0_0_0_1px_rgb(0_0_0/.06)]",
                dimmed && "opacity-50",
              )}
            >
              <Thumb
                src={url}
                size={256}
                alt={`${title(run)} variant ${i + 1}`}
                className="h-full w-full object-cover"
                fallback={<span className="flex h-full w-full items-center justify-center px-1 text-center text-[11px] leading-tight text-muted-foreground">Expired</span>}
              />
            </div>
          );
        })}
        {slotCount === 0 && (
          <div className="flex h-20 w-[64px] items-center justify-center rounded-lg bg-muted text-xs text-muted-foreground">
            —
          </div>
        )}
      </div>

      <PipelineStrip steps={pipeline(run)} />
    </button>
  );
}
