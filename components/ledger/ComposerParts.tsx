"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeftRight, ChevronDown, ChevronUp, Layers, Search, SlidersHorizontal, Sparkles, Upload, X } from "lucide-react";
import Thumb from "@/components/Thumb";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

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
        // The floating composer also takes drops; this tile's slot wins.
        e.stopPropagation();
        setOver(false);
        if (!disabled && e.dataTransfer.files.length) onFiles(e.dataTransfer.files);
      }}
      className={cn(
        "group relative h-[124px] flex-1 overflow-hidden rounded-xl transition-[background-color,box-shadow] duration-150",
        over
          ? "bg-white shadow-[0_0_0_2px_var(--color-foreground)]"
          : url
          ? "bg-[#edeeee] shadow-[0_0_0_1px_rgb(0_0_0/.08)]"
          : "bg-white shadow-[0_0_0_1px_rgb(0_0_0/.08),0_1px_2px_rgb(0_0_0/.04)] hover:shadow-[0_0_0_1px_rgb(0_0_0/.16),0_2px_6px_-2px_rgb(0_0_0/.08)]",
      )}
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
          <Thumb src={url} size={384} loading="eager" alt={`${label} product photo`} className="h-full w-full object-contain" />
        ) : (
          <>
            <span className="grid size-8 place-items-center rounded-lg bg-muted text-muted-foreground transition group-hover:bg-foreground group-hover:text-background">
              <Upload className="size-4" aria-hidden />
            </span>
            <span className="text-[13px] font-medium text-foreground">Drop or click</span>
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
        className="absolute inset-x-2 bottom-2 flex h-7 items-center justify-center gap-1.5 rounded-lg bg-white/90 text-xs font-medium text-foreground shadow-[0_0_0_1px_rgb(0_0_0/.08),0_1px_2px_rgb(0_0_0/.06)] backdrop-blur-sm transition hover:bg-white disabled:cursor-not-allowed disabled:text-muted-foreground"
      >
        <Search className="size-3.5" aria-hidden />
        ERP photos
      </button>

      {/* The slot's name sits on the tile rather than under it — under it, at
          the size that caption had to be, it read as noise. */}
      <span
        className={cn(
          "pointer-events-none absolute left-2 top-2 rounded-md px-1.5 py-0.5 text-xs font-medium",
          url ? "bg-white/90 text-foreground shadow-[0_0_0_1px_rgb(0_0_0/.06)]" : "text-muted-foreground",
        )}
      >
        {label}
        {required ? " *" : ""}
      </span>

      {url && onClear && (
        <button
          type="button"
          onClick={onClear}
          aria-label={`Remove ${label.toLowerCase()}`}
          className="absolute right-2 top-2 flex size-7 items-center justify-center rounded-lg bg-white/90 text-foreground opacity-0 shadow-[0_0_0_1px_rgb(0_0_0/.08)] transition hover:bg-white focus-visible:opacity-100 group-hover:opacity-100 max-[480px]:opacity-100"
        >
          <X className="size-3.5" aria-hidden />
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
      className="group -mx-0.5 inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[13px] font-medium text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:text-muted-foreground disabled:hover:bg-transparent"
    >
      {value}
      <ArrowLeftRight
        aria-hidden
        className="size-3 text-muted-foreground transition group-hover:text-foreground group-disabled:opacity-0"
      />
    </button>
  );
}

/** The style number field both composers open with. */
export function StyleField({
  id,
  value,
  onChange,
  warn,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  /** Amber edge when the canvas needs a style number to do better. */
  warn?: boolean;
}) {
  return (
    <div className="mb-3 flex items-center gap-3">
      <label htmlFor={id} className="w-[5.5rem] shrink-0 text-xs font-medium text-muted-foreground">
        Style number
      </label>
      <Input
        id={id}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="DWTS67099"
        spellCheck={false}
        autoCapitalize="characters"
        className={cn("h-9 font-mono uppercase tracking-wide", warn && "border-amber-400")}
      />
    </div>
  );
}

/**
 * The bottom of both composers: the engine line, the two quiet actions and the
 * one that matters. Generate is the only filled button on the screen, and while
 * a run is in flight it says which step it is on.
 */
export function ComposerActions({
  modelLabel,
  onOpenSetup,
  onBatch,
  canBatch,
  batchDisabledReason,
  busy,
  analyzing,
  onGenerate,
  generateLabel,
  generateDisabled,
}: {
  modelLabel: string;
  onOpenSetup: () => void;
  onBatch?: () => void;
  canBatch?: boolean;
  batchDisabledReason?: string;
  busy: boolean;
  analyzing: boolean;
  onGenerate: () => void;
  generateLabel: string;
  generateDisabled: boolean;
}) {
  return (
    <>
      <div className="flex items-center gap-1">
        <Button type="button" variant="ghost" size="sm" onClick={onOpenSetup} className="-ml-2">
          <SlidersHorizontal data-icon="inline-start" aria-hidden />
          Setup
        </Button>
        {onBatch && (
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
        )}
        <span className="min-w-0 flex-1 truncate px-1 text-right text-[11px] text-muted-foreground" title={modelLabel}>
          {modelLabel}
        </span>
        <GenerateButton
          onGenerate={onGenerate}
          label={generateLabel}
          disabled={generateDisabled}
          busy={busy}
          analyzing={analyzing}
        />
      </div>
    </>
  );
}

/** The one filled button in a composer, folded or open. */
export function GenerateButton({
  onGenerate,
  label,
  disabled,
  busy,
  analyzing,
  compact,
}: {
  onGenerate: () => void;
  label: string;
  disabled: boolean;
  busy: boolean;
  analyzing: boolean;
  compact?: boolean;
}) {
  const working = busy || analyzing;
  return (
    <Button
      type="button"
      size="lg"
      onClick={onGenerate}
      disabled={disabled || working}
      className={cn("h-10 px-4", compact ? "shrink-0" : "min-w-[9.5rem]")}
    >
      {working ? (
        <Spinner data-icon="inline-start" aria-hidden />
      ) : (
        <Sparkles data-icon="inline-start" aria-hidden />
      )}
      {working ? (analyzing ? "Analyzing" : "Generating") : label}
      {!working && !compact && (
        <kbd className="ml-1 rounded border border-white/25 px-1 font-mono text-[10px] opacity-70 max-[480px]:hidden">
          ⌘↵
        </kbd>
      )}
    </Button>
  );
}

const FOLD_KEY = "davidani_composer_folded_v1";

/**
 * Whether the composer is folded to one line. Remembered per browser, so an
 * operator reviewing runs all afternoon does not refold it after every reload.
 */
export function useComposerFold() {
  const [folded, setFolded] = useState(false);
  useEffect(() => {
    try {
      setFolded(window.localStorage.getItem(FOLD_KEY) === "1");
    } catch {}
  }, []);
  function set(next: boolean) {
    setFolded(next);
    try {
      window.localStorage.setItem(FOLD_KEY, next ? "1" : "0");
    } catch {}
  }
  return [folded, set] as const;
}

/** The thin handle along the top of an open composer. */
export function FoldHandle({ onFold }: { onFold: () => void }) {
  return (
    <button
      type="button"
      onClick={onFold}
      aria-label="Fold the composer"
      aria-expanded
      title="Fold the composer to one line"
      className="-mt-2.5 mb-1 flex h-5 w-full items-center justify-center rounded-md text-muted-foreground transition hover:bg-muted hover:text-foreground"
    >
      <ChevronDown className="size-4" aria-hidden />
    </button>
  );
}

/**
 * The composer folded to one line: the photo that will go in, the style
 * number, Generate. Dropping a photo anywhere on it opens the composer again,
 * because that is the moment the full controls are needed.
 */
export function FoldedComposer({
  intakeUrl,
  styleId,
  styleNumber,
  onStyleNumberChange,
  onDropFiles,
  onUnfold,
  generate,
}: {
  intakeUrl: string | null;
  styleId: string;
  styleNumber: string;
  onStyleNumberChange: (value: string) => void;
  onDropFiles: (files: FileList) => void;
  onUnfold: () => void;
  generate: Parameters<typeof GenerateButton>[0];
}) {
  const [over, setOver] = useState(false);
  return (
    <div
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        if (e.dataTransfer.files.length) {
          onDropFiles(e.dataTransfer.files);
          onUnfold();
        }
      }}
      className={cn(
        "flex shrink-0 items-center gap-2 border-t border-border bg-white px-3 py-2.5 transition-shadow",
        over && "shadow-[inset_0_0_0_2px_var(--color-foreground)]",
      )}
    >
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={onUnfold}
        aria-label="Open the composer"
        aria-expanded={false}
        title="Open the composer"
        className="shrink-0"
      >
        <ChevronUp aria-hidden />
      </Button>
      <button
        type="button"
        onClick={onUnfold}
        aria-label={intakeUrl ? "Photo for the next run" : "Add a photo"}
        title={intakeUrl ? "Photo for the next run" : "Add a photo"}
        className="relative h-10 w-[30px] shrink-0 overflow-hidden rounded-md bg-muted shadow-[inset_0_0_0_1px_rgb(0_0_0/.06)]"
      >
        {intakeUrl ? (
          <Thumb src={intakeUrl} size={128} alt="Next run photo" className="h-full w-full object-contain" />
        ) : (
          <Upload className="mx-auto size-3.5 text-muted-foreground" aria-hidden />
        )}
      </button>
      <Input
        id={styleId}
        aria-label="Style number"
        type="text"
        value={styleNumber}
        onChange={(e) => onStyleNumberChange(e.target.value)}
        placeholder="Style number"
        spellCheck={false}
        autoCapitalize="characters"
        className="h-10 min-w-0 flex-1 font-mono uppercase tracking-wide placeholder:font-sans placeholder:normal-case placeholder:tracking-normal"
      />
      <GenerateButton {...generate} compact />
    </div>
  );
}
