"use client";

import { useRef, useState } from "react";
import { StatefulButton, type ButtonState } from "@/components/motion/button";
import type { RoutingControls } from "../RoutingPanel";

/**
 * The docked bar at the foot of the ledger: what the next run will be.
 *
 * Only the controls touched every run live here — the two intake slots, the
 * style number, the side, and Generate. The canvas override, the model and the
 * export settings are touched once a week and sit behind Setup, because the
 * old rail's problem was never that those controls existed, it was that they
 * held permanent space between the operator and the images.
 *
 * The style number is here rather than in Setup for one reason: it is the
 * input that buys the approved canvas. When routing declines a flat lay
 * because nothing corroborated the category, the fix is this field, and a fix
 * two clicks away from the warning does not get made.
 */

const VIEW_NOTE: Record<RoutingControls["viewSource"], string> = {
  contract: "Two photos, so both sides render together.",
  override: "You set this — it overrides the photo.",
  detected: "Read from your photo.",
  default: "Not readable from the photo — assuming front.",
};

function IntakeSlot({
  url,
  label,
  required,
  disabled,
  onFiles,
  onClear,
}: {
  url: string | null;
  label: string;
  required?: boolean;
  disabled?: boolean;
  onFiles: (files: FileList) => void;
  onClear?: () => void;
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
function Flip({
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

export default function Composer({
  frontIntakeUrl,
  backIntakeUrl,
  onAddFiles,
  onClearIntake,
  styleNumber,
  onStyleNumberChange,
  controls,
  modelLabel,
  onGenerate,
  generateLabel,
  generateDisabled,
  busy,
  analyzing,
  onBatch,
  canBatch,
  batchDisabledReason,
  onOpenSetup,
  /** Set when routing declined the approved flat lay for want of a style number. */
  canvasNeedsStyleNumber,
}: {
  frontIntakeUrl: string | null;
  backIntakeUrl: string | null;
  onAddFiles: (files: FileList, slot?: "front" | "back") => void;
  onClearIntake: (url: string) => void;
  styleNumber: string;
  onStyleNumberChange: (value: string) => void;
  controls: RoutingControls;
  modelLabel: string;
  onGenerate: () => void;
  generateLabel: string;
  generateDisabled: boolean;
  busy: boolean;
  analyzing: boolean;
  onBatch: () => void;
  canBatch: boolean;
  batchDisabledReason?: string;
  onOpenSetup: () => void;
  canvasNeedsStyleNumber: boolean;
}) {
  const contract = controls.mode === "front-back-contract";
  const buttonState: ButtonState = analyzing || busy ? "loading" : "idle";

  return (
    <div className="shrink-0 border-t border-neutral-200 bg-white px-4 pb-4 pt-3.5">
      {/*
        Intake is two tiles on their own row, not two thumbnails wedged beside
        the style field. They were 42x52 — smaller than the favicon — for the
        control the operator touches first on every single run, and too small
        to show whether the photo that landed was even the right garment.
      */}
      <div className="mb-3 flex gap-2.5">
        <IntakeSlot
          url={frontIntakeUrl}
          label="Front"
          required
          disabled={busy}
          onFiles={(files) => onAddFiles(files, "front")}
          onClear={frontIntakeUrl ? () => onClearIntake(frontIntakeUrl) : undefined}
        />
        <IntakeSlot
          url={backIntakeUrl}
          label="Back"
          disabled={busy}
          onFiles={(files) => onAddFiles(files, "back")}
          onClear={backIntakeUrl ? () => onClearIntake(backIntakeUrl) : undefined}
        />
      </div>

      <div className="mb-3">
        <label
          htmlFor="composer-style"
          className="mb-1.5 block font-mono text-[9.5px] font-semibold uppercase tracking-[0.12em] text-neutral-500"
        >
          Style number
        </label>
        <input
          id="composer-style"
          type="text"
          value={styleNumber}
          onChange={(e) => onStyleNumberChange(e.target.value)}
          placeholder="DWTS67099"
          spellCheck={false}
          autoCapitalize="characters"
          className={`h-10 w-full rounded-lg border bg-white px-3 font-mono text-[13px] uppercase tracking-wide outline-none transition placeholder:text-neutral-300 focus:ring-2 focus:ring-brand-100 ${
            canvasNeedsStyleNumber
              ? "border-amber-300 focus:border-amber-400"
              : "border-neutral-200 focus:border-brand-500"
          }`}
        />
      </div>

      {canvasNeedsStyleNumber && (
        <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-snug text-amber-800">
          Category read from the photo alone, so this run goes to the empty sweep. A style number
          buys the approved flat lay.
        </p>
      )}

      {/*
        One line, read as a sentence: what this run is, and where that came
        from. It replaces four segmented pills and a separate note underneath.
      */}
      <div className="mb-3 flex flex-wrap items-baseline gap-x-1 gap-y-1 text-[12px] text-neutral-500">
        {contract ? (
          <span className="text-[12.5px] font-bold text-neutral-800">Front + back</span>
        ) : (
          <Flip
            label="Product shot side"
            value={controls.view === "back" ? "Back" : "Front"}
            other={controls.view === "back" ? "Front" : "Back"}
            disabled={controls.disabled || !controls.viewEditable}
            onFlip={() => controls.onViewChange(controls.view === "back" ? "front" : "back")}
          />
        )}
        <span>·</span>
        <Flip
          label="Garment mode"
          value={controls.isSet ? "Coordinated set" : "Single garment"}
          other={controls.isSet ? "Single garment" : "Coordinated set"}
          disabled={controls.disabled}
          onFlip={() => controls.onSetChange(!controls.isSet)}
        />
        <span className="ml-0.5">— {VIEW_NOTE[controls.viewSource]}</span>
      </div>

      {/* Its own line. Sharing the button row, the label was truncating
          mid-word — "CHATGPT IMAGE GENERATO…" — which is the one thing it
          exists to tell you. */}
      <p className="mb-2 truncate font-mono text-[9.5px] uppercase tracking-[0.12em] text-neutral-400">
        {modelLabel}
      </p>

      <div className="flex items-center gap-3">
        {/* Quiet text, not bordered buttons. Neither is pressed on a normal
            run, and drawn as buttons they competed with the one that is. */}
        <button
          type="button"
          onClick={onOpenSetup}
          className="shrink-0 text-[11.5px] font-semibold text-neutral-500 underline-offset-2 transition hover:text-neutral-900 hover:underline"
        >
          Setup
        </button>
        <button
          type="button"
          onClick={onBatch}
          disabled={!canBatch || busy}
          title={batchDisabledReason}
          className="shrink-0 text-[11.5px] font-semibold text-neutral-500 underline-offset-2 transition hover:text-neutral-900 hover:underline disabled:cursor-not-allowed disabled:text-neutral-300 disabled:no-underline"
        >
          Batch
        </button>
        <span className="flex-1" />
        {/*
          beUI StatefulButton. Generate is a ~110 second action, so its label
          is the only place the interface can say so continuously — the button
          carries analyzing -> generating itself, spinner and all, instead of
          this bar owning a separate progress affordance.
        */}
        <StatefulButton
          state={buttonState}
          onClick={onGenerate}
          disabled={generateDisabled}
          size="sm"
          loadingText={analyzing ? "Analyzing" : "Generating"}
          icon={
            <kbd className="rounded border border-white/30 px-1 font-mono text-[9px] opacity-80">
              ⌘↵
            </kbd>
          }
          className="h-11 shrink-0 rounded-xl px-5 text-[13px] font-bold"
        >
          {generateLabel}
        </StatefulButton>
      </div>
    </div>
  );
}
