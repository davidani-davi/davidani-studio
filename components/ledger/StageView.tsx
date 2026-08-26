"use client";

import { useEffect, useState } from "react";
import { ImageGeneration } from "@/components/agents/image-generation";
import PipelineStrip from "./PipelineStrip";
import type { HistoryItem } from "../types";
import { runPipeline, runSubtitle, runTitle } from "@/lib/run-pipeline";

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
  onOpen,
  hotkey,
  soloed,
}: {
  url: string;
  label: string;
  alt: string;
  kept: boolean;
  onKeep?: () => void;
  onOpen: () => void;
  hotkey: string;
  soloed: boolean;
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
        title={soloed ? "Back to both variants" : "Fill the stage with this variant"}
        className="flex min-h-0 w-full flex-1 items-center justify-center"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt={alt}
          className={`max-h-full max-w-full rounded-md border bg-[#edeeee] object-contain shadow-md ${
            kept ? "border-neutral-900 ring-2 ring-neutral-900" : "border-neutral-200"
          }`}
        />
      </button>
      <figcaption className="flex shrink-0 items-center gap-2">
        <span className="font-mono text-[9px] font-medium uppercase tracking-[0.15em] text-neutral-400">
          {label}
        </span>
        {onKeep && (
          <button
            type="button"
            onClick={onKeep}
            className={`flex items-center gap-1.5 rounded-md border px-2 py-1 text-[10px] font-bold transition ${
              kept
                ? "border-neutral-900 bg-neutral-900 text-white"
                : "border-neutral-200 bg-white text-neutral-700 hover:border-neutral-400"
            }`}
          >
            {kept ? "Kept" : "Keep"}
            <kbd className="rounded border border-current/30 px-1 font-mono text-[8px] opacity-70">
              {hotkey}
            </kbd>
          </button>
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
  elapsed,
  expected,
}: {
  label: string;
  elapsed: number;
  expected: number;
}) {
  const over = elapsed > expected;
  return (
    <figure className="flex min-h-0 w-full flex-1 flex-col items-center gap-2">
      <div className="flex min-h-0 w-full flex-1 items-center justify-center">
        <div className="h-full max-w-full" style={{ aspectRatio: "2160 / 2700" }}>
          <ImageGeneration
            size="fluid"
            status="generating"
            aspectRatio="2160 / 2700"
            resolution="2160 × 2700"
            showStatus={false}
            label={`${label} is being generated`}
            className="h-full"
          />
        </div>
      </div>
      <figcaption className="flex shrink-0 items-center gap-2">
        <span className="font-mono text-[9px] font-medium uppercase tracking-[0.15em] text-neutral-400">
          {label}
        </span>
        <span
          aria-live="polite"
          className={`font-mono text-[10px] font-semibold tabular-nums ${
            over ? "text-amber-700" : "text-neutral-500"
          }`}
        >
          {over ? `${elapsed}s · longer than usual` : `${elapsed}s of about ${expected}s`}
        </span>
      </figcaption>
    </figure>
  );
}

export default function StageView({
  run,
  running,
  onKeep,
  onDownload,
  onOpenDetails,
}: {
  run: HistoryItem | null;
  running?: boolean;
  /** Records the operator's pick. Absent for runs that are not two-up takes. */
  onKeep?: (slot: "left" | "right") => void;
  onDownload: (url: string, index: number) => void;
  onOpenDetails: () => void;
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
  const elapsed = useElapsed(run?.pending?.startedAt);
  const picked = run?.abTest?.selectedImage;
  const shots = run?.imageUrls ?? [];
  const canKeep = Boolean(onKeep) && shots.length === 2 && Boolean(run?.abTest);

  // Switching runs always comes back to both variants — a new run has not been
  // compared yet, so soloing one of it makes no sense.
  useEffect(() => {
    setSoloed(null);
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
      else if (e.key === "Escape") setSoloed(null);
      else return;
      e.preventDefault();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [canKeep, onKeep]);

  if (!run) {
    return (
      <section className="flex h-full flex-col items-center justify-center gap-3 bg-neutral-50 p-8 text-center">
        <div className="h-16 w-12 rounded border border-dashed border-neutral-300 bg-[#edeeee]" />
        <p className="max-w-xs text-[12px] leading-relaxed text-neutral-500">
          Upload a product photo and press Generate. Finished runs land here at full size, and
          stack up in the ledger on the left.
        </p>
      </section>
    );
  }

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
    <section className="flex h-full min-h-0 flex-col bg-neutral-50">
      {/* header — one line, because the images need the rest */}
      <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-neutral-200 bg-white px-4 py-2.5">
        {/* min-w-0 + truncate on the title so a long garment name shortens
            instead of pushing the controls onto a second row. */}
        <span className="font-mono text-[10px] font-bold tracking-tight">
          Run #{run.id.slice(0, 4)}
        </span>
        <span className="min-w-0 max-w-[22ch] truncate text-[11px] font-semibold">
          {runTitle(run)}
        </span>
        <span className="font-mono text-[9.5px] text-neutral-500">{runSubtitle(run)}</span>
        {/* 2xl, not lg: at ~880px of stage the strip pushed Export onto a
            second row, and a two-line header costs the images the height. The
            run card carries the same strip, so this one is a convenience. */}
        <div className="hidden 2xl:block">
          <PipelineStrip steps={runPipeline(run)} size="md" />
        </div>
        <span className="flex-1" />

        <button
          type="button"
          onClick={onOpenDetails}
          className="rounded-md border border-neutral-200 bg-white px-2 py-1 text-[10px] font-bold text-neutral-700 transition hover:border-neutral-400"
        >
          Details
        </button>
        <button
          type="button"
          onClick={() => visible.forEach((url, i) => url && onDownload(url, i))}
          disabled={visible.length === 0}
          className="rounded-md border border-neutral-200 bg-white px-2 py-1 text-[10px] font-bold text-neutral-700 transition hover:border-neutral-400 disabled:opacity-40"
        >
          Export
        </button>
      </div>

      {/* the stage */}
      <div
        className={`grid min-h-0 flex-1 gap-px bg-neutral-200 ${
          visible.length + awaited.length > 1 ? "grid-cols-2" : "grid-cols-1"
        }`}
      >
        {visible.map((url, i) => {
          const slotIndex = soloIndex !== null ? soloIndex : i;
          const kept =
            (picked === "left" && slotIndex === 0) || (picked === "right" && slotIndex === 1);
          return (
            <div key={`${url}-${slotIndex}`} className="flex min-h-0 justify-center bg-neutral-50 p-4">
              <ShotFrame
                url={url}
                alt={labels[slotIndex] ?? `${runTitle(run)} variant ${slotIndex + 1}`}
                label={labels[slotIndex] ?? `Variant ${slotIndex + 1}`}
                kept={kept}
                hotkey={String(slotIndex + 1)}
                onKeep={
                  canKeep && slotIndex < 2
                    ? () => onKeep?.(slotIndex === 0 ? "left" : "right")
                    : undefined
                }
                soloed={soloIndex !== null}
                onOpen={() => setSoloed(soloIndex !== null ? null : slotIndex)}
              />
            </div>
          );
        })}
        {awaited.map((slot) => (
          <div key={`awaited-${slot}`} className="flex min-h-0 justify-center bg-neutral-50 p-4">
            <PaintingFrame
              label={labels[slot] ?? `Variant ${slot + 1}`}
              elapsed={elapsed}
              expected={run.pending?.expectedSeconds ?? 110}
            />
          </div>
        ))}
        {visible.length === 0 && awaited.length === 0 && (
          <div className="flex items-center justify-center text-[12px] text-neutral-500">
            {running ? "Painting variants…" : "This run produced no images."}
          </div>
        )}
      </div>
    </section>
  );
}
