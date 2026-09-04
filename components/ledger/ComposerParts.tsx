"use client";

import { useRef, useState } from "react";

/**
 * The two controls the composer is made of, shared by both studios.
 *
 * Image Studio and Model Studio take different runs — a flat lay against an
 * approved canvas, and a garment onto a human model — but the operator does
 * the same two things to start either one: put a photo in a slot, and flip a
 * fact that was read from that photo. They were written for Image Studio and
 * lived inside its Composer; Model Studio's port needed the same tiles, and
 * two copies of a drop target is two places for the ERP search, the drag
 * highlight and the letterboxing rule to drift apart.
 */

export function IntakeSlot({
  url,
  label,
  required,
  disabled,
  onFiles,
  onClear,
  onSearchErp,
}: {
  url: string | null;
  label: string;
  required?: boolean;
  disabled?: boolean;
  onFiles: (files: FileList) => void;
  onClear?: () => void;
  /** Opens the ERP gallery search targeted at this slot. */
  onSearchErp: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  return (
    <div
      onDragOver={(e) => {
        if (disabled) return;
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        if (!disabled && e.dataTransfer.files.length) onFiles(e.dataTransfer.files);
      }}
      className={`group relative h-[168px] flex-1 overflow-hidden rounded-xl border transition ${
        over
          ? "border-brand-500 bg-brand-50 ring-2 ring-brand-100"
          : url
          ? "border-neutral-200 bg-[#edeeee]"
          : "border-dashed border-neutral-300 bg-neutral-50 hover:border-neutral-400 hover:bg-white"
      }`}
    >
      <button
        type="button"
        disabled={disabled}
        onClick={() => input.current?.click()}
        className="absolute inset-0 flex flex-col items-center justify-center gap-1 disabled:cursor-not-allowed"
        title={url ? `Replace ${label.toLowerCase()}` : `Upload ${label.toLowerCase()}`}
      >
        {url ? (
          /*
            Contain, not cover: the tile is landscape and the garment photos
            are portrait, so cover was cropping the hem and the shoulders —
            the two places a bad render shows first. The ground is the
            studio's own #edeeee, so the letterboxing reads as the sweep.
          */
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={url} alt={`${label} product photo`} className="h-full w-full object-contain" />
        ) : (
          <>
            <span className="text-[20px] leading-none text-neutral-300 transition group-hover:text-neutral-400">
              +
            </span>
            <span className="text-[11px] font-medium text-neutral-400">Drop or click</span>
          </>
        )}
      </button>

      {/*
        Per slot, not one control for the pair: front and back are different
        photos of the same style and are chosen separately, so each carries its
        own search. Sits below the drop target so it never eats a drop.
      */}
      <button
        type="button"
        disabled={disabled}
        onClick={onSearchErp}
        aria-label={`Search ERP style photos for the ${label.toLowerCase()}`}
        title={`Search the ERP gallery for the ${label.toLowerCase()}`}
        className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1 bg-white/85 py-1 text-[9.5px] font-bold text-neutral-600 transition hover:bg-white hover:text-neutral-900 disabled:cursor-not-allowed disabled:text-neutral-300"
      >
        <span aria-hidden="true" className="text-[10px] leading-none">
          ⌕
        </span>
        ERP photos
      </button>

      {/* The slot's name sits on the tile rather than under it — under it, at
          the size that caption had to be, it read as noise. */}
      <span
        className={`pointer-events-none absolute left-0 top-0 rounded-br-lg px-2 py-1 font-mono text-[9.5px] font-bold uppercase tracking-[0.12em] ${
          url ? "bg-white/85 text-neutral-600" : "text-neutral-400"
        }`}
      >
        {label}
        {required ? " *" : ""}
      </span>

      {url && onClear && (
        <button
          type="button"
          onClick={onClear}
          aria-label={`Remove ${label.toLowerCase()}`}
          className="absolute right-1.5 top-1.5 hidden h-6 w-6 items-center justify-center rounded-full bg-neutral-900/75 text-[13px] leading-none text-white transition hover:bg-neutral-900 group-hover:flex"
        >
          ×
        </button>
      )}

      <input
        ref={input}
        type="file"
        accept="image/*"
        multiple={false}
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) onFiles(e.target.files);
          e.target.value = "";
        }}
      />
    </div>
  );
}

/**
 * A binary choice as one control instead of two.
 *
 * The side and the garment mode were a pair of segmented controls: four pills
 * for two yes/no questions, all four permanently lit, in a bar whose job is to
 * get out of the way. Both are now facts read from the photo rather than
 * decisions the operator makes up front — so each states its current value and
 * flips when pressed, which is one button, and reads as a fact rather than a
 * form.
 */
export function Flip({
  label,
  value,
  other,
  disabled,
  onFlip,
}: {
  label: string;
  value: string;
  /** What pressing it will change the value to — announced, not drawn. */
  other: string;
  disabled?: boolean;
  onFlip: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onFlip}
      disabled={disabled}
      aria-label={`${label}: ${value}. Change to ${other}.`}
      title={disabled ? undefined : `Change to ${other.toLowerCase()}`}
      className="group -mx-0.5 inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[12.5px] font-bold text-neutral-800 transition hover:bg-neutral-100 disabled:cursor-not-allowed disabled:font-semibold disabled:text-neutral-500 disabled:hover:bg-transparent"
    >
      {value}
      <span
        aria-hidden="true"
        className="text-[10px] text-neutral-300 transition group-hover:text-neutral-500 group-disabled:opacity-0"
      >
        ⇄
      </span>
    </button>
  );
}
