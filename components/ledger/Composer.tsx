"use client";

import type { RoutingControls } from "../RoutingPanel";
import { ComposerActions, FoldedComposer, FoldHandle, Flip, IntakeSlot, StyleField, useComposerFold } from "./ComposerParts";

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

  const [folded, setFolded] = useComposerFold();

  if (folded) {
    return (
      <FoldedComposer
        intakeUrl={frontIntakeUrl}
        styleId="composer-style"
        styleNumber={styleNumber}
        onStyleNumberChange={onStyleNumberChange}
        onDropFiles={(files) => onAddFiles(files, "front")}
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

      <StyleField
        id="composer-style"
        value={styleNumber}
        onChange={onStyleNumberChange}
        warn={canvasNeedsStyleNumber}
      />

      {canvasNeedsStyleNumber && (
        <p className="mb-3 rounded-lg bg-[#fdf3e1] px-3 py-2 text-xs leading-snug text-[#8a5a12] shadow-[inset_0_0_0_1px_rgb(138_90_18/.15)]">
          Category read from the photo alone, so this run goes to the empty sweep. A style number
          buys the approved flat lay.
        </p>
      )}

      {/*
        One line, read as a sentence: what this run is, and where that came
        from. It replaces four segmented pills and a separate note underneath.
      */}
      <div className="mb-3 flex flex-wrap items-baseline gap-x-1 gap-y-1 text-[13px] text-muted-foreground">
        {contract ? (
          <span className="text-[13px] font-medium text-foreground">Front + back</span>
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
