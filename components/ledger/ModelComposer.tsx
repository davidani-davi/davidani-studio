"use client";

import { StatefulButton, type ButtonState } from "@/components/motion/button";
import { Flip, IntakeSlot } from "./ComposerParts";
import type { PresetView } from "@/lib/models-registry";
import { modelPoseLine } from "@/lib/model-pose-line";

/**
 * The docked bar at the foot of Model Studio's ledger: what the next run will
 * be, and nothing else.
 *
 * Same argument as Image Studio's composer, applied to the other studio. What
 * changes every run is the garment photo, the style number, and which view is
 * being shot; the human model, the pose, the fit and length nudges, the swap
 * scope and the text overlay are set once and then left alone for a week — so
 * they live behind Setup instead of holding permanent space between the
 * operator and the renders. The one exception is the model and pose, which are
 * printed (not editable) on the facts line, because a run rendered on the
 * wrong model is the mistake this bar exists to make visible.
 *
 * Multi Model Studio has no view control at all: its run IS the four views.
 */

const VIEWS: Array<{ value: PresetView; label: string }> = [
  { value: "front", label: "Front" },
  { value: "side", label: "Side" },
  { value: "back", label: "Back" },
  { value: "full", label: "Full" },
];

export default function ModelComposer({
  slots,
  onAddFiles,
  onClearSlot,
  onSearchErp,
  styleNumber,
  onStyleNumberChange,
  modelName,
  poseName,
  view,
  onViewChange,
  multiView,
  isSet,
  onSetChange,
  setNote,
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
  needsModel,
}: {
  /** One tile per garment photo this run takes: one, or a top/bottom pair. */
  slots: Array<{ url: string | null; label: string; required?: boolean }>;
  onAddFiles: (files: FileList, slot: number) => void;
  onClearSlot: (slot: number) => void;
  onSearchErp: (slot: number) => void;
  styleNumber: string;
  onStyleNumberChange: (value: string) => void;
  modelName: string;
  poseName: string;
  view: PresetView;
  onViewChange: (view: PresetView) => void;
  /** Multi Model Studio renders all four views, so the picker is not shown. */
  multiView: boolean;
  isSet: boolean;
  onSetChange: (isSet: boolean) => void;
  /** How the set is being read — one photo of both pieces, or two photos. */
  setNote: string;
  modelLabel: string;
  onGenerate: () => void;
  generateLabel: string;
  generateDisabled: boolean;
  busy: boolean;
  analyzing: boolean;
  onBatch?: () => void;
  canBatch: boolean;
  batchDisabledReason?: string;
  onOpenSetup: () => void;
  /** No human model chosen yet — the one blocker Setup is the fix for. */
  needsModel: boolean;
}) {
  const buttonState: ButtonState = analyzing || busy ? "loading" : "idle";
  const who = modelPoseLine(modelName, poseName);

  return (
    <div className="shrink-0 border-t border-neutral-200 bg-white px-4 pb-4 pt-3.5">
      <div className="mb-3 flex gap-2.5">
        {slots.map((slot, i) => (
          <IntakeSlot
            key={slot.label}
            url={slot.url}
            label={slot.label}
            required={slot.required}
            disabled={busy}
            onFiles={(files) => onAddFiles(files, i)}
            onClear={slot.url ? () => onClearSlot(i) : undefined}
            onSearchErp={() => onSearchErp(i)}
          />
        ))}
      </div>

      <div className="mb-3">
        <label
          htmlFor="model-composer-style"
          className="mb-1.5 block font-mono text-[9.5px] font-semibold uppercase tracking-[0.12em] text-neutral-500"
        >
          Style number
        </label>
        <input
          id="model-composer-style"
          type="text"
          value={styleNumber}
          onChange={(e) => onStyleNumberChange(e.target.value)}
          placeholder="DWTS67099"
          spellCheck={false}
          autoCapitalize="characters"
          className="h-10 w-full rounded-lg border border-neutral-200 bg-white px-3 font-mono text-[13px] uppercase tracking-wide outline-none transition placeholder:text-neutral-300 focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
        />
      </div>

      {needsModel && (
        <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-snug text-amber-800">
          No human model chosen yet — pick one in Setup and this run has someone to dress.
        </p>
      )}

      {/*
        The facts line, read as a sentence: who is wearing it, in what pose,
        and what the garment is being treated as.
      */}
      <div className="mb-3 flex flex-wrap items-baseline gap-x-1 gap-y-1 text-[12px] text-neutral-500">
        <span className="text-[12.5px] font-bold text-neutral-800">{who.model}</span>
        {who.pose && (
          <>
            {!who.joined && <span>·</span>}
            <span className={who.joined ? "text-[12.5px] font-bold text-neutral-800" : undefined}>
              {who.pose}
            </span>
          </>
        )}
        <span>·</span>
        <Flip
          label="Garment mode"
          value={isSet ? "Coordinated set" : "Single garment"}
          other={isSet ? "Single garment" : "Coordinated set"}
          disabled={busy}
          onFlip={() => onSetChange(!isSet)}
        />
        {setNote && <span className="ml-0.5">— {setNote}</span>}
      </div>

      {multiView ? (
        <p className="mb-2 text-[11.5px] text-neutral-500">
          Front, side, back and full — all four in one run.
        </p>
      ) : (
        <div className="mb-3 flex items-center gap-1" role="group" aria-label="View to render">
          {VIEWS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => onViewChange(option.value)}
              disabled={busy}
              aria-pressed={view === option.value}
              className={`h-7 flex-1 rounded-md border text-[11px] font-bold transition disabled:cursor-not-allowed ${
                view === option.value
                  ? "border-neutral-900 bg-neutral-900 text-white"
                  : "border-neutral-200 bg-white text-neutral-600 hover:border-neutral-400 hover:text-neutral-900"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}

      <p className="mb-2 truncate font-mono text-[9.5px] uppercase tracking-[0.12em] text-neutral-400">
        {modelLabel}
      </p>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onOpenSetup}
          className="shrink-0 text-[11.5px] font-semibold text-neutral-500 underline-offset-2 transition hover:text-neutral-900 hover:underline"
        >
          Setup
        </button>
        {onBatch && (
          <button
            type="button"
            onClick={onBatch}
            disabled={!canBatch || busy}
            title={batchDisabledReason}
            className="shrink-0 text-[11.5px] font-semibold text-neutral-500 underline-offset-2 transition hover:text-neutral-900 hover:underline disabled:cursor-not-allowed disabled:text-neutral-300 disabled:no-underline"
          >
            Batch
          </button>
        )}
        <span className="flex-1" />
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
