"use client";

import type {
  GarmentFitAdjustment,
  GarmentLengthAdjustment,
} from "@/lib/fal";

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
  fitAdjustment?: GarmentFitAdjustment;
  onFitAdjustmentChange?: (v: GarmentFitAdjustment) => void;
  lengthAdjustment?: GarmentLengthAdjustment;
  onLengthAdjustmentChange?: (v: GarmentLengthAdjustment) => void;
  pantsAdjustments?: boolean;
  analysisReview?: AnalysisReview | null;
  onAnalysisReviewChange?: (review: AnalysisReview) => void;
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
  { value: "shorter", label: "Short" },
  { value: "waist-length", label: "Waist" },
  { value: "below-waist", label: "Below waist" },
  { value: "true-to-reference", label: "True" },
  { value: "hip-length", label: "Hip" },
  { value: "longer", label: "Long" },
  { value: "tunic-length", label: "Tunic" },
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
          text: "Waiting for photo",
          dot: "bg-neutral-300",
          className: "bg-neutral-100 text-neutral-500",
        },
        analyzing: {
          text: "Analyzing",
          dot: "bg-amber-400 animate-pulse",
          className: "bg-amber-50 text-amber-700",
        },
        ready: {
          text: "Prompt ready",
          dot: "bg-emerald-500",
          className: "bg-emerald-50 text-emerald-700",
        },
        generating: {
          text: "Generating",
          dot: "bg-brand-500 animate-pulse",
          className: "bg-brand-50 text-brand-700",
        },
      }[status];
  const fitOptions = p.pantsAdjustments ? PANTS_FIT_OPTIONS : GENERAL_FIT_OPTIONS;
  const lengthOptions = p.pantsAdjustments ? PANTS_LENGTH_OPTIONS : GENERAL_LENGTH_OPTIONS;

  return (
    <section className="flex min-w-0 flex-1 flex-col border-b border-neutral-200 bg-white lg:border-b-0 lg:border-r">
      {/* ========== HEADER ========== */}
      <div className="flex items-center justify-between border-b border-neutral-200 px-6 py-4">
        <div>
          <h2 className="text-sm font-semibold text-neutral-900">Brief</h2>
          <p className="text-[11px] text-neutral-500">
            Claude analyzes your photo, shows an editable review, then drafts
            the generation prompt from that review.
          </p>
        </div>
        <span
          className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider ${statusChip.className}`}
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
      <div className="border-b border-neutral-100 px-6 py-2.5">
        <label
          className={`flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1 text-[11px] transition ${
            p.twoPiece
              ? "bg-brand-50 text-brand-700"
              : "text-neutral-600 hover:bg-neutral-50"
          }`}
          title="Check this when the reference photo shows a matching top + bottom coordinated outfit."
        >
          <input
            type="checkbox"
            checked={p.twoPiece}
            onChange={(e) => p.onTwoPieceChange(e.target.checked)}
            disabled={p.analyzing || p.loading}
            className="h-3.5 w-3.5 shrink-0 rounded border-neutral-300 text-brand-600 focus:ring-brand-400 disabled:opacity-50"
          />
          <span className="font-medium">Reference is a 2-piece set</span>
          <span className="text-[10px] text-neutral-500">
            (matching top + bottom)
          </span>
        </label>
        {(p.onFitAdjustmentChange || p.onLengthAdjustmentChange) && (
          <div className="mt-2.5 flex flex-wrap gap-4 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2.5">
            {p.onFitAdjustmentChange && (
              <div className="min-w-[220px] flex-1">
                <div className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-neutral-500">
                  {p.pantsAdjustments ? "Pants fit" : "Fit"}
                </div>
                <div className="flex flex-wrap gap-1.5">
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
                <div className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-neutral-500">
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
            <p className="basis-full text-[10px] leading-relaxed text-neutral-500">
              {p.pantsAdjustments
                ? "Pants controls override the leg shape and hem length while preserving the uploaded garment's fabric, construction, pockets, stitching, and hardware."
                : "Fit and length guide how the garment sits on the model while preserving the uploaded garment's fabric, construction, trims, stitching, and hardware."}
            </p>
          </div>
        )}
      </div>

      {/* ========== ANALYSIS REVIEW ========== */}
      <div className="border-b border-neutral-100 px-6 py-3">
        <div className="mb-2 flex items-center justify-between gap-3">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-widest text-neutral-500">
              Analysis Review
            </div>
            <div className="text-[11px] text-neutral-500">
              Edit what the AI detected before Generate.
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
          <div className="grid gap-2 rounded-xl border border-neutral-200 bg-neutral-50 p-3">
            <label className="block">
              <span className="mb-1 block text-[10px] font-semibold uppercase tracking-widest text-neutral-500">
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
              <span className="mb-1 block text-[10px] font-semibold uppercase tracking-widest text-neutral-500">
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
        ) : (
          <div className="rounded-xl border border-dashed border-neutral-200 bg-neutral-50 px-3 py-2.5 text-[11px] text-neutral-500">
            Run Analyze to preview the garment read. Generate can still analyze automatically.
          </div>
        )}
      </div>

      {/* ========== PROMPT TEXTAREA ========== */}
      <div className="relative flex min-h-0 flex-1 flex-col">
        <textarea
          value={p.prompt}
          onChange={(e) => p.onPromptChange(e.target.value)}
          placeholder="Your brief will appear here after Analyze — or write your own. The generator will preserve your product and restyle the background, lighting, and framing."
          className="prompt-mono min-h-0 flex-1 resize-none px-6 py-5 text-[13px] leading-relaxed outline-none placeholder:text-neutral-400"
        />

        {/* Tiny counter bottom-right */}
        <div className="pointer-events-none absolute bottom-3 right-6 rounded-full bg-white/80 px-2 py-0.5 text-[10px] font-mono text-neutral-400 backdrop-blur">
          {words} words · {chars} chars
        </div>
      </div>

      {/* ========== ACTION BAR ========== */}
      <div className="flex items-center justify-between gap-3 border-t border-neutral-200 bg-neutral-50 px-6 py-4">
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
              className={`group relative inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed ${
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
            className={`group relative inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold shadow-sm transition disabled:cursor-not-allowed ${
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
                <span>Generate</span>
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
