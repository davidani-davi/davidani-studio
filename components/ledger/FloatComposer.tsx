"use client";

import { useState } from "react";
import { ChevronUp, Layers, SlidersHorizontal, TriangleAlert, Upload } from "lucide-react";
import Thumb from "@/components/Thumb";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { RoutingControls } from "../RoutingPanel";
import { Flip, GenerateButton, IntakeSlot } from "./ComposerParts";

/**
 * Canvas-first composer: a card floating over the bottom of the stage.
 *
 * The bar holds what changes every run (the photos, the style number,
 * Generate). Everything else (the full intake tiles, side and garment mode,
 * Setup, Batch) opens upward under Options, so the stage keeps its height
 * between runs. The summary line under the bar says what the next run will
 * be without opening anything.
 */

const VIEW_NOTE: Record<RoutingControls["viewSource"], string> = {
  contract: "Two photos, so both sides render together.",
  override: "You set this — it overrides the photo.",
  detected: "Read from your photo.",
  default: "Not readable from the photo — assuming front.",
};

export interface FloatComposerProps {
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
  /** Shown above the bar while a batch runs. */
  progress?: React.ReactNode;
}

export default function FloatComposer(props: FloatComposerProps) {
  const {
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
    canvasNeedsStyleNumber,
    progress,
  } = props;
  const [open, setOpen] = useState(false);
  const [over, setOver] = useState(false);
  const contract = controls.mode === "front-back-contract";
  const side = contract ? "Front + back" : controls.view === "back" ? "Back" : "Front";

  return (
    <div
      className={cn("float-composer", over && "is-over")}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false);
      }}
      onDrop={(e) => {
        // Drops on an intake tile are handled (and stopped) by the tile.
        e.preventDefault();
        setOver(false);
        if (e.dataTransfer.files.length) onAddFiles(e.dataTransfer.files, "front");
      }}
    >
      {progress}
      <div className="float-composer__options" data-open={open || undefined} aria-hidden={!open}>
        <div className="float-composer__options-inner" inert={!open || undefined}>
          <div className="flex gap-2.5">
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
          <div className="flex flex-wrap items-baseline gap-x-1 gap-y-1 text-[13px] text-muted-foreground">
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
          <div className="flex items-center gap-1">
            <Button type="button" variant="ghost" size="sm" onClick={onOpenSetup} className="-ml-2">
              <SlidersHorizontal data-icon="inline-start" aria-hidden />
              Setup
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onBatch}
              disabled={!canBatch || busy}
              title={batchDisabledReason}
            >
              <Layers data-icon="inline-start" aria-hidden />
              Batch
            </Button>
            <span className="min-w-0 flex-1 truncate px-1 text-right text-[11px] text-muted-foreground" title={modelLabel}>
              {modelLabel}
            </span>
          </div>
        </div>
      </div>

      <div className="float-composer__bar">
        <div className="flex shrink-0 gap-1.5">
          <SlotThumb url={frontIntakeUrl} label="Front" onClick={() => setOpen(true)} />
          <SlotThumb url={backIntakeUrl} label="Back" onClick={() => setOpen(true)} />
        </div>
        <Input
          id="composer-style"
          aria-label="Style number"
          type="text"
          value={styleNumber}
          onChange={(e) => onStyleNumberChange(e.target.value)}
          placeholder="Style number"
          spellCheck={false}
          autoCapitalize="characters"
          className={cn(
            "h-10 min-w-0 flex-1 font-mono uppercase tracking-wide placeholder:font-sans placeholder:normal-case placeholder:tracking-normal",
            canvasNeedsStyleNumber && "border-amber-400",
          )}
        />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-10 shrink-0 max-[480px]:px-2"
          aria-expanded={open}
          aria-label={open ? "Close options" : "Options"}
          onClick={() => setOpen((v) => !v)}
        >
          <ChevronUp
            data-icon="inline-start"
            aria-hidden
            className={cn("transition-transform duration-200", open && "rotate-180")}
          />
          <span className="max-[480px]:hidden">Options</span>
        </Button>
        <GenerateButton
          onGenerate={onGenerate}
          label={generateLabel}
          disabled={generateDisabled}
          busy={busy}
          analyzing={analyzing}
          compact
        />
      </div>

      <div className="float-composer__summary">
        {canvasNeedsStyleNumber ? (
          <span className="float-composer__warn">
            <TriangleAlert className="size-3" aria-hidden />
            No style number, so this goes to the empty sweep
          </span>
        ) : null}
        <span>{side}</span>
        <span aria-hidden>·</span>
        <span>{controls.isSet ? "Coordinated set" : "Single garment"}</span>
        <span aria-hidden className="max-[480px]:hidden">·</span>
        <span className="truncate max-[480px]:hidden" title={modelLabel}>
          {modelLabel}
        </span>
      </div>
    </div>
  );
}

function SlotThumb({ url, label, onClick }: { url: string | null; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={url ? `${label} photo for the next run` : `Add a ${label.toLowerCase()} photo`}
      title={url ? `${label} photo` : `Add a ${label.toLowerCase()} photo`}
      className={cn("float-composer__slot", !url && "is-empty")}
    >
      {url ? (
        <Thumb src={url} size={96} alt="" className="h-full w-full object-contain" />
      ) : (
        <Upload className="size-3.5 text-muted-foreground" aria-hidden />
      )}
    </button>
  );
}
