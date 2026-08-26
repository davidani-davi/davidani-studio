"use client";

import { useRef, useState } from "react";
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
    <div className="flex flex-col gap-1">
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
        className={`group relative h-[52px] w-[42px] overflow-hidden rounded-lg border transition ${
          over
            ? "border-brand-500 bg-brand-50"
            : url
            ? "border-brand-200 bg-[#edeeee]"
            : "border-dashed border-neutral-300 bg-neutral-50"
        }`}
      >
        <button
          type="button"
          disabled={disabled}
          onClick={() => input.current?.click()}
          className="absolute inset-0 flex items-center justify-center disabled:cursor-not-allowed"
          title={url ? `Replace ${label.toLowerCase()}` : `Upload ${label.toLowerCase()}`}
        >
          {url ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={url} alt={`${label} product photo`} className="h-full w-full object-cover" />
          ) : (
            <span className="text-[15px] leading-none text-neutral-400">+</span>
          )}
        </button>
        {url && onClear && (
          <button
            type="button"
            onClick={onClear}
            aria-label={`Remove ${label.toLowerCase()}`}
            className="absolute right-0 top-0 hidden rounded-bl-md bg-neutral-900/80 px-1 text-[9px] leading-4 text-white group-hover:block"
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
      <span className="text-center font-mono text-[7.5px] uppercase tracking-[0.12em] text-neutral-400">
        {label}
        {required ? " *" : ""}
      </span>
    </div>
  );
}

function Segmented<T extends string>({
  label,
  value,
  options,
  disabled,
  onChange,
}: {
  label: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  disabled?: boolean;
  onChange: (value: T) => void;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex gap-1">
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            onClick={() => onChange(option.value)}
            className={`rounded-md border px-2 py-1 text-[10px] font-bold transition disabled:cursor-not-allowed disabled:opacity-45 ${
              active
                ? "border-neutral-900 bg-neutral-900 text-white"
                : "border-neutral-200 bg-white text-neutral-600 hover:border-neutral-400"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
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

  return (
    <div className="shrink-0 border-t border-neutral-200 bg-white px-3 pb-3 pt-2.5">
      <div className="mb-2.5 flex items-end gap-2">
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
        <div className="min-w-0 flex-1">
          <label
            htmlFor="composer-style"
            className="mb-1 block font-mono text-[7.5px] uppercase tracking-[0.12em] text-neutral-400"
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
            className={`w-full rounded-md border bg-white px-2.5 py-1.5 font-mono text-[11px] uppercase tracking-wide outline-none transition focus:ring-2 focus:ring-brand-100 ${
              canvasNeedsStyleNumber
                ? "border-amber-300 focus:border-amber-400"
                : "border-neutral-200 focus:border-brand-500"
            }`}
          />
        </div>
      </div>

      {canvasNeedsStyleNumber && (
        <p className="mb-2.5 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[9.5px] leading-snug text-amber-800">
          Category read from the photo alone, so this run goes to the empty sweep. A style number
          buys the approved flat lay.
        </p>
      )}

      <div className="mb-2.5 flex flex-wrap items-center gap-x-2 gap-y-1.5">
        {contract ? (
          <span className="rounded-md border border-neutral-900 bg-neutral-900 px-2 py-1 text-[10px] font-bold text-white">
            Front + back
          </span>
        ) : (
          <Segmented
            label="Product shot side"
            value={controls.view}
            disabled={controls.disabled || !controls.viewEditable}
            onChange={controls.onViewChange}
            options={[
              { value: "front", label: "Front" },
              { value: "back", label: "Back" },
            ]}
          />
        )}
        <Segmented
          label="Garment mode"
          value={controls.isSet ? "set" : "single"}
          disabled={controls.disabled}
          onChange={(value) => controls.onSetChange(value === "set")}
          options={[
            { value: "single", label: "Single" },
            { value: "set", label: "Set" },
          ]}
        />
        <span className="flex-1" />
        <button
          type="button"
          onClick={onOpenSetup}
          className="rounded-md border border-neutral-200 bg-white px-2 py-1 text-[10px] font-bold text-neutral-600 transition hover:border-neutral-400"
        >
          Setup
        </button>
      </div>

      <p className="mb-2.5 text-[9.5px] leading-snug text-neutral-500">
        {VIEW_NOTE[controls.viewSource]}
      </p>

      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate font-mono text-[8px] uppercase tracking-[0.12em] text-neutral-400">
          {modelLabel}
        </span>
        <button
          type="button"
          onClick={onBatch}
          disabled={!canBatch || busy}
          title={batchDisabledReason}
          className="rounded-md border border-neutral-200 bg-white px-2.5 py-1.5 text-[10px] font-bold text-neutral-700 transition hover:border-neutral-400 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Batch
        </button>
        <button
          type="button"
          onClick={onGenerate}
          disabled={generateDisabled || busy}
          className="flex items-center gap-1.5 rounded-lg bg-neutral-900 px-4 py-2 text-[11px] font-bold text-white transition hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {analyzing ? "Analyzing…" : busy ? "Generating…" : generateLabel}
          {!busy && !analyzing && (
            <kbd className="rounded border border-white/30 px-1 font-mono text-[8px] opacity-80">
              ⌘↵
            </kbd>
          )}
        </button>
      </div>
    </div>
  );
}
