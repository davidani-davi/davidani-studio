"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, Check, Download, Expand, FileOutput } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ImageGeneration } from "@/components/ui/image-generation";
import { estimatedProgress } from "@/lib/render-status";
import { cn } from "@/lib/utils";
import PipelineStrip from "./PipelineStrip";
import type { HistoryItem } from "../types";
import {
  intakeShots,
  runPipeline,
  runSubtitle,
  runTitle,
  slotClock,
  type IntakeShot,
  type PipelineStep,
} from "@/lib/run-pipeline";
import Thumb from "@/components/Thumb";

/**
 * The right half: whichever run the ledger is pointing at, as large as the
 * window allows.
 *
 * The size IS the feature. Two 2160x2700 renders used to land in a ~600px
 * column as ~260px cards, and the differences that decide whether a shot ships
 * — a back print clipped at the shoulder, a pocket the model invented, a ledge
 * under the hem — are not visible at that size. Everything else here is kept
 * deliberately thin so the images get the rest.
 */

function ShotFrame({
  url,
  label,
  alt,
  kept,
  onKeep,
  onDownload,
  onOpen,
  hotkey,
  soloed,
  openTitle,
}: {
  url: string;
  label: string;
  alt: string;
  /** Absent for an intake photo, which is a reference and not a take. */
  kept?: boolean;
  onKeep?: () => void;
  /** Absent for an intake photo, which is not an export. */
  onDownload?: () => void;
  onOpen: () => void;
  hotkey?: string;
  soloed: boolean;
  /** Overrides the click hint, which otherwise talks about variants. */
  openTitle?: string;
}) {
  return (
    <figure className="flex min-h-0 w-full flex-1 flex-col items-center gap-2">
      {/*
        The frame is sized by the image, not the other way round. An earlier
        version put flex-1 and aspect-ratio on this button together: flex won
        the height, aspect-ratio then derived a width from it, and at a 4:5
        stage pane that width came out ~130px wider than the pane — so each
        half overflowed sideways and painted over the ledger column. Letting
        max-height and max-width bound a natural-ratio image cannot do that.
      */}
      <button
        type="button"
        onClick={onOpen}
        title={openTitle ?? (soloed ? "Back to both variants" : "Fill the stage with this variant")}
        className="flex min-h-0 w-full flex-1 items-center justify-center"
      >
        {/* The stage copy is resized too; Download still saves the original. */}
        <Thumb
          src={url}
          size={1920}
          loading="eager"
          upgrade
          alt={alt}
          fallback={
            <span className="max-w-[280px] rounded-xl bg-white px-3 py-10 text-center text-[13px] leading-snug text-muted-foreground shadow-[0_0_0_1px_rgb(0_0_0/.06),0_2px_4px_-1px_rgb(0_0_0/.04)] sm:px-6">
              This image could not be loaded. On an older run, the host it was saved on may have deleted it.
            </span>
          }
          className={cn(
            "max-h-full max-w-full rounded-xl bg-[#edeeee] object-contain",
            kept
              ? "shadow-[0_0_0_2px_var(--color-foreground),0_8px_24px_-8px_rgb(0_0_0/.25)]"
              : "shadow-[0_0_0_1px_rgb(0_0_0/.06),0_2px_4px_-1px_rgb(0_0_0/.04),0_12px_28px_-12px_rgb(0_0_0/.18)]",
          )}
        />
      </button>
      <figcaption className="flex max-w-full shrink-0 flex-wrap items-center justify-center gap-x-2 gap-y-1">
        <span className="whitespace-nowrap text-xs font-medium text-muted-foreground">{label}</span>
        {onKeep && (
          <Button type="button" size="sm" variant={kept ? "default" : "outline"} onClick={onKeep}>
            <Check data-icon="inline-start" aria-hidden />
            {kept ? "Kept" : "Keep"}
            <kbd className="ml-0.5 rounded border border-current/25 px-1 font-mono text-[10px] opacity-60">
              {hotkey}
            </kbd>
          </Button>
        )}
        {/* Under the render it belongs to, rather than only in the header's
            Export, which downloads whatever happens to be visible. Most exports
            are of one take — usually the kept one — and this is where the
            operator is already looking when they decide that. */}
        {onDownload && (
          <Button type="button" size="sm" variant="ghost" onClick={onDownload}>
            <Download data-icon="inline-start" aria-hidden />
            Download
          </Button>
        )}
      </figcaption>
    </figure>
  );
}

/**
 * Seconds since the run started, ticking once a second.
 *
 * A ~110 second wait with no visible clock reads as a hang. Showing elapsed
 * against what this model usually takes turns it into a wait with an end.
 */
function useElapsed(startedAt: number | undefined) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!startedAt) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [startedAt]);
  if (!startedAt) return 0;
  return Math.max(0, Math.round((now - startedAt) / 1000));
}

/**
 * One slot on the stage while its image is still being painted.
 *
 * Sized exactly like ShotFrame — a height-driven box at the render's own 4:5,
 * with the caption underneath rather than inside — so the frame does not
 * change size or position at the moment the image lands. beUI's status line is
 * turned off for the same reason: it would add height the finished frame does
 * not have.
 */
function PaintingFrame({
  label,
  startedAt,
  expected,
  aspect,
}: {
  label: string;
  /** This slot's own start, which is not the run's when the calls are chained. */
  startedAt: number;
  expected: number;
  /** The render's own shape — 4:5 flat lay, 2:3 on-model. */
  aspect: { width: number; height: number };
}) {
  // Ticked here rather than in StageView because slots no longer share a
  // clock: a contract run's back slot starts when the front lands.
  const elapsed = useElapsed(startedAt);
  const over = elapsed > expected;
  return (
    <figure className="flex min-h-0 w-full flex-1 flex-col items-center gap-2">
      <div className="flex min-h-0 w-full flex-1 items-center justify-center">
        <div
          role="group"
          aria-label={`${label} is being generated`}
          className="h-full max-w-full"
          style={{ aspectRatio: `${aspect.width} / ${aspect.height}` }}
        >
          <ImageGeneration
            resolution={`${aspect.width} × ${aspect.height}`}
            progress={estimatedProgress(elapsed * 1000, expected * 1000)}
            step={over ? "Still generating" : "Generating"}
            className="h-full max-w-none rounded-xl"
          />
        </div>
      </div>
      <figcaption className="flex max-w-full shrink-0 flex-wrap items-center justify-center gap-x-2 gap-y-1">
        <span className="whitespace-nowrap text-xs font-medium text-foreground">{label}</span>
        <span
          aria-live="polite"
          className={cn("text-xs tabular-nums", over ? "text-[#8a5a12]" : "text-muted-foreground")}
        >
          {over ? `${elapsed}s · longer than usual` : `${elapsed}s of about ${expected}s`}
        </span>
      </figcaption>
    </figure>
  );
}

/**
 * The photos that went in, kept beside the photos that came out.
 *
 * A rail rather than a third pane: the renders are what the operator is
 * judging and they get the room. But "is this still the same garment" cannot
 * be answered from memory, and until this the source was nowhere on the screen
 * once a run finished. Clicking one opens it at full stage size, because the
 * details that decide it — a trim, a pocket, a print's placement — are not
 * visible at rail width either.
 */
function IntakeRail({
  shots,
  opened,
  onOpen,
}: {
  shots: IntakeShot[];
  opened: number | null;
  onOpen: (index: number | null) => void;
}) {
  return (
    <div
      role="region"
      aria-label="Intake photos"
      className="flex w-[124px] shrink-0 flex-col gap-2.5 overflow-y-auto border-r border-border bg-white p-3"
    >
      <span className="shrink-0 text-xs font-medium text-muted-foreground">Intake</span>
      {shots.map((shot, i) => (
        <button
          key={shot.url}
          type="button"
          onClick={() => onOpen(opened === i ? null : i)}
          aria-pressed={opened === i}
          title={opened === i ? "Back to the renders" : `Open the ${shot.label.toLowerCase()} photo`}
          className={cn(
            "group relative shrink-0 overflow-hidden rounded-lg bg-[#edeeee] transition-shadow duration-150",
            opened === i
              ? "shadow-[0_0_0_1.5px_var(--color-foreground)]"
              : "shadow-[inset_0_0_0_1px_rgb(0_0_0/.06)] hover:shadow-[0_0_0_1px_rgb(0_0_0/.16)]",
          )}
          style={{ aspectRatio: "2 / 3" }}
        >
          <Thumb
            src={shot.url}
            size={256}
            alt={`${shot.label} intake photo`}
            className="h-full w-full object-contain"
          />
          <span className="absolute inset-x-1.5 bottom-1.5 rounded-md bg-white/90 py-0.5 text-center text-[11px] font-medium text-foreground shadow-[0_0_0_1px_rgb(0_0_0/.06)]">
            {shot.label}
          </span>
        </button>
      ))}
    </div>
  );
}

export default function StageView({
  run,
  running,
  onKeep,
  onDownload,
  onOpenDetails,
  frameAspect = { width: 2160, height: 2700 },
  emptyHint = "Upload a product photo and press Generate. Finished runs land here at full size, and stack up in the run ledger.",
  pipeline = runPipeline,
  title = runTitle,
  canvas,
}: {
  run: HistoryItem | null;
  running?: boolean;
  /** Records the operator's pick. Absent for runs that are not two-up takes. */
  onKeep?: (slot: "left" | "right") => void;
  onDownload: (url: string, index: number) => void;
  onOpenDetails: () => void;
  /**
   * The shape of this studio's output. Image Studio delivers 2160x2700 (4:5),
   * the Model Studios 2000x3000 (2:3); the painting placeholder is drawn at it
   * so the frame does not resize when the render lands.
   */
  frameAspect?: { width: number; height: number };
  /** What the stage says before the first run. */
  emptyHint?: string;
  /** How this studio reads a run — the header strip and the run's name. */
  pipeline?: (run: HistoryItem) => PipelineStep[];
  title?: (run: HistoryItem) => string;
  /**
   * Canvas-first layout (Image studio): intake as chips under the header
   * instead of a rail, variants on open ground with room kept at the bottom
   * for the floating composer.
   */
  canvas?: boolean;
}) {
  /**
   * Which variant, if any, has the stage to itself.
   *
   * This used to be a Compare/Solo pair plus a 1/2 slot picker — four buttons
   * in the header to say which picture to look at, above the pictures. The
   * picture is the control now: press one to fill the stage with it, press it
   * again to get both back. Same two states, no chrome.
   */
  const [soloed, setSoloed] = useState<number | null>(null);
  /** Which intake photo, if any, has taken over the stage. */
  const [openedIntake, setOpenedIntake] = useState<number | null>(null);
  const picked = run?.abTest?.selectedImage;
  const shots = run?.imageUrls ?? [];
  const canKeep = Boolean(onKeep) && shots.length === 2 && Boolean(run?.abTest);

  // Switching runs always comes back to both variants — a new run has not been
  // compared yet, so soloing one of it makes no sense.
  useEffect(() => {
    setSoloed(null);
    setOpenedIntake(null);
  }, [run?.id]);

  // 1 and 2 keep a variant, Escape leaves solo. Skipped whenever the operator
  // is typing — the composer's style-number field sits one tab away.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
      if (e.key === "1" && canKeep) onKeep?.("left");
      else if (e.key === "2" && canKeep) onKeep?.("right");
      else if (e.key === "Escape") {
        setSoloed(null);
        setOpenedIntake(null);
      }
      else return;
      e.preventDefault();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [canKeep, onKeep]);

  if (!run) {
    return (
      <section
        className={cn(
          "image-studio-stage flex h-full flex-col items-center justify-center gap-4 bg-[#fafafa] p-8 text-center",
          canvas && "stage-canvas stage-canvas--empty",
        )}
      >
        <span className="grid size-12 place-items-center rounded-xl bg-white text-muted-foreground shadow-[0_0_0_1px_rgb(0_0_0/.06),0_2px_4px_-1px_rgb(0_0_0/.05)]">
          <Expand className="size-5" aria-hidden />
        </span>
        <p className="max-w-xs text-[13px] leading-relaxed text-muted-foreground">{emptyHint}</p>
      </section>
    );
  }

  const intake = intakeShots(run);
  const openedShot = openedIntake !== null ? intake[openedIntake] : undefined;
  const labels = run.viewLabels ?? [];
  const soloIndex = soloed !== null && soloed < shots.length ? soloed : null;
  const visible = soloIndex !== null ? [shots[soloIndex]] : shots;

  // Slots reserved for variants that have not landed yet. Space is held from
  // the start so nothing reflows when an image arrives — a variant that
  // finishes early sits beside its sibling still painting.
  const awaited = run.pending
    ? Array.from({ length: run.pending.variants }, (_, i) => i).filter((i) => !shots[i])
    : [];

  return (
    <section className={cn("image-studio-stage flex h-full min-h-0 flex-col bg-[#fafafa]", canvas && "stage-canvas")}>
      {/* header — one line, because the images need the rest */}
      <div
        className={cn(
          "flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1.5",
          canvas ? "stage-canvas__head" : "border-b border-border bg-white px-4 py-2",
        )}
      >
        {/* min-w-0 + truncate on the title so a long garment name shortens
            instead of pushing the controls onto a second row. */}
        <span className="font-mono text-xs text-muted-foreground">Run #{run.id.slice(0, 4)}</span>
        <span className="min-w-0 max-w-[26ch] truncate text-sm font-medium text-foreground">{title(run)}</span>
        <span className="text-xs text-muted-foreground">{runSubtitle(run)}</span>
        {/* 2xl, not lg: at ~880px of stage the strip pushed Export onto a
            second row, and a two-line header costs the images the height. The
            run card carries the same strip, so this one is a convenience. */}
        <div className="hidden 2xl:block">
          <PipelineStrip steps={pipeline(run)} size="md" />
        </div>
        <span className="flex-1" />

        {/*
          The way out, drawn.
          
          Opening an intake photo used to be reversible only by clicking the
          photo again or pressing Escape — neither of which is visible, so the
          stage read as a dead end with the renders gone and Export greyed out.
        */}
        {(openedShot || (soloIndex !== null && shots.length > 1)) && (
          <Button
            type="button"
            size="sm"
            onClick={() => {
              setOpenedIntake(null);
              setSoloed(null);
            }}
          >
            <ArrowLeft data-icon="inline-start" aria-hidden />
            {openedShot ? "Back to the renders" : "Back to both variants"}
            <kbd className="ml-0.5 rounded border border-white/25 px-1 font-mono text-[10px] opacity-70">
              Esc
            </kbd>
          </Button>
        )}

        <Button type="button" size="sm" variant="ghost" onClick={onOpenDetails}>
          Details
        </Button>
        <Button
          size="sm"
          variant="outline"
          type="button"
          /* By slot, not by position in `visible`: soloed on variant 2 the
             list is one long, so this used to export it named "...-1". */
          onClick={() =>
            visible.forEach((url, i) => {
              if (url) onDownload(url, soloIndex !== null ? soloIndex : i);
            })
          }
          disabled={visible.length === 0 || Boolean(openedShot)}
          title={openedShot ? "Go back to the renders to export them" : undefined}
        >
          <FileOutput data-icon="inline-start" aria-hidden />
          Export
        </Button>
      </div>

      {canvas && intake.length > 0 && (
        <div className="stage-canvas__intake" role="region" aria-label="Intake photos">
          <span className="text-xs text-muted-foreground">From</span>
          {intake.map((shot, i) => (
            <button
              key={shot.url}
              type="button"
              className="stage-canvas__chip"
              aria-pressed={openedIntake === i}
              onClick={() => setOpenedIntake(openedIntake === i ? null : i)}
              title={openedIntake === i ? "Back to the renders" : `Open the ${shot.label.toLowerCase()} photo`}
            >
              <span className="stage-canvas__chip-img">
                <Thumb src={shot.url} size={96} alt="" className="h-full w-full object-contain" />
              </span>
              {shot.label}
            </button>
          ))}
        </div>
      )}

      {/* the stage */}
      <div className="flex min-h-0 flex-1">
        {!canvas && intake.length > 0 && (
          <IntakeRail shots={intake} opened={openedIntake} onOpen={setOpenedIntake} />
        )}

        {openedShot ? (
          <div className={cn("flex min-h-0 flex-1 justify-center", canvas ? "stage-canvas__vars" : "bg-[#fafafa] p-4")}>
            <ShotFrame
              url={openedShot.url}
              alt={`${openedShot.label} intake photo`}
              label={`Intake · ${openedShot.label} · click to go back`}
              openTitle="Back to the renders"
              soloed
              onOpen={() => setOpenedIntake(null)}
            />
          </div>
        ) : (
          <div
            className={cn(
              "grid min-h-0 flex-1",
              canvas ? "stage-canvas__vars" : "gap-px bg-border",
              visible.length + awaited.length > 1 ? "grid-cols-2" : "grid-cols-1",
            )}
          >
        {visible.map((url, i) => {
          const slotIndex = soloIndex !== null ? soloIndex : i;
          const kept =
            (picked === "left" && slotIndex === 0) || (picked === "right" && slotIndex === 1);
          return (
            <div key={`${url}-${slotIndex}`} className={cn("flex min-h-0 justify-center", canvas ? "stage-canvas__cell" : "bg-[#fafafa] p-4")}>
              <ShotFrame
                url={url}
                alt={labels[slotIndex] ?? `${title(run)} variant ${slotIndex + 1}`}
                label={labels[slotIndex] ?? `Variant ${slotIndex + 1}`}
                kept={kept}
                hotkey={String(slotIndex + 1)}
                onKeep={
                  canKeep && slotIndex < 2
                    ? () => onKeep?.(slotIndex === 0 ? "left" : "right")
                    : undefined
                }
                onDownload={() => onDownload(url, slotIndex)}
                soloed={soloIndex !== null}
                onOpen={() => setSoloed(soloIndex !== null ? null : slotIndex)}
              />
            </div>
          );
        })}
        {awaited.map((slot) => (
          <div key={`awaited-${slot}`} className={cn("flex min-h-0 justify-center", canvas ? "stage-canvas__cell" : "bg-[#fafafa] p-4")}>
            <PaintingFrame
              label={labels[slot] ?? `Variant ${slot + 1}`}
              startedAt={slotClock(run, slot).startedAt}
              expected={slotClock(run, slot).expectedSeconds}
              aspect={frameAspect}
            />
          </div>
        ))}
        {/* Odd count in a 2-up grid: fill the last cell so the gap colour doesn't show as a slab. */}
        {visible.length + awaited.length > 1 && (visible.length + awaited.length) % 2 === 1 && (
          <div aria-hidden className={canvas ? "hidden" : "bg-[#fafafa]"} />
        )}
            {visible.length === 0 && awaited.length === 0 && (
              <div className="flex items-center justify-center text-[13px] text-muted-foreground">
                {running ? "Painting variants…" : "This run produced no images."}
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
