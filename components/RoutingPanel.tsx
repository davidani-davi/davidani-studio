"use client";

import type { ProductShotMode } from "./PromptPanel";
import {
  summarizeRouting,
  type CanvasSummary,
  type RoutingPayload,
  type RoutingRow,
} from "@/lib/routing-summary";

/**
 * Shows how the studio arrived at this render.
 *
 * Replaces the product-shot preset grid. That grid offered a canvas choice
 * that outranked the routed one, which stopped making sense once the category
 * came from the ERP and the style code: the useful correction is to the INPUT
 * (a wrong style number, a wrong category), not to the canvas that fell out of
 * it. So this panel is read-only by design — it explains, and the fix lives
 * one section up in the style field.
 */

const STATE_DOT: Record<RoutingRow["state"], string> = {
  decided: "bg-brand-500",
  overridden: "bg-neutral-300",
  fallback: "bg-amber-400",
  muted: "bg-neutral-300",
};

/**
 * The two facts the rail can show instead of asking for them up front.
 *
 * These replace the "Product shot workflow" cards and the garment-mode pills,
 * which sat above the prompt and asked for decisions before there was a photo
 * to read them from. Supplied only by Image Studio; OutputPanel renders this
 * same component for run provenance and passes neither, so it stays read-only
 * there.
 */
export interface RoutingControls {
  mode: ProductShotMode;
  view: "front" | "back";
  /** Where `view` came from — changes the wording, not the value. */
  viewSource: "contract" | "override" | "detected" | "default";
  viewEditable: boolean;
  onViewChange: (view: "front" | "back") => void;
  isSet: boolean;
  onSetChange: (isSet: boolean) => void;
  disabled?: boolean;
}

const VIEW_NOTE: Record<RoutingControls["viewSource"], string> = {
  contract: "Two photos define one SKU, so both sides render together.",
  override: "You set this. It overrides what the photo shows.",
  detected: "Read from your photo. Change it to render the other side instead.",
  default: "Not readable from the photo — assuming front.",
};

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
    <div role="radiogroup" aria-label={label} className="mt-1 flex gap-1">
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
            className={`rounded-md border px-2 py-1 text-[11px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-45 ${
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

export default function RoutingPanel({
  routing,
  canvas,
  pending,
  controls,
}: {
  routing: RoutingPayload | null;
  canvas: CanvasSummary | null;
  /** True while an analyze call is in flight, so the panel can hold its shape. */
  pending?: boolean;
  /** Omitted for run provenance, where nothing is correctable any more. */
  controls?: RoutingControls;
}) {
  const rows = summarizeRouting(routing, canvas);

  if (pending) {
    return (
      <p className="text-[11px] text-neutral-500">Working out the category and canvas…</p>
    );
  }

  if (rows.length === 0) {
    return (
      <p className="text-[11px] leading-relaxed text-neutral-500">
        Upload a product photo to see which category, canvas and description source this style
        resolves to.
      </p>
    );
  }

  return (
    <>
      {controls && (
        <div className="mb-1 border-b border-neutral-100 pb-2">
          <div className="py-2">
            <span className="block text-[9px] font-semibold uppercase tracking-widest text-neutral-400">
              Side
            </span>
            {controls.mode === "front-back-contract" ? (
              <span className="mt-0.5 block text-[12px] font-semibold leading-snug text-neutral-800">
                Front + back contract
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
            <span className="mt-1 block text-[10px] leading-snug text-neutral-500">
              {VIEW_NOTE[controls.viewSource]}
            </span>
          </div>
          <div className="py-2">
            <span className="block text-[9px] font-semibold uppercase tracking-widest text-neutral-400">
              Garment
            </span>
            <Segmented
              label="Garment mode"
              value={controls.isSet ? "set" : "single"}
              disabled={controls.disabled}
              onChange={(value) => controls.onSetChange(value === "set")}
              options={[
                { value: "single", label: "Single garment" },
                { value: "set", label: "Coordinated set" },
              ]}
            />
            <span className="mt-1 block text-[10px] leading-snug text-neutral-500">
              Coordinated set describes a top and a bottom separately from one photo.
            </span>
          </div>
        </div>
      )}
      <ol className="space-y-0">
      {rows.map((row, i) => (
        <li
          key={row.key}
          className={`grid grid-cols-[0.5rem_1fr] items-start gap-x-2.5 py-2 ${
            i < rows.length - 1 ? "border-b border-neutral-100" : "pb-0"
          }`}
        >
          <span
            aria-hidden="true"
            className={`mt-1.5 h-2 w-2 rounded-full ${STATE_DOT[row.state]}`}
          />
          <div>
            <span className="block text-[9px] font-semibold uppercase tracking-widest text-neutral-400">
              {row.label}
            </span>
            <span className="block text-[12px] font-semibold leading-snug text-neutral-800">
              {row.struck && (
                <span className="mr-1.5 font-medium text-neutral-400 line-through">
                  {row.struck}
                </span>
              )}
              {row.value}
            </span>
            {row.note && (
              <span className="mt-0.5 block text-[10px] leading-snug text-neutral-500">
                {row.note}
              </span>
            )}
          </div>
        </li>
      ))}
      </ol>
    </>
  );
}
