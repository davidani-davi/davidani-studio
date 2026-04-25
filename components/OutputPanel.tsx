"use client";

import { useEffect, useState } from "react";
import type { HistoryItem } from "./types";
import ImageLightbox, { ZoomButton } from "./ImageLightbox";

interface Props {
  current: HistoryItem | null;
  history: HistoryItem[];
  onSelectHistory: (id: string) => void;
  onClearHistory: () => void;
  /**
   * Optional: re-run a specific batch slot (prompt + source image).
   * When provided, OutputPanel renders a "Regenerate this" button that
   * hands the prompt + source back to the parent so the user can retry
   * a weak batch result without re-running the whole batch.
   */
  onRegenerate?: (params: { prompt: string; sourceUrl: string | null }) => void;
  onQualityControl?: (params: {
    action: "restore-face" | "retry-closer" | "different-pose";
    fitMode?:
      | "all"
      | "silhouette"
      | "length-match"
      | "length-shorter"
      | "length-longer"
      | "details";
    prompt: string;
    sourceUrl: string | null;
  }) => void;
  /**
   * Optional map of source-image URL → original upload filename.
   * When provided, downloaded result files are named after the source
   * upload instead of `davidani-<timestamp>.png`. We can't derive this
   * inside OutputPanel because it doesn't know about `uploads` — the
   * parent (app/page.tsx) builds and passes the map.
   */
  uploadNames?: Record<string, string>;
}

export default function OutputPanel({
  current,
  history,
  onSelectHistory,
  onClearHistory,
  onRegenerate,
  onQualityControl,
  uploadNames,
}: Props) {
  const [index, setIndex] = useState(0);
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);
  const [promptOpen, setPromptOpen] = useState(false);
  const [fitToolsOpen, setFitToolsOpen] = useState(false);

  // Whenever the current run changes (e.g. new generation, clicked a different
  // history item), reset the gallery to image 0 so we never show a stale
  // out-of-range index left over from a previous multi-variant run.
  useEffect(() => {
    setIndex(0);
    setFitToolsOpen(false);
  }, [current?.id]);

  // Defensive clamp — if index somehow exceeds the current run's image count,
  // fall back to 0 rather than showing undefined.
  const safeIndex =
    current && index < current.imageUrls.length ? index : 0;
  const active = current?.imageUrls[safeIndex] ?? null;

  // For batch runs we store one prompt + one source URL per result at the same
  // index. Fall back to the run-level `prompt` and `referenceUrls[0]` for
  // non-batch runs so the prompt strip still shows something useful there.
  const activePrompt =
    current?.prompts?.[safeIndex] ?? current?.prompt ?? "";
  const activeSource =
    current?.batch
      ? current?.referenceUrls?.[safeIndex] ?? null
      : current?.referenceUrls?.[0] ?? null;

  /**
   * Derive a filename for the result at `resultIndex`. Prefers the original
   * upload's filename (batch runs → per-slot source, non-batch runs →
   * first reference). Falls back to the timestamp pattern when no mapping
   * exists (e.g. user cleared their uploads between generating and
   * downloading, or the OutputPanel is mounted without the map).
   *
   * Guarantees a file extension — strips whatever the upload had and
   * appends `.png` since that's what the fal endpoints emit by default.
   * Handles multi-output runs (batch or multi-variant) by suffixing the
   * result index so no two files in the same run clobber each other.
   */
  function filenameFor(resultIndex: number): string {
    // Resolve the source URL for this specific output slot.
    let sourceUrl: string | null = null;
    if (current) {
      if (current.batch) {
        sourceUrl = current.referenceUrls?.[resultIndex] ?? null;
      } else {
        // Non-batch run: all outputs share the same source set. Prefer the
        // first reference so a 4-variant run uses one consistent name.
        sourceUrl = current.referenceUrls?.[0] ?? null;
      }
    }

    const originalName = sourceUrl && uploadNames ? uploadNames[sourceUrl] : undefined;
    const stem = originalName
      ? originalName
          .replace(/\.[^/.]+$/, "") // strip extension
          .replace(/[^A-Za-z0-9._-]+/g, "_") // sanitize for Windows/macOS
          .replace(/^_+|_+$/g, "") || "result"
      : `davidani-${Date.now()}`;

    const total = current?.imageUrls.length ?? 1;
    const suffix = total > 1 ? `-${resultIndex + 1}` : "";
    return `${stem}${suffix}.png`;
  }

  function download(url: string, resultIndex: number) {
    const a = document.createElement("a");
    a.href = url;
    a.download = filenameFor(resultIndex);
    a.target = "_blank";
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  async function downloadAll() {
    if (!current) return;
    for (const [i, url] of current.imageUrls.entries()) {
      download(url, i);
      // small stagger so the browser doesn't block
      await new Promise((r) => setTimeout(r, 400 * i));
    }
  }

  return (
    <aside className="flex w-full shrink-0 flex-col border-t border-neutral-200 bg-white lg:w-96 lg:border-l lg:border-t-0">
      <div className="flex items-center justify-between border-b border-neutral-200 px-5 py-4">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            {current ? `Run #${current.id.slice(0, 4)}` : "No runs yet"}
            {current?.batch && (
              <span className="rounded-full bg-indigo-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-indigo-700">
                Batch
              </span>
            )}
          </h2>
          {current && (
            <p className="text-[11px] text-neutral-500">
              {new Date(current.timestamp).toLocaleString()} · {current.modelId}
              {current.batch && current.imageUrls.length > 0 && (
                <> · {current.imageUrls.length} results</>
              )}
            </p>
          )}
        </div>
        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
          {current ? "DONE" : "—"}
        </span>
      </div>

      {/* gallery thumbnails — always shown for batch runs so users see the
          group context even when only one result has landed; shown for
          non-batch multi-variant runs too. Each thumbnail has its own
          ZoomButton (preview) and DownloadButton (save just that one). */}
      {current && (current.batch || current.imageUrls.length > 1) && current.imageUrls.length > 0 && (
        <div className="flex shrink-0 items-center gap-2 overflow-x-auto border-b border-neutral-100 px-5 py-3">
          {current.imageUrls.map((u, i) => (
            <div
              key={u}
              className={`group relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border ${
                i === safeIndex ? "border-brand-500 ring-2 ring-brand-200" : "border-neutral-200"
              }`}
            >
              <button
                onClick={() => setIndex(i)}
                className="absolute inset-0 block"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={u} alt="" className="h-full w-full object-cover" />
                <span className="absolute bottom-0.5 right-0.5 rounded bg-black/60 px-1 text-[9px] text-white">
                  {i + 1}
                </span>
              </button>
              <ZoomButton
                onClick={() => setPreviewSrc(u)}
                title="Preview at full size"
                className="absolute left-1 top-1 opacity-0 group-hover:opacity-100"
              />
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  download(u, i);
                }}
                title="Download this image"
                className="absolute right-1 top-1 grid h-5 w-5 place-items-center rounded bg-black/60 text-white opacity-0 transition hover:bg-black/80 group-hover:opacity-100"
              >
                <svg viewBox="0 0 20 20" fill="currentColor" className="h-3 w-3">
                  <path d="M10 3a1 1 0 011 1v7.586l2.293-2.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 111.414-1.414L9 11.586V4a1 1 0 011-1zm-6 12a1 1 0 011 1v1h10v-1a1 1 0 112 0v2a1 1 0 01-1 1H4a1 1 0 01-1-1v-2a1 1 0 011-1z" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}

      {/* main preview — min-h-0 + overflow-hidden keeps tall portrait outputs
          from blowing past the flex track and covering the thumbnail strip
          above. */}
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-neutral-50 p-5">
        {active ? (
          <button
            type="button"
            onClick={() => setPreviewSrc(active)}
            title="Click to preview at full size"
            className="group relative flex h-full max-h-full w-full max-w-full items-center justify-center"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={active}
              alt="Generated output"
              className="max-h-full max-w-full cursor-zoom-in rounded-lg object-contain shadow-sm transition group-hover:shadow-md"
            />
            <span className="pointer-events-none absolute bottom-2 right-2 flex items-center gap-1 rounded-full bg-black/60 px-2 py-1 text-[10px] font-medium text-white opacity-0 transition group-hover:opacity-100">
              <svg viewBox="0 0 20 20" fill="currentColor" className="h-3 w-3">
                <path d="M9 3a6 6 0 014.472 10.03l3.249 3.248a1 1 0 01-1.414 1.415l-3.249-3.249A6 6 0 119 3zm0 2a4 4 0 100 8 4 4 0 000-8zm-.5 1.75a.75.75 0 01.75.75V8.5h1a.75.75 0 010 1.5h-1v1a.75.75 0 01-1.5 0v-1h-1a.75.75 0 010-1.5h1V7.5a.75.75 0 01.75-.75z" />
              </svg>
              Click to enlarge
            </span>
          </button>
        ) : (
          <p className="text-center text-sm text-neutral-500">
            Your generations will appear here.
          </p>
        )}
      </div>

      {current && (
        <div className="border-t border-neutral-200 px-5 py-3">
          {onQualityControl && activePrompt && (
            <div className="mb-3 rounded-2xl border border-neutral-200 bg-neutral-50 p-2.5">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[10px] font-semibold uppercase tracking-widest text-neutral-500">
                  Quality Control
                </span>
                <span className="rounded-full bg-white px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-neutral-400">
                  Refine
                </span>
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                <button
                  type="button"
                  onClick={() =>
                    onQualityControl({
                      action: "restore-face",
                      prompt: activePrompt,
                      sourceUrl: activeSource,
                    })
                  }
                  className="rounded-xl border border-neutral-200 bg-white px-2 py-2 text-[11px] font-semibold text-neutral-700 shadow-sm transition hover:-translate-y-0.5 hover:border-neutral-300 hover:shadow"
                >
                  Restore face
                </button>
                <button
                  type="button"
                  onClick={() => setFitToolsOpen((open) => !open)}
                  className="rounded-xl border border-neutral-200 bg-white px-2 py-2 text-[11px] font-semibold text-neutral-700 shadow-sm transition hover:-translate-y-0.5 hover:border-neutral-300 hover:shadow"
                >
                  Restore fit
                </button>
                <button
                  type="button"
                  onClick={() =>
                    onQualityControl({
                      action: "different-pose",
                      prompt: activePrompt,
                      sourceUrl: activeSource,
                    })
                  }
                  className="rounded-xl border border-neutral-200 bg-white px-2 py-2 text-[11px] font-semibold text-neutral-700 shadow-sm transition hover:-translate-y-0.5 hover:border-neutral-300 hover:shadow"
                >
                  New pose
                </button>
              </div>
              {fitToolsOpen && (
                <div className="mt-2 rounded-xl border border-neutral-200 bg-white p-2">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="text-[10px] font-semibold uppercase tracking-widest text-neutral-500">
                      Fit Repair
                    </span>
                    <span className="text-[10px] text-neutral-400">choose the drift</span>
                  </div>
                  <div className="grid grid-cols-3 gap-1.5">
                    {[
                      ["all", "Match ref"],
                      ["length-shorter", "Shorter"],
                      ["length-longer", "Longer"],
                      ["silhouette", "Silhouette"],
                      ["length-match", "Length ref"],
                      ["details", "Details"],
                    ].map(([fitMode, label]) => (
                      <button
                        key={fitMode}
                        type="button"
                        onClick={() =>
                          onQualityControl({
                            action: "retry-closer",
                            fitMode: fitMode as
                              | "all"
                              | "silhouette"
                              | "length-match"
                              | "length-shorter"
                              | "length-longer"
                              | "details",
                            prompt: activePrompt,
                            sourceUrl: activeSource,
                          })
                        }
                        className="rounded-lg border border-neutral-200 bg-neutral-50 px-2 py-2 text-[11px] font-semibold text-neutral-700 transition hover:border-neutral-300 hover:bg-neutral-100"
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="flex items-center gap-2">
            <button
              onClick={() => active && download(active, safeIndex)}
              disabled={!active}
              className="flex-1 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-xs font-medium hover:bg-neutral-50 disabled:opacity-50"
            >
              Download
            </button>
            <button
              onClick={downloadAll}
              className="flex-1 rounded-lg bg-neutral-900 px-3 py-2 text-xs font-medium text-white hover:bg-neutral-800"
            >
              Download all
            </button>
          </div>
        </div>
      )}

      {/* Prompt + source diagnostics. Most useful for batch runs where each
          thumbnail is produced by its own auto-generated prompt — if an image
          came out weak, the user can see the exact prompt used and hit
          "Regenerate this" to tweak + rerun without re-running the batch. */}
      {current && activePrompt && (
        <div className="border-t border-neutral-200 bg-white px-5 py-3 text-xs">
          <button
            type="button"
            onClick={() => setPromptOpen((v) => !v)}
            className="flex w-full items-center justify-between text-[10px] font-semibold uppercase tracking-widest text-neutral-500 hover:text-neutral-800"
          >
            <span>
              Prompt used
              {current.batch && current.imageUrls.length > 1 && (
                <> · image {safeIndex + 1} of {current.imageUrls.length}</>
              )}
            </span>
            <span className="text-sm leading-none">{promptOpen ? "−" : "+"}</span>
          </button>
          {promptOpen && (
            <>
              <p className="mt-2 max-h-40 overflow-y-auto whitespace-pre-line rounded bg-neutral-50 p-2 text-[11px] leading-relaxed text-neutral-700">
                {activePrompt}
              </p>
              <div className="mt-2 flex items-center gap-2">
                <button
                  onClick={() => {
                    navigator.clipboard?.writeText(activePrompt).catch(() => {});
                  }}
                  className="rounded border border-neutral-200 bg-white px-2 py-1 text-[10px] font-medium text-neutral-700 hover:bg-neutral-50"
                >
                  Copy prompt
                </button>
                {onRegenerate && activeSource && (
                  <button
                    onClick={() =>
                      onRegenerate({ prompt: activePrompt, sourceUrl: activeSource })
                    }
                    className="rounded bg-neutral-900 px-2 py-1 text-[10px] font-medium text-white hover:bg-neutral-800"
                  >
                    Regenerate this
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      )}

      <ImageLightbox src={previewSrc} onClose={() => setPreviewSrc(null)} />

      {/* History list */}
      <div className="flex min-h-0 flex-col border-t border-neutral-200 bg-neutral-50">
        <div className="flex items-center justify-between px-5 py-3">
          <h3 className="text-[10px] font-semibold uppercase tracking-widest text-neutral-500">
            History
          </h3>
          {history.length > 0 && (
            <button
              onClick={onClearHistory}
              className="text-[10px] uppercase tracking-widest text-neutral-500 hover:text-neutral-800"
            >
              Clear
            </button>
          )}
        </div>
        <ul className="max-h-48 overflow-y-auto px-5 pb-4">
          {history.length === 0 && (
            <li className="text-xs text-neutral-500">No history yet.</li>
          )}
          {history.map((h) => (
            <li key={h.id}>
              <button
                onClick={() => onSelectHistory(h.id)}
                className={`my-0.5 flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-white ${
                  current?.id === h.id ? "bg-white" : ""
                }`}
              >
                <span
                  className={`h-2 w-2 rounded-full ${
                    h.batch ? "bg-indigo-500" : "bg-brand-500"
                  }`}
                />
                <span className="font-medium">Run #{h.id.slice(0, 4)}</span>
                {h.batch && (
                  <span className="rounded-sm bg-indigo-100 px-1 text-[9px] font-semibold uppercase tracking-wider text-indigo-700">
                    Batch
                  </span>
                )}
                <span className="ml-auto text-[10px] text-neutral-500">
                  ({h.imageUrls.length})
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}
