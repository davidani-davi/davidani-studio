"use client";

import { useEffect, useRef, useState } from "react";
import type {
  GarmentFitAdjustment,
  GarmentLengthAdjustment,
} from "@/lib/fal";

// Approximate end-to-end timing for the Studio 1 trio run, used to drive the
// status-chip ETA. Vision pass ~6s; three NB calls in parallel ~20s, plus
// first-time pose photo uploads ≈ 30-40s total. Erring slightly long is
// better than short — a chip that stays at "Finishing up…" briefly is fine,
// but a chip that hits zero too early feels broken.
const TRIO_TOTAL_ESTIMATE_MS = 35_000;
const SINGLE_TOTAL_ESTIMATE_MS = 22_000;
const ANALYZER_ESTIMATE_MS = 6_000;

export interface BatchProgress {
  /** Total images in the batch (i.e. how many were selected at kick-off). */
  total: number;
  /** How many we've finished — includes both successes and failures. */
  done: number;
  /** How many failed. */
  failed: number;
  /** Current stage for the in-flight image, so the chip can show "analyzing" vs "generating". */
  stage: "analyzing" | "generating" | "idle";
}

export interface AnalysisReview {
  garment: string;
  features: string;
  updatedAt: number;
  edited?: boolean;
}

export type ProductShotMode = "single-front" | "single-back" | "front-back-contract";

interface Props {
  prompt: string;
  onPromptChange: (v: string) => void;
  numImages: number;
  onNumImagesChange: (n: number) => void;
  onAnalyze?: () => void;
  /**
   * Runs analyze → generate as a single atomic flow. The button always
   * re-analyzes on every click so the prompt stays in sync with the current
   * photo + two-piece-toggle state; users can tweak the Brief textarea for
   * debugging but the next click will overwrite their edits.
   */
  onGenerate: () => void;
  analyzing: boolean;
  loading: boolean;
  disabled: boolean;
  /** Optional batch wiring — only Image Studio passes these. */
  onBatchGenerate?: () => void;
  canBatch?: boolean;
  batchProgress?: BatchProgress | null;

  /**
   * When true, the unified Generate button routes through the coordinated-set
   * analyzer (four fields: TOP / TOP_FEATURES / BOTTOM / BOTTOM_FEATURES) and
   * assembles the two-piece swap prompt instead of the single-garment one.
   * Ship this as a user toggle — the reference photo alone isn't reliably
   * auto-classifiable.
   */
  twoPiece: boolean;
  onTwoPieceChange: (v: boolean) => void;
  /**
   * Optional 3-way garment-mode control. When provided, replaces the legacy
   * `Coordinated 2-piece set` checkbox with a 3-button radio:
   *   - single                → one garment, one image
   *   - set-single-image      → coordinated top + bottom shown in ONE photo
   *                             (full-body shot, flat-lay, styled outfit)
   *   - set-separate-images   → coordinated set uploaded as two photos
   * The backend distinguishes single-vs-separate by the number of garment URLs
   * sent; the radio choice both labels the UI and clamps the uploaded URL
   * slice in the parent.
   * If not passed, the legacy checkbox is rendered for backwards compat.
   */
  garmentMode?: "single" | "set-single-image" | "set-separate-images";
  onGarmentModeChange?: (
    mode: "single" | "set-single-image" | "set-separate-images"
  ) => void;
  /** Restricts which radio options render. Defaults to all three. */
  garmentModeOptions?: Array<"single" | "set-single-image" | "set-separate-images">;
  fitAdjustment?: GarmentFitAdjustment;
  onFitAdjustmentChange?: (v: GarmentFitAdjustment) => void;
  lengthAdjustment?: GarmentLengthAdjustment;
  onLengthAdjustmentChange?: (v: GarmentLengthAdjustment) => void;
  pantsAdjustments?: boolean;
  analysisReview?: AnalysisReview | null;
  onAnalysisReviewChange?: (review: AnalysisReview) => void;
  /**
   * Swap-area control. "auto" defers to the analyzer's inferred scope
   * (current default); the three explicit values force that scope and skip
   * the inference. Surfacing this prevents the silent failure where
   * inferSwapScope("…romper romper") quietly upgrades to full-outfit
   * replacement without the user realizing.
   */
  swapScopeChoice?: "auto" | "upper-body" | "lower-body" | "full-look";
  onSwapScopeChoiceChange?: (
    choice: "auto" | "upper-body" | "lower-body" | "full-look"
  ) => void;
  /** Latest inferred scope from the analyzer — shown as the auto fallback hint. */
  inferredScope?: "upper-body" | "lower-body" | "full-look";
  hideTwoPieceToggle?: boolean;
  hideVariantControl?: boolean;
  /**
   * Hides the collapsible raw-prompt drawer. Image Studio assembles its brief
   * from the routing chain, so a hand-editable copy is a second source of
   * truth that silently overrides it on the next Generate.
   */
  hideAdvancedPrompt?: boolean;
  generateLabel?: string;
  productShotMode?: ProductShotMode;
  onProductShotModeChange?: (mode: ProductShotMode) => void;
  productShotModeDisabled?: Partial<Record<ProductShotMode, boolean>>;
}

const GENERAL_FIT_OPTIONS: { value: GarmentFitAdjustment; label: string }[] = [
  { value: "fitted", label: "Fitted" },
  { value: "true-to-reference", label: "True" },
  { value: "oversized", label: "Oversized" },
];

const PANTS_FIT_OPTIONS: { value: GarmentFitAdjustment; label: string }[] = [
  { value: "true-to-reference", label: "True" },
  { value: "barrel", label: "Barrel" },
  { value: "wide-leg", label: "Wide" },
  { value: "straight-leg", label: "Straight" },
  { value: "flare", label: "Flared" },
  { value: "bootcut", label: "Bootcut" },
  { value: "skinny", label: "Skinny" },
  { value: "slim", label: "Slim" },
  { value: "relaxed", label: "Relaxed" },
  { value: "baggy", label: "Baggy" },
  { value: "tapered", label: "Tapered" },
  { value: "cargo", label: "Cargo" },
];

const GENERAL_LENGTH_OPTIONS: { value: GarmentLengthAdjustment; label: string }[] = [
  { value: "shorter", label: "Shorter" },
  { value: "true-to-reference", label: "True" },
  { value: "longer", label: "Longer" },
];

const PANTS_LENGTH_OPTIONS: { value: GarmentLengthAdjustment; label: string }[] = [
  { value: "true-to-reference", label: "True" },
  { value: "cropped", label: "Cropped" },
  { value: "ankle", label: "Ankle" },
  { value: "full-length", label: "Full" },
  { value: "floor-grazing", label: "Long" },
  { value: "cuffed", label: "Cuffed" },
  { value: "bermuda", label: "Bermuda" },
];

/* ---------- Icons (inline SVG) ---------- */

const IconSparkle = (
  <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
    <path d="M10 2a.75.75 0 01.7.48l1.22 3.15a2 2 0 001.15 1.15l3.15 1.22a.75.75 0 010 1.4l-3.15 1.22a2 2 0 00-1.15 1.15l-1.22 3.15a.75.75 0 01-1.4 0l-1.22-3.15a2 2 0 00-1.15-1.15L3.78 9.4a.75.75 0 010-1.4l3.15-1.22a2 2 0 001.15-1.15L9.3 2.48A.75.75 0 0110 2zm6 10a.5.5 0 01.47.33l.53 1.42a1 1 0 00.58.58l1.42.53a.5.5 0 010 .94l-1.42.53a1 1 0 00-.58.58l-.53 1.42a.5.5 0 01-.94 0l-.53-1.42a1 1 0 00-.58-.58l-1.42-.53a.5.5 0 010-.94l1.42-.53a1 1 0 00.58-.58l.53-1.42A.5.5 0 0116 12z" />
  </svg>
);

const IconWand = (
  <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
    <path d="M14.5 1.5a.75.75 0 01.7.48l.45 1.17a1 1 0 00.6.6l1.17.45a.75.75 0 010 1.4l-1.17.45a1 1 0 00-.6.6l-.45 1.17a.75.75 0 01-1.4 0l-.45-1.17a1 1 0 00-.6-.6L11.58 5.6a.75.75 0 010-1.4l1.17-.45a1 1 0 00.6-.6l.45-1.17a.75.75 0 01.7-.48zM9.29 6.29a1 1 0 011.42 0l3 3a1 1 0 010 1.42l-8 8a1 1 0 01-1.42 0l-3-3a1 1 0 010-1.42l8-8zM4.71 14.29L5.59 15.17 13.17 7.59 12.29 6.71 4.71 14.29z" />
  </svg>
);

const Spinner = ({ className = "h-4 w-4" }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={`${className} animate-spin`}>
    <circle
      cx="12"
      cy="12"
      r="10"
      stroke="currentColor"
      strokeOpacity="0.25"
      strokeWidth="3"
      fill="none"
    />
    <path
      d="M12 2a10 10 0 0110 10"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      fill="none"
    />
  </svg>
);

/* ---------- Component ---------- */

export default function PromptPanel(p: Props) {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const hasPrompt = p.prompt.trim().length > 0;
  const chars = p.prompt.length;
  const words = p.prompt.trim() ? p.prompt.trim().split(/\s+/).length : 0;

  const batchActive = !!p.batchProgress;

  // Tri-state for the little status chip at the top-right of the header.
  // When a batch is running we override the chip with batch progress.
  const status: "idle" | "analyzing" | "ready" | "generating" = p.analyzing
    ? "analyzing"
    : p.loading
    ? "generating"
    : hasPrompt
    ? "ready"
    : "idle";

  // Live ETA — when analyzing or generating, run a wall-clock timer and show
  // remaining seconds. Implementation uses a ref for the start timestamp so
  // re-renders triggered by parent state changes don't reset the timer; the
  // tick state is what drives re-renders during the run.
  const isTicking = status === "analyzing" || status === "generating";
  const startRef = useRef<number | null>(null);
  const [tickNow, setTickNow] = useState<number>(() => Date.now());

  useEffect(() => {
    if (!isTicking) {
      startRef.current = null;
      return;
    }
    startRef.current = Date.now();
    setTickNow(Date.now());
    const interval = window.setInterval(() => {
      setTickNow(Date.now());
    }, 500);
    return () => window.clearInterval(interval);
  }, [isTicking, status]);

  const elapsedMs =
    isTicking && startRef.current !== null ? tickNow - startRef.current : 0;
  const totalEstimateMs =
    status === "analyzing"
      ? ANALYZER_ESTIMATE_MS
      : status === "generating"
      ? TRIO_TOTAL_ESTIMATE_MS
      : SINGLE_TOTAL_ESTIMATE_MS;
  const remainingSeconds = Math.max(
    0,
    Math.ceil((totalEstimateMs - elapsedMs) / 1000)
  );
  // Once the countdown reaches 0, display a static "Finishing up…" label
  // rather than counting overrun seconds upward. Counting up makes users
  // feel the system is broken; a stuck label is calmer.
  const etaText =
    remainingSeconds > 0 ? `~${remainingSeconds}s left` : "Finishing up…";

  const stageText: Record<typeof status, string> = {
    idle: "Waiting for photo",
    analyzing: "Reading your garment",
    ready: "Prompt ready",
    generating: "Painting variants",
  };

  const statusChip = batchActive
    ? {
        text: `Batch ${p.batchProgress!.done} / ${p.batchProgress!.total}${
          p.batchProgress!.failed > 0 ? ` · ${p.batchProgress!.failed} failed` : ""
        }`,
        dot: "bg-brand-500 animate-pulse",
        className: "bg-brand-50 text-brand-700",
      }
    : {
        idle: {
          text: stageText.idle,
          dot: "bg-neutral-300",
          className: "bg-neutral-100 text-neutral-500",
        },
        analyzing: {
          text: `${stageText.analyzing} · ${etaText}`,
          dot: "bg-amber-400 animate-pulse",
          className: "bg-amber-50 text-amber-700",
        },
        ready: {
          text: stageText.ready,
          dot: "bg-emerald-500",
          className: "bg-emerald-50 text-emerald-700",
        },
        generating: {
          text: `${stageText.generating} · ${etaText}`,
          dot: "bg-brand-500 animate-pulse",
          className: "bg-brand-50 text-brand-700",
        },
      }[status];
  const fitOptions = p.pantsAdjustments ? PANTS_FIT_OPTIONS : GENERAL_FIT_OPTIONS;
  const lengthOptions = p.pantsAdjustments ? PANTS_LENGTH_OPTIONS : GENERAL_LENGTH_OPTIONS;
  const productShotOptions: Array<{ value: ProductShotMode; label: string; hint: string }> = [
    {
      value: "single-front",
      label: "Generate Single Front",
      hint: "One garment reference, front product shot.",
    },
    {
      value: "single-back",
      label: "Generate Single Back",
      hint: "One garment reference, back product shot.",
    },
    {
      value: "front-back-contract",
      label: "Generate Using Front + Back References",
      hint: "Two garment references define one SKU contract.",
    },
  ];

  return (
    <section className="flex min-w-0 flex-1 flex-col border-b border-neutral-200 bg-white lg:border-b-0 lg:border-r">
      {/* ========== HEADER ========== */}
      <div className="flex items-center justify-between border-b border-neutral-200 px-6 py-4">
        <div>
          <h2 className="text-sm font-semibold text-neutral-900">Shot Setup</h2>
          <p className="text-[11px] text-neutral-500">
            Upload a garment, check the routing, then generate the product shot.
          </p>
        </div>
        <span
          className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold tabular-nums ${statusChip.className}`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${statusChip.dot}`} />
          {statusChip.text}
        </span>
      </div>

      {/* ========== TWO-PIECE TOGGLE STRIP ==========
          Compact inline control — the Analyze card was removed when Analyze
          was folded into Generate, but the two-piece-set routing decision
          still has to live somewhere the user can reach it before clicking
          Generate. Keep it slim so the textarea below stays the focal point. */}
      {!p.hideTwoPieceToggle && (
      <div className="border-b border-neutral-100 px-6 py-3">
        {p.productShotMode && p.onProductShotModeChange && (
          <div className="mb-3 rounded-xl bg-neutral-50 px-4 py-3">
            <div className="mb-2 text-[11px] font-semibold text-neutral-700">
              Product shot workflow
            </div>
            <div className="grid gap-2 lg:grid-cols-3">
              {productShotOptions.map((option) => {
                const active = p.productShotMode === option.value;
                const disabled =
                  !!p.productShotModeDisabled?.[option.value] || p.analyzing || p.loading;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => p.onProductShotModeChange?.(option.value)}
                    disabled={disabled}
                    title={option.hint}
                    className={`rounded-lg border px-3 py-2 text-left transition disabled:cursor-not-allowed disabled:opacity-45 ${
                      active
                        ? "border-neutral-900 bg-neutral-900 text-white"
                        : "border-neutral-200 bg-white text-neutral-700 hover:border-neutral-400 hover:bg-neutral-50"
                    }`}
                  >
                    <span className="block text-[11px] font-semibold leading-tight">
                      {option.label}
                    </span>
                    <span
                      className={`mt-1 block text-[10px] leading-snug ${
                        active ? "text-white/70" : "text-neutral-500"
                      }`}
                    >
                      {option.hint}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
        {p.garmentMode && p.onGarmentModeChange ? (
          (() => {
            const allOptions: Array<{
              value: "single" | "set-single-image" | "set-separate-images";
              label: string;
              hint: string;
            }> = [
              {
                value: "single",
                label: "Single garment",
                hint: "Swap one piece (top OR bottom OR full-look item like a dress).",
              },
              {
                value: "set-single-image",
                label: "Coordinated set · 1 photo",
                hint: "Upload ONE photo that shows the full coordinated outfit — model shot or flat-lay. The analyzer separates top and bottom for you.",
              },
              {
                value: "set-separate-images",
                label: "Coordinated set · 2 photos",
                hint: "Upload TWO separate photos — one of the top, one of the bottom — that are meant to be worn together.",
              },
            ];
            const allowed = p.garmentModeOptions;
            const options = allowed
              ? allOptions.filter((o) => allowed.includes(o.value))
              : allOptions;
            const active = p.garmentMode!;
            return (
              <div role="radiogroup" aria-label="Garment mode" className="flex flex-wrap gap-2">
                {options.map((option) => {
                  const isActive = active === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      role="radio"
                      aria-checked={isActive}
                      onClick={() => p.onGarmentModeChange?.(option.value)}
                      disabled={p.analyzing || p.loading}
                      title={option.hint}
                      className={`rounded-full border px-3 py-1.5 text-[11px] font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${
                        isActive
                          ? "border-brand-300 bg-brand-50 text-brand-700"
                          : "border-neutral-200 bg-white text-neutral-600 hover:border-neutral-400 hover:bg-neutral-50"
                      }`}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            );
          })()
        ) : (
        <label
          className={`inline-flex cursor-pointer items-center gap-2 rounded-full border px-3 py-2 text-xs transition ${
            p.twoPiece
              ? "border-brand-200 bg-brand-50 text-brand-700"
              : "border-neutral-200 bg-neutral-50 text-neutral-600 hover:bg-neutral-100"
          }`}
          title="Check this only when you uploaded TWO separate images — one for the top and one for the bottom — that are meant to be worn together. Single-image rompers, dresses, and jumpsuits do NOT need this checked."
        >
          <input
            type="checkbox"
            checked={p.twoPiece}
            onChange={(e) => p.onTwoPieceChange(e.target.checked)}
            disabled={p.analyzing || p.loading}
            className="h-3.5 w-3.5 shrink-0 rounded border-neutral-300 text-brand-600 focus:ring-brand-400 disabled:opacity-50"
          />
          <span className="font-medium">Coordinated 2-piece set</span>
          <span className="text-[10px] text-neutral-500">
            (separate top + bottom upload)
          </span>
        </label>
        )}
        {p.onSwapScopeChoiceChange && !p.twoPiece && (() => {
          const choice = p.swapScopeChoice ?? "auto";
          const inferred = p.inferredScope;
          const scopeLabel: Record<
            "upper-body" | "lower-body" | "full-look",
            string
          > = {
            "upper-body": "Top only",
            "lower-body": "Bottom only",
            "full-look": "Full outfit",
          };
          const resolved: "upper-body" | "lower-body" | "full-look" | null =
            choice === "auto" ? inferred ?? null : choice;
          const swapOptions: Array<{
            value: "auto" | "upper-body" | "lower-body" | "full-look";
            label: string;
          }> = [
            { value: "auto", label: "Auto" },
            { value: "upper-body", label: "Top only" },
            { value: "lower-body", label: "Bottom only" },
            { value: "full-look", label: "Full outfit" },
          ];
          return (
            <div className="mt-3 rounded-xl bg-neutral-50 px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-[11px] font-semibold text-neutral-700">
                  Swap area
                </div>
                {resolved && (
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${
                      resolved === "full-look"
                        ? "bg-amber-100 text-amber-800"
                        : "bg-neutral-200 text-neutral-700"
                    }`}
                    title={
                      resolved === "full-look"
                        ? "Will replace BOTH the top and the bottom on the model."
                        : resolved === "upper-body"
                        ? "Will replace only the top — model's pants/skirt are preserved."
                        : "Will replace only the bottom — model's top is preserved."
                    }
                  >
                    Will replace: {scopeLabel[resolved].toLowerCase()}
                  </span>
                )}
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {swapOptions.map((option) => {
                  const active = choice === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => p.onSwapScopeChoiceChange?.(option.value)}
                      disabled={p.analyzing || p.loading}
                      className={`rounded-full border px-3 py-1.5 text-[11px] font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${
                        active
                          ? "border-neutral-900 bg-neutral-900 text-white"
                          : "border-neutral-200 bg-white text-neutral-600 hover:border-neutral-400 hover:bg-neutral-50"
                      }`}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
              {choice === "auto" && inferred && (
                <p className="mt-1.5 text-[10.5px] text-neutral-500">
                  Auto detected{" "}
                  <span className="font-semibold text-neutral-700">
                    {scopeLabel[inferred].toLowerCase()}
                  </span>
                  {inferred === "full-look" && (
                    <>
                      {" "}— if your upload is a top, switch to{" "}
                      <span className="font-semibold">Top only</span> to keep the
                      model&apos;s pants.
                    </>
                  )}
                </p>
              )}
              {choice !== "auto" && (
                <p className="mt-1.5 text-[10.5px] text-neutral-500">
                  Override active. Click <span className="font-semibold">Auto</span> to
                  let the analyzer decide.
                </p>
              )}
            </div>
          );
        })()}
        {(p.onFitAdjustmentChange || p.onLengthAdjustmentChange) && (
          <div className="model-direction-panel mt-3 grid gap-3 rounded-xl bg-neutral-50 px-4 py-3 lg:grid-cols-2">
            {p.onFitAdjustmentChange && (
              <div className="min-w-[220px] flex-1">
                <div className="mb-1 text-[11px] font-semibold text-neutral-700">
                  {p.pantsAdjustments ? "Pants fit" : "Fit"}
                </div>
                <div className="flex flex-wrap gap-2">
                  {fitOptions.map((option) => {
                    const active = (p.fitAdjustment ?? "true-to-reference") === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => p.onFitAdjustmentChange?.(option.value)}
                        disabled={p.analyzing || p.loading}
                        className={`rounded-full border px-3 py-1.5 text-[11px] font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${
                          active
                            ? "border-neutral-900 bg-neutral-900 text-white"
                            : "border-neutral-200 bg-white text-neutral-600 hover:border-neutral-400 hover:bg-neutral-50"
                        }`}
                      >
                      {option.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            {p.onLengthAdjustmentChange && (
              <div className="min-w-[260px] flex-1">
                <div className="mb-1 text-[11px] font-semibold text-neutral-700">
                  {p.pantsAdjustments ? "Pants length" : "Length"}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {lengthOptions.map((option) => {
                    const active =
                      (p.lengthAdjustment ?? "true-to-reference") === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => p.onLengthAdjustmentChange?.(option.value)}
                        disabled={p.analyzing || p.loading}
                        className={`rounded-full border px-3 py-1.5 text-[11px] font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${
                          active
                            ? "border-neutral-900 bg-neutral-900 text-white"
                            : "border-neutral-200 bg-white text-neutral-600 hover:border-neutral-400 hover:bg-neutral-50"
                        }`}
                      >
                      {option.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
      )}

      {/* ========== ANALYSIS REVIEW ==========
          Only rendered when the parent actually wired it up. Image Studio
          folded Analyze into Generate and passes neither prop, which left a
          heading and an instruction over an empty box. */}
      {(p.onAnalyze || p.analysisReview) && (
      <div className="border-b border-neutral-100 px-6 py-3">
        <div className="mb-2 flex items-center justify-between gap-3">
          <div>
            <div className="text-[11px] font-semibold text-neutral-700">
              Analysis Review
            </div>
            <div className="text-[11px] text-neutral-500">
              Edit if the detected garment looks wrong — the description drives
              the swap. Re-analyze to refresh.
            </div>
          </div>
          {p.onAnalyze && (
            <button
              type="button"
              onClick={p.onAnalyze}
              disabled={p.disabled || p.loading || p.analyzing || batchActive}
              className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition disabled:cursor-not-allowed ${
                p.disabled || p.loading || p.analyzing || batchActive
                  ? "border-neutral-200 bg-neutral-100 text-neutral-400"
                  : "border-neutral-300 bg-white text-neutral-700 shadow-sm hover:bg-neutral-50"
              }`}
            >
              {p.analyzing ? <Spinner className="h-3.5 w-3.5" /> : IconSparkle}
              <span>{p.analysisReview ? "Re-analyze" : "Analyze"}</span>
            </button>
          )}
        </div>

        {p.analysisReview && p.onAnalysisReviewChange ? (
          <div className="grid gap-2 rounded-xl bg-neutral-50 p-3">
            <label className="block">
              <span className="mb-1 block text-[11px] font-semibold text-neutral-700">
                Detected garment
              </span>
              <input
                value={p.analysisReview.garment}
                onChange={(e) =>
                  p.onAnalysisReviewChange?.({
                    ...p.analysisReview!,
                    garment: e.target.value,
                  })
                }
                disabled={p.loading || p.analyzing}
                className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-xs font-medium text-neutral-800 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100 disabled:bg-neutral-100 disabled:text-neutral-400"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-semibold text-neutral-700">
                Visible details
              </span>
              <textarea
                value={p.analysisReview.features}
                onChange={(e) =>
                  p.onAnalysisReviewChange?.({
                    ...p.analysisReview!,
                    features: e.target.value,
                  })
                }
                disabled={p.loading || p.analyzing}
                rows={3}
                className="w-full resize-none rounded-lg border border-neutral-200 bg-white px-3 py-2 text-xs leading-relaxed text-neutral-800 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100 disabled:bg-neutral-100 disabled:text-neutral-400"
              />
            </label>
          </div>
        ) : null}
      </div>
      )}

      {/* ========== ADVANCED PROMPT ========== */}
      {!p.hideAdvancedPrompt && (
      <div className="border-b border-neutral-100 px-6 py-3">
        <button
          type="button"
          onClick={() => setAdvancedOpen((open) => !open)}
          className="flex w-full items-center justify-between rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-left transition hover:bg-neutral-100"
        >
          <span>
            <span className="block text-[11px] font-semibold text-neutral-700">
              Advanced Prompt
            </span>
            <span className="mt-0.5 block text-[11px] text-neutral-500">
              {hasPrompt ? `${words} words` : "Auto-generated"}
            </span>
          </span>
          <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-neutral-600">
            {advancedOpen ? "Hide" : "Show"}
          </span>
        </button>

        {advancedOpen && (
          <div className="relative mt-3 overflow-hidden rounded-xl border border-neutral-200 bg-white">
            <textarea
              value={p.prompt}
              onChange={(e) => p.onPromptChange(e.target.value)}
              placeholder="Your brief will appear here after Analyze. Most users can leave this alone."
              rows={8}
              className="prompt-mono w-full resize-y px-4 py-3 text-[12px] leading-relaxed outline-none placeholder:text-neutral-400"
            />
            <div className="pointer-events-none absolute bottom-2 right-3 rounded-full bg-white/80 px-2 py-0.5 text-[10px] font-mono text-neutral-400 backdrop-blur">
              {words} words · {chars} chars
            </div>
          </div>
        )}

      </div>
      )}

      {/* ========== ACTION BAR ========== */}
      <div className="prompt-action-bar flex items-center justify-between gap-3 border-t border-neutral-200 bg-neutral-50 px-6 py-4">
        {!p.hideVariantControl && (
        <label className="flex items-center gap-2 text-xs text-neutral-600">
          <span className="font-medium">Variants</span>
          <div className="flex overflow-hidden rounded-lg border border-neutral-200 bg-white">
            {[1, 2, 3, 4].map((n) => {
              const active = p.numImages === n;
              return (
                <button
                  key={n}
                  onClick={() => p.onNumImagesChange(n)}
                  disabled={batchActive}
                  className={`border-r border-neutral-200 px-2.5 py-1 text-xs font-medium last:border-r-0 transition disabled:opacity-40 ${
                    active
                      ? "bg-neutral-900 text-white"
                      : "text-neutral-600 hover:bg-neutral-50"
                  }`}
                >
                  {n}
                </button>
              );
            })}
          </div>
        </label>
        )}

        <div className="flex items-center gap-2">
          {/* Batch — only rendered if the parent wired it up. Batch already
              analyzes + generates each selected image in one pass, so it
              doesn't need a separate Analyze step either. */}
          {p.onBatchGenerate && (
            <button
              onClick={p.onBatchGenerate}
              disabled={
                !p.canBatch || p.loading || p.analyzing || batchActive
              }
              title={
                p.canBatch
                  ? "Analyze + generate one output per selected image"
                  : "Select 2 or more images to enable"
              }
              className={`group relative inline-flex items-center gap-2 rounded-xl border px-4 py-3 text-sm font-semibold transition disabled:cursor-not-allowed ${
                !p.canBatch || p.loading || p.analyzing || batchActive
                  ? "border-neutral-200 bg-neutral-100 text-neutral-400"
                  : "border-brand-300 bg-white text-brand-700 hover:bg-brand-50 hover:shadow-sm active:scale-[0.98]"
              }`}
            >
              {batchActive ? (
                <>
                  <Spinner />
                  <span>
                    Batch {p.batchProgress!.done}/{p.batchProgress!.total}
                  </span>
                </>
              ) : (
                <>
                  <svg
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    className="h-4 w-4"
                  >
                    <path d="M3 3h4v4H3V3zm5 0h4v4H8V3zm5 0h4v4h-4V3zM3 8h4v4H3V8zm5 0h4v4H8V8zm5 0h4v4h-4V8zM3 13h4v4H3v-4zm5 0h4v4H8v-4zm5 0h4v4h-4v-4z" />
                  </svg>
                  <span>Batch</span>
                </>
              )}
            </button>
          )}

          {/* Unified Analyze + Generate — onGenerate runs both steps.
              Enabled as soon as the user has a selection; the analyze step
              runs automatically inside onGenerate, so no pre-analyze gate. */}
          <button
            onClick={p.onGenerate}
            disabled={p.disabled || p.loading || p.analyzing || batchActive}
            className={`group relative inline-flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-semibold shadow-sm transition disabled:cursor-not-allowed ${
              p.disabled || p.loading || p.analyzing || batchActive
                ? "bg-neutral-300 text-neutral-500"
                : "bg-gradient-to-b from-neutral-800 to-neutral-950 text-white hover:from-neutral-700 hover:to-neutral-900 hover:shadow-md active:scale-[0.98]"
            }`}
          >
            {p.analyzing ? (
              <>
                <Spinner />
                <span>Analyzing…</span>
              </>
            ) : p.loading ? (
              <>
                <Spinner />
                <span>Generating…</span>
              </>
            ) : (
              <>
                {IconWand}
                <span>{p.generateLabel || "Generate"}</span>
                <span className="ml-1 rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-mono text-white/70">
                  ⌘↵
                </span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* ========== BATCH PROGRESS BAR ========== */}
      {batchActive && (
        <div className="border-t border-brand-200 bg-brand-50 px-6 py-2.5">
          <div className="flex items-center justify-between text-[11px] text-brand-800">
            <span className="font-medium">
              {p.batchProgress!.stage === "analyzing"
                ? "Analyzing"
                : p.batchProgress!.stage === "generating"
                ? "Generating"
                : "Running"}{" "}
              image {Math.min(p.batchProgress!.done + 1, p.batchProgress!.total)} of{" "}
              {p.batchProgress!.total}
            </span>
            {p.batchProgress!.failed > 0 && (
              <span className="font-medium text-red-700">
                {p.batchProgress!.failed} failed
              </span>
            )}
          </div>
          <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-brand-100">
            <div
              className="h-full bg-brand-600 transition-all"
              style={{
                width: `${(p.batchProgress!.done / p.batchProgress!.total) * 100}%`,
              }}
            />
          </div>
        </div>
      )}
    </section>
  );
}
