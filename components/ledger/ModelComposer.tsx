"use client";

import { ComposerActions, FoldedComposer, FoldHandle, Flip, IntakeSlot, StyleField, useComposerFold } from "./ComposerParts";
import { cn } from "@/lib/utils";
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
  pantsMode = false,
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
  pantsMode?: boolean;
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
  const who = modelPoseLine(modelName, poseName);

  const [folded, setFolded] = useComposerFold();

  if (folded) {
    return (
      <FoldedComposer
        intakeUrl={slots[0]?.url ?? null}
        styleId="model-composer-style"
        styleNumber={styleNumber}
        onStyleNumberChange={onStyleNumberChange}
        onDropFiles={(files) => onAddFiles(files, 0)}
        onUnfold={() => setFolded(false)}
        generate={{
          onGenerate,
          label: generateLabel,
          disabled: generateDisabled,
          busy,
          analyzing,
        }}
      />
    );
  }

  return (
    <div className="shrink-0 border-t border-border bg-white px-4 pb-4 pt-4">
      <FoldHandle onFold={() => setFolded(true)} />
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

      <StyleField id="model-composer-style" value={styleNumber} onChange={onStyleNumberChange} />

      {needsModel && (
        <p className="mb-3 rounded-lg bg-[#fdf3e1] px-3 py-2 text-xs leading-snug text-[#8a5a12] shadow-[inset_0_0_0_1px_rgb(138_90_18/.15)]">
          No human model chosen yet — pick one in Setup and this run has someone to dress.
        </p>
      )}

      {/*
        The facts line, read as a sentence: who is wearing it, in what pose,
        and what the garment is being treated as.
      */}
      <div className="mb-3 flex flex-wrap items-baseline gap-x-1 gap-y-1 text-[13px] text-muted-foreground">
        <span className="text-[13px] font-medium text-foreground">{who.model}</span>
        {who.pose && (
          <>
            {!who.joined && <span>·</span>}
            <span className={who.joined ? "text-[13px] font-medium text-foreground" : undefined}>
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
        <p className="mb-3 text-xs text-muted-foreground">
          {pantsMode ? "Front, side and back — three waist-down views." : "Front, side, back and full — all four in one run."}
        </p>
      ) : (
        <div className="mb-3 flex items-center gap-0.5 rounded-[10px] bg-muted p-0.5" role="group" aria-label="View to render">
          {VIEWS.filter(option => !pantsMode || option.value !== "full").map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => onViewChange(option.value)}
              disabled={busy}
              aria-pressed={view === option.value}
              className={cn(
                "h-8 flex-1 rounded-lg text-[13px] font-medium transition-[background-color,color,box-shadow] duration-150 disabled:cursor-not-allowed disabled:opacity-60",
                view === option.value
                  ? "bg-white text-foreground shadow-[0_0_0_1px_rgb(0_0_0/.06),0_1px_2px_rgb(0_0_0/.08)]"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}

      <ComposerActions
        modelLabel={modelLabel}
        onOpenSetup={onOpenSetup}
        onBatch={onBatch}
        canBatch={canBatch}
        batchDisabledReason={batchDisabledReason}
        busy={busy}
        analyzing={analyzing}
        onGenerate={onGenerate}
        generateLabel={generateLabel}
        generateDisabled={generateDisabled}
      />
    </div>
  );
}
