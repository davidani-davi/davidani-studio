"use client";

interface Props {
  prompt: string;
  onPromptChange: (v: string) => void;
  numImages: number;
  onNumImagesChange: (n: number) => void;
  onGenerate: () => void;
  onAnalyze: () => void;
  analyzing: boolean;
  loading: boolean;
  canAnalyze: boolean;
  disabled: boolean;
}

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

  // Tri-state for the little status chip at the top-right of the header.
  const status: "idle" | "analyzing" | "ready" | "generating" = p.analyzing
    ? "analyzing"
    : p.loading
    ? "generating"
    : hasPrompt
    ? "ready"
    : "idle";

  const statusChip = {
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

  return (
    <section className="flex min-w-0 flex-1 flex-col border-r border-neutral-200 bg-white">
      {/* ========== HEADER ========== */}
      <div className="flex items-center justify-between border-b border-neutral-200 px-6 py-4">
        <div>
          <h2 className="text-sm font-semibold text-neutral-900">Brief</h2>
          <p className="text-[11px] text-neutral-500">
            Describe the shot — or let Claude analyze your photo and draft it.
          </p>
        </div>
        <span
          className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider ${statusChip.className}`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${statusChip.dot}`} />
          {statusChip.text}
        </span>
      </div>

      {/* ========== ANALYZE CARD ========== */}
      <div className="border-b border-neutral-100 px-6 py-4">
        <button
          onClick={p.onAnalyze}
          disabled={!p.canAnalyze || p.analyzing || p.loading}
          className={`group flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left transition disabled:cursor-not-allowed ${
            p.canAnalyze && !p.analyzing && !p.loading
              ? "border-brand-200 bg-gradient-to-br from-brand-50 to-white hover:border-brand-400 hover:shadow-sm"
              : "border-neutral-200 bg-neutral-50 opacity-70"
          }`}
        >
          <span
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
              p.analyzing
                ? "bg-amber-100 text-amber-600"
                : "bg-brand-100 text-brand-600 group-hover:bg-brand-600 group-hover:text-white"
            } transition`}
          >
            {p.analyzing ? <Spinner /> : IconSparkle}
          </span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="text-sm font-semibold text-neutral-900">
              {p.analyzing
                ? "Analyzing photo…"
                : hasPrompt
                ? "Re-analyze photo"
                : "Analyze photo with Claude"}
            </span>
            <span className="truncate text-[11px] text-neutral-500">
              {p.canAnalyze
                ? "Claude 3.7 describes your garment, then drafts the studio prompt."
                : "Upload a product photo in the sidebar to enable."}
            </span>
          </span>
          {p.canAnalyze && !p.analyzing && !p.loading && (
            <svg
              viewBox="0 0 20 20"
              fill="currentColor"
              className="h-4 w-4 text-neutral-400 transition group-hover:translate-x-0.5 group-hover:text-brand-600"
            >
              <path d="M7.5 4.5a.75.75 0 011.06 0l4.5 4.5a.75.75 0 010 1.06l-4.5 4.5a.75.75 0 11-1.06-1.06L11.44 10 7.5 6.06a.75.75 0 010-1.06z" />
            </svg>
          )}
        </button>
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
      <div className="flex items-center justify-between gap-4 border-t border-neutral-200 bg-neutral-50 px-6 py-4">
        <label className="flex items-center gap-2 text-xs text-neutral-600">
          <span className="font-medium">Variants</span>
          <div className="flex overflow-hidden rounded-lg border border-neutral-200 bg-white">
            {[1, 2, 3, 4].map((n) => {
              const active = p.numImages === n;
              return (
                <button
                  key={n}
                  onClick={() => p.onNumImagesChange(n)}
                  className={`border-r border-neutral-200 px-2.5 py-1 text-xs font-medium last:border-r-0 transition ${
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

        <button
          onClick={p.onGenerate}
          disabled={p.disabled || p.loading || p.analyzing}
          className={`group relative inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold shadow-sm transition disabled:cursor-not-allowed ${
            p.disabled || p.loading || p.analyzing
              ? "bg-neutral-300 text-neutral-500"
              : "bg-gradient-to-b from-neutral-800 to-neutral-950 text-white hover:from-neutral-700 hover:to-neutral-900 hover:shadow-md active:scale-[0.98]"
          }`}
        >
          {p.loading ? (
            <>
              <Spinner />
              <span>Generating…</span>
            </>
          ) : p.analyzing ? (
            <>
              <Spinner />
              <span>Analyzing…</span>
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
    </section>
  );
}
