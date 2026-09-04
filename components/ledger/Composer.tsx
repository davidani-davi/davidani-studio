"use client";

import { StatefulButton, type ButtonState } from "@/components/motion/button";
import type { RoutingControls } from "../RoutingPanel";
import { Flip, IntakeSlot } from "./ComposerParts";

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
  onSearchErp,
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
  onSearchErp: (slot: "front" | "back") => void;
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
          onSearchErp={() => onSearchErp("front")}
        />
        <IntakeSlot
          url={backIntakeUrl}
          label="Back"
          disabled={busy}
          onFiles={(files) => onAddFiles(files, "back")}
          onClear={backIntakeUrl ? () => onClearIntake(backIntakeUrl) : undefined}
          onSearchErp={() => onSearchErp("back")}
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
