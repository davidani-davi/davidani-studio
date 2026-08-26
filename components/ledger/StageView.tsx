"use client";

import { useEffect, useState } from "react";
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

type Mode = "compare" | "solo";

function ShotFrame({
  url,
  label,
  alt,
  kept,
  onKeep,
  onOpen,
  hotkey,
}: {
  url: string;
  label: string;
  alt: string;
  kept: boolean;
  onKeep?: () => void;
  onOpen: () => void;
  hotkey: string;
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
        title="Open full size"
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
  const [mode, setMode] = useState<Mode>("compare");
  const [solo, setSolo] = useState(0);
  const picked = run?.abTest?.selectedImage;
  const shots = run?.imageUrls ?? [];
  const canKeep = Boolean(onKeep) && shots.length === 2 && Boolean(run?.abTest);

  // Reset the solo slot whenever the run changes, so switching runs never
  // lands on a slot the new run doesn't have.
  useEffect(() => {
    setSolo(0);
  }, [run?.id]);

  // 1 / 2 keep a variant, C and S switch mode. Skipped whenever the operator is
  // typing — the composer's style-number field sits one tab away.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
      if (e.key === "1" && canKeep) onKeep?.("left");
      else if (e.key === "2" && canKeep) onKeep?.("right");
      else if (e.key.toLowerCase() === "c") setMode("compare");
      else if (e.key.toLowerCase() === "s") setMode("solo");
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
  const visible = mode === "solo" ? [shots[Math.min(solo, shots.length - 1)]] : shots;

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

        {shots.length > 1 && (
          <div role="radiogroup" aria-label="Stage mode" className="flex gap-1">
            {(["compare", "solo"] as Mode[]).map((m) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={mode === m}
                onClick={() => setMode(m)}
                className={`rounded-md border px-2 py-1 text-[10px] font-bold capitalize transition ${
                  mode === m
                    ? "border-neutral-900 bg-neutral-900 text-white"
                    : "border-neutral-200 bg-white text-neutral-600 hover:border-neutral-400"
                }`}
              >
                {m}
              </button>
            ))}
          </div>
        )}

        {mode === "solo" && shots.length > 1 && (
          <div className="flex gap-1">
            {shots.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setSolo(i)}
                aria-label={`Show variant ${i + 1}`}
                className={`h-6 w-6 rounded-md border font-mono text-[10px] font-bold transition ${
                  solo === i
                    ? "border-neutral-900 bg-neutral-900 text-white"
                    : "border-neutral-200 bg-white text-neutral-600 hover:border-neutral-400"
                }`}
              >
                {i + 1}
              </button>
            ))}
          </div>
        )}

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
          visible.length > 1 ? "grid-cols-2" : "grid-cols-1"
        }`}
      >
        {visible.map((url, i) => {
          const slotIndex = mode === "solo" ? Math.min(solo, shots.length - 1) : i;
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
                onOpen={() => onDownload(url, slotIndex)}
              />
            </div>
          );
        })}
        {visible.length === 0 && (
          <div className="flex items-center justify-center text-[12px] text-neutral-500">
            {running ? "Painting variants…" : "This run produced no images."}
          </div>
        )}
      </div>
    </section>
  );
}
