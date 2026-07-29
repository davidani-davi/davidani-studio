"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import StudioHeader from "@/components/StudioHeader";
import ImageLightbox, { ZoomButton } from "@/components/ImageLightbox";
import type { UploadedImage } from "@/components/types";
import { MODELS, type ModelId, ASPECT_RATIOS, RESOLUTIONS } from "@/lib/models";
import { resizeIfNeeded } from "@/lib/image-resize";
import {
  alphabeticImageLabel,
  appendUniqueReferences,
  orderSelectedReferenceUrls,
  parsePlaygroundPrompts,
  restorePersistedReferences,
} from "@/lib/image-playground";

const HISTORY_KEY = "davidani_playground_history_v1";
const REFS_KEY = "davidani_playground_refs_v1";
const SELECTED_REFS_KEY = "davidani_playground_selected_refs_v1";

// Approximate per-image USD cost by model. Update if upstream pricing changes.
// Sources: fal.ai pricing (Seedream, GPT Image), kie.ai (Nano Banana 2).
const MODEL_COST_USD: Record<ModelId, { base: number; per2K?: number; per4K?: number }> = {
  "nano-banana": { base: 0.039 },
  "seedream-4": { base: 0.03, per2K: 0.03, per4K: 0.06 },
  "gpt-image": { base: 0.19, per2K: 0.19, per4K: 0.19 },
};

function estimateCostPerImage(modelId: ModelId, resolution: string): number {
  const c = MODEL_COST_USD[modelId];
  if (!c) return 0;
  if (resolution === "4K" && c.per4K) return c.per4K;
  if (resolution === "2K" && c.per2K) return c.per2K;
  return c.base;
}

function fmtUsd(n: number): string {
  if (n < 0.01) return `$${n.toFixed(4)}`;
  if (n < 1) return `$${n.toFixed(3)}`;
  return `$${n.toFixed(2)}`;
}

function fmtDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) ms = 0;
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

type ResultStatus = "queued" | "running" | "done" | "failed";

interface GenerationSettings {
  modelId: ModelId;
  modelLabel: string;
  aspect: string;
  resolution: string;
  numImages: number;
  referenceCount: number;
  format: "png";
}

interface PlaygroundResult {
  id: string;
  prompt: string;
  status: ResultStatus;
  urls: string[];
  settings?: GenerationSettings;
  error?: string;
  startedAt?: number;
  finishedAt?: number;
}

interface PlaygroundRun {
  id: string;
  timestamp: number;
  modelId: ModelId;
  aspect: string;
  resolution: string;
  parallel: number;
  refs: string[];
  results: PlaygroundResult[];
}

async function fetchJson(label: string, input: string, init?: RequestInit): Promise<any> {
  const res = await fetch(input, init);
  const raw = await res.text();
  let data: any;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    throw new Error(`${label}: server returned non-JSON (${res.status})`);
  }
  if (!res.ok) throw new Error(`${label}: ${data?.error || `HTTP ${res.status}`}`);
  return data;
}

const Spinner = ({ className = "h-4 w-4" }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={`${className} animate-spin`}>
    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" fill="none" />
    <path d="M12 2a10 10 0 0110 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" fill="none" />
  </svg>
);

function hasImageFiles(e: React.DragEvent): boolean {
  return Array.from(e.dataTransfer.items).some(
    (item) => item.kind === "file" && item.type.startsWith("image/")
  );
}

export default function ImagePlaygroundClient() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [modelId, setModelId] = useState<ModelId>("gpt-image");
  const [aspect, setAspect] = useState<string>("auto");
  const [resolution, setResolution] = useState<string>("2K");
  const [parallel, setParallel] = useState<number>(1);
  const [numPerPrompt, setNumPerPrompt] = useState<number>(1);

  const [refs, setRefs] = useState<UploadedImage[]>([]);
  const [selectedRefUrls, setSelectedRefUrls] = useState<string[]>([]);
  const [pasteUrl, setPasteUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);

  const [promptsText, setPromptsText] = useState("");
  const [results, setResults] = useState<PlaygroundResult[]>([]);
  const [running, setRunning] = useState(false);
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);
  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);
  const [error, setError] = useState<string | null>(null);
  const [previewIdx, setPreviewIdx] = useState<number | null>(null);
  const [refPreviewSrc, setRefPreviewSrc] = useState<string | null>(null);
  const [selectedIdx, setSelectedIdx] = useState<number>(0);
  const [history, setHistory] = useState<PlaygroundRun[]>([]);
  const thumbRefs = useRef<Array<HTMLButtonElement | null>>([]);

  // Ticks once per second while a batch is running so live timers re-render.
  const [nowTick, setNowTick] = useState<number>(() => Date.now());
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, [running]);

  // Flat list of every completed image across the current result set, in
  // display order. This is the array arrow keys navigate and the lightbox
  // pages through.
  const flatImages = useMemo(
    () => results.flatMap((r) => (r.status === "done" ? r.urls : [])),
    [results]
  );

  // Clamp selection whenever the list shrinks (e.g. on a new run).
  useEffect(() => {
    if (selectedIdx >= flatImages.length) setSelectedIdx(Math.max(0, flatImages.length - 1));
  }, [flatImages.length, selectedIdx]);

  // Arrow keys navigate the flat result list. Ignored while typing in an
  // input/textarea or while the lightbox is open (the lightbox owns ←/→
  // when it's mounted).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (previewIdx !== null || refPreviewSrc) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      const editable = (e.target as HTMLElement | null)?.isContentEditable;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || editable) return;
      if (!flatImages.length) return;

      const last = flatImages.length - 1;
      if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIdx((i) => (i >= last ? 0 : i + 1));
      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIdx((i) => (i <= 0 ? last : i - 1));
      } else if (e.key === "Home") {
        e.preventDefault();
        setSelectedIdx(0);
      } else if (e.key === "End") {
        e.preventDefault();
        setSelectedIdx(last);
      } else if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        setPreviewIdx(selectedIdx);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [flatImages.length, previewIdx, refPreviewSrc, selectedIdx]);

  // Auto-scroll the selected thumbnail into view.
  useEffect(() => {
    if (!flatImages.length) return;
    const node = thumbRefs.current[selectedIdx];
    node?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selectedIdx, flatImages.length]);

  // Load persisted state.
  useEffect(() => {
    try {
      const r = localStorage.getItem(REFS_KEY);
      if (r) {
        const restored = restorePersistedReferences(
          r,
          localStorage.getItem(SELECTED_REFS_KEY)
        );
        setRefs(restored.references);
        setSelectedRefUrls(restored.selectedUrls);
      }
      const h = localStorage.getItem(HISTORY_KEY);
      if (h) {
        const parsed = JSON.parse(h) as PlaygroundRun[];
        if (Array.isArray(parsed)) setHistory(parsed);
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(REFS_KEY, JSON.stringify(refs));
    } catch {
      /* ignore */
    }
  }, [refs]);

  useEffect(() => {
    try {
      localStorage.setItem(SELECTED_REFS_KEY, JSON.stringify(selectedRefUrls));
    } catch {
      /* ignore */
    }
  }, [selectedRefUrls]);

  const prompts = useMemo(() => parsePlaygroundPrompts(promptsText), [promptsText]);
  const orderedSelectedRefUrls = useMemo(
    () => orderSelectedReferenceUrls(refs, selectedRefUrls),
    [refs, selectedRefUrls]
  );
  const promptCount = prompts.length;
  const doneCount = results.filter((r) => r.status === "done").length;
  const failedCount = results.filter((r) => r.status === "failed").length;
  const activeJob = running ? 1 : 0;

  const costPerImage = estimateCostPerImage(modelId, resolution);
  const totalImages = promptCount * numPerPrompt;
  const estimatedCost = totalImages * costPerImage;

  // Batch timer: earliest startedAt → either now (while running) or latest finishedAt.
  const startedTimestamps = results
    .map((r) => r.startedAt)
    .filter((t): t is number => typeof t === "number");
  const finishedTimestamps = results
    .map((r) => r.finishedAt)
    .filter((t): t is number => typeof t === "number");
  const batchStart = startedTimestamps.length ? Math.min(...startedTimestamps) : null;
  const batchEnd = running
    ? nowTick
    : finishedTimestamps.length
      ? Math.max(...finishedTimestamps)
      : null;
  const batchElapsedMs = batchStart != null && batchEnd != null ? batchEnd - batchStart : 0;

  const actualSpend = results.reduce(
    (sum, r) => (r.status === "done" ? sum + r.urls.length * costPerImage : sum),
    0
  );

  async function addFiles(files: FileList) {
    setUploading(true);
    setError(null);
    try {
      const resized = await Promise.all(Array.from(files).map((f) => resizeIfNeeded(f)));
      const form = new FormData();
      resized.forEach((f) => form.append("files", f));
      const data = await fetchJson("Upload", "/api/upload", { method: "POST", body: form });
      const added: UploadedImage[] = data.uploads ?? [];
      if (!added.length) throw new Error("Upload returned no URLs");
      setRefs((list) => appendUniqueReferences(list, added));
      setSelectedRefUrls((cur) => Array.from(new Set([...cur, ...added.map((u) => u.url)])));
    } catch (e: any) {
      setError(e?.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  function addPastedUrl() {
    const url = pasteUrl.trim();
    if (!url) return;
    if (!/^https?:\/\//i.test(url)) {
      setError("Reference URL must start with http(s)://");
      return;
    }
    if (!refs.some((r) => r.url === url)) {
      setRefs((list) =>
        appendUniqueReferences(list, [{ url, name: "Pasted reference" }])
      );
    }
    setSelectedRefUrls((cur) => (cur.includes(url) ? cur : [...cur, url]));
    setPasteUrl("");
  }

  function toggleRef(url: string) {
    setSelectedRefUrls((cur) => (cur.includes(url) ? cur.filter((u) => u !== url) : [...cur, url]));
  }

  function removeRef(url: string) {
    setRefs((list) => list.filter((r) => r.url !== url));
    setSelectedRefUrls((cur) => cur.filter((u) => u !== url));
  }

  async function runBatch() {
    if (!prompts.length) {
      setError("Add at least one prompt (one per line)");
      return;
    }
    if (!orderedSelectedRefUrls.length) {
      setError("Select at least one reference image");
      return;
    }
    setError(null);
    setRunning(true);
    setPaused(false);
    pausedRef.current = false;

    const settingsSnapshot: GenerationSettings = {
      modelId,
      modelLabel: MODELS[modelId]?.label ?? modelId,
      aspect,
      resolution,
      numImages: numPerPrompt,
      referenceCount: orderedSelectedRefUrls.length,
      format: "png",
    };
    const initial: PlaygroundResult[] = prompts.map((p, i) => ({
      id: `${Date.now()}-${i}`,
      prompt: p,
      status: "queued" as const,
      urls: [],
      settings: settingsSnapshot,
    }));
    setResults(initial);

    const queue = initial.map((r, i) => ({ ...r, index: i }));
    const inFlight = new Set<number>();

    async function runOne(idx: number, item: PlaygroundResult) {
      setResults((cur) => {
        const next = cur.slice();
        next[idx] = { ...next[idx], status: "running", startedAt: Date.now() };
        return next;
      });
      try {
        const data = await fetchJson("Generate", "/api/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            modelId,
            prompt: item.prompt,
            imageUrls: orderedSelectedRefUrls,
            aspectRatio: aspect,
            resolution,
            format: "png",
            numImages: numPerPrompt,
            // Playground is sandboxed: no auto-injected style reference,
            // no garment-edit prompt prefixes from other modules.
            raw: true,
            useDefaultReference: false,
            referenceImageUrl: null,
          }),
        });
        const urls: string[] = data.images?.map((img: any) => img.url).filter(Boolean) ?? [];
        setResults((cur) => {
          const next = cur.slice();
          next[idx] = { ...next[idx], status: "done", urls, finishedAt: Date.now() };
          return next;
        });
      } catch (e: any) {
        setResults((cur) => {
          const next = cur.slice();
          next[idx] = {
            ...next[idx],
            status: "failed",
            error: e?.message || "Generation failed",
            finishedAt: Date.now(),
          };
          return next;
        });
      }
    }

    let cursor = 0;
    async function pump() {
      while (cursor < queue.length) {
        if (pausedRef.current) {
          await new Promise((r) => setTimeout(r, 150));
          continue;
        }
        if (inFlight.size >= parallel) {
          await new Promise((r) => setTimeout(r, 60));
          continue;
        }
        const idx = cursor++;
        inFlight.add(idx);
        runOne(idx, queue[idx]).finally(() => inFlight.delete(idx));
      }
      while (inFlight.size) await new Promise((r) => setTimeout(r, 80));
    }

    await pump();
    setRunning(false);
    setPaused(false);
    pausedRef.current = false;

    // Snapshot to history.
    setResults((finalResults) => {
      const run: PlaygroundRun = {
        id: `${Date.now()}`,
        timestamp: Date.now(),
        modelId,
        aspect,
        resolution,
        parallel,
        refs: orderedSelectedRefUrls,
        results: finalResults,
      };
      setHistory((cur) => {
        const next = [run, ...cur].slice(0, 20);
        try {
          localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
        } catch {
          /* ignore quota */
        }
        return next;
      });
      return finalResults;
    });
  }

  function downloadAll() {
    const doneUrls = results.flatMap((r) => (r.status === "done" ? r.urls : []));
    doneUrls.forEach((url, i) => {
      const a = document.createElement("a");
      a.href = url;
      a.download = `playground-${Date.now()}-${i + 1}.png`;
      a.target = "_blank";
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
    });
  }

  function clearHistory() {
    setHistory([]);
    try {
      localStorage.removeItem(HISTORY_KEY);
    } catch {
      /* ignore */
    }
  }

  function loadRun(run: PlaygroundRun) {
    setModelId(run.modelId);
    setAspect(run.aspect);
    setResolution(run.resolution);
    setParallel(run.parallel);
    setSelectedRefUrls(run.refs);
    setPromptsText(run.results.map((r) => r.prompt).join("\n"));
    setResults(run.results);
  }

  return (
    <main className="flex min-h-screen flex-col bg-neutral-50 lg:h-screen">
      <StudioHeader
        active="playground"
        title="Image Playground"
        subtitle="Paste prompts (one per line) → batch generate. Fast, no friction."
        metrics={[
          { label: "Prompts", value: promptCount },
          { label: "Done", value: doneCount },
          { label: "Failed", value: failedCount },
          { label: "Active", value: activeJob },
          {
            label: results.length ? "Spent" : "Est. cost",
            value: results.length ? fmtUsd(actualSpend) : fmtUsd(estimatedCost),
          },
        ]}
      />

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {/* Settings rail */}
        <aside className="flex w-full shrink-0 flex-col gap-5 overflow-y-auto border-b border-neutral-200 bg-white p-5 lg:w-80 lg:border-b-0 lg:border-r">
          <section>
            <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-neutral-700">
              Settings
            </h2>
            <div className="space-y-3">
              <Field label="Model">
                <select
                  value={modelId}
                  onChange={(e) => setModelId(e.target.value as ModelId)}
                  className="w-full rounded-lg border border-neutral-200 bg-white px-2.5 py-2 text-xs outline-none focus:border-brand-500"
                >
                  {Object.values(MODELS).map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label} ({m.badge})
                    </option>
                  ))}
                </select>
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Aspect">
                  <select value={aspect} onChange={(e) => setAspect(e.target.value)} className="w-full rounded-lg border border-neutral-200 bg-white px-2.5 py-2 text-xs outline-none focus:border-brand-500">
                    {ASPECT_RATIOS.map((a) => (
                      <option key={a.value} value={a.value}>
                        {a.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Quality">
                  <select
                    value={resolution}
                    onChange={(e) => setResolution(e.target.value)}
                    className="w-full rounded-lg border border-neutral-200 bg-white px-2.5 py-2 text-xs outline-none focus:border-brand-500"
                  >
                    {RESOLUTIONS.map((r) => (
                      <option key={r.value} value={r.value}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Parallel" hint="Jobs running at once · doesn't change cost">
                  <select
                    value={parallel}
                    onChange={(e) => setParallel(Number(e.target.value))}
                    className="w-full rounded-lg border border-neutral-200 bg-white px-2.5 py-2 text-xs outline-none focus:border-brand-500"
                  >
                    {[1, 2, 4, 6, 8].map((n) => (
                      <option key={n} value={n}>
                        {n}x
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Per prompt">
                  <select
                    value={numPerPrompt}
                    onChange={(e) => setNumPerPrompt(Number(e.target.value))}
                    className="w-full rounded-lg border border-neutral-200 bg-white px-2.5 py-2 text-xs outline-none focus:border-brand-500"
                  >
                    {[1, 2, 3, 4].map((n) => (
                      <option key={n} value={n}>
                        {n} image{n > 1 ? "s" : ""}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
            </div>
          </section>

          <section
            onDragEnter={(e) => {
              if (!hasImageFiles(e)) return;
              e.preventDefault();
              setDragging(true);
            }}
            onDragOver={(e) => {
              if (!hasImageFiles(e)) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = "copy";
            }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                setDragging(false);
              }
            }}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
            }}
            className={`-m-2 rounded-lg p-2 transition ${
              dragging ? "bg-brand-50/70 ring-2 ring-brand-400" : ""
            }`}
          >
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-[11px] font-semibold uppercase tracking-widest text-neutral-700">
                Reference Library
              </h2>
              <span className="text-[10px] text-neutral-500">
                {orderedSelectedRefUrls.length}/{refs.length} selected
              </span>
            </div>

            <div className="mb-2 flex gap-2">
              <input
                type="text"
                value={pasteUrl}
                onChange={(e) => setPasteUrl(e.target.value)}
                placeholder="Paste image URL…"
                className="flex-1 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-xs outline-none placeholder:text-neutral-400 focus:border-brand-500"
                onKeyDown={(e) => {
                  if (e.key === "Enter") addPastedUrl();
                }}
              />
              <button
                type="button"
                onClick={addPastedUrl}
                className="rounded-lg border border-neutral-200 bg-neutral-50 px-3 text-xs font-semibold text-neutral-600 hover:bg-neutral-100"
              >
                Add
              </button>
            </div>

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className={`mb-3 flex w-full items-center justify-center rounded-lg border border-dashed px-3 py-2 text-xs font-semibold transition hover:border-brand-400 hover:bg-brand-50 hover:text-brand-700 disabled:opacity-60 ${
                dragging
                  ? "border-brand-500 bg-brand-50 text-brand-700"
                  : "border-neutral-300 bg-neutral-50 text-neutral-600"
              }`}
            >
              {uploading ? (
                <span className="inline-flex items-center gap-2">
                  <Spinner /> Uploading
                </span>
              ) : dragging ? (
                "Drop to upload"
              ) : (
                "Upload images or drag & drop"
              )}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.length) addFiles(e.target.files);
                e.currentTarget.value = "";
              }}
            />

            {refs.length > 0 ? (
              <>
                <p className="mb-2 text-[10px] leading-snug text-neutral-500">
                  Prompt rule: references are sent left to right. “Image 1” = “Image A”,
                  “Image 2” = “Image B”, and so on.
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {refs.map((u) => {
                    const attachmentIndex = orderedSelectedRefUrls.indexOf(u.url);
                    const selected = attachmentIndex >= 0;
                    const attachmentLabel = selected
                      ? `Image ${attachmentIndex + 1} · ${alphabeticImageLabel(attachmentIndex)}`
                      : "Not attached";
                    return (
                      <div
                        key={u.url}
                        className={`group relative aspect-square overflow-hidden rounded-lg border ${
                          selected
                            ? "border-neutral-900 ring-2 ring-neutral-900/10"
                            : "border-neutral-200"
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => toggleRef(u.url)}
                          className="block h-full w-full"
                          aria-label={`${attachmentLabel}: ${u.name}`}
                        >
                          <img src={u.url} alt={u.name} className="h-full w-full object-cover" />
                        </button>
                        <span
                          className={`pointer-events-none absolute left-1 top-1 rounded px-1.5 py-0.5 text-[9px] font-semibold shadow-sm ${
                            selected
                              ? "bg-neutral-900/90 text-white"
                              : "bg-white/90 text-neutral-500"
                          }`}
                        >
                          {attachmentLabel}
                        </span>
                        <ZoomButton
                          className="absolute bottom-1 right-1"
                          onClick={() => setRefPreviewSrc(u.url)}
                        />
                        <button
                          type="button"
                          onClick={() => removeRef(u.url)}
                          className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-white/90 text-xs text-neutral-500 opacity-0 shadow-sm transition hover:text-red-600 group-hover:opacity-100"
                        >
                          ×
                        </button>
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              <p className="text-[11px] text-neutral-500">
                Upload or paste at least one reference. All selected refs get passed to every prompt.
              </p>
            )}
          </section>
        </aside>

        {/* Prompts center */}
        <section className="flex min-w-0 flex-1 flex-col border-b border-neutral-200 bg-white lg:border-b-0 lg:border-r">
          <div className="flex items-center justify-between border-b border-neutral-200 px-6 py-4">
            <div>
              <h1 className="text-sm font-semibold text-neutral-900">Prompts</h1>
              <p className="text-[11px] text-neutral-500">
                One prompt per line. Each line generates {numPerPrompt} image
                {numPerPrompt > 1 ? "s" : ""}.
              </p>
            </div>
            <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-neutral-500">
              {promptCount} prompt{promptCount === 1 ? "" : "s"}
            </span>
          </div>

          <div className="relative flex min-h-0 flex-1 flex-col">
            <textarea
              value={promptsText}
              onChange={(e) => setPromptsText(e.target.value)}
              placeholder={`a moody portrait under neon lights\na sunlit linen shirt close-up\na minimalist product hero on cream background`}
              disabled={running}
              className="prompt-mono min-h-0 flex-1 resize-none px-6 py-5 text-[13px] leading-relaxed outline-none placeholder:text-neutral-400 disabled:bg-neutral-50"
            />
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-neutral-200 bg-neutral-50 px-6 py-4">
            <div className="flex flex-col gap-0.5 text-xs text-neutral-500">
              <span>
                {orderedSelectedRefUrls.length
                  ? `${orderedSelectedRefUrls.length} ref${orderedSelectedRefUrls.length === 1 ? "" : "s"} → ${promptCount} prompt${promptCount === 1 ? "" : "s"} × ${numPerPrompt} = ${totalImages} images`
                  : "Select reference images in the left rail"}
              </span>
              <span className="inline-flex items-center gap-1.5 text-[11px]">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
                <span className="font-mono text-neutral-600">
                  {fmtUsd(costPerImage)}/image
                </span>
                <span className="text-neutral-400">·</span>
                <span className="font-mono text-neutral-700">
                  est. {fmtUsd(estimatedCost)} this run
                </span>
                {results.length ? (
                  <>
                    <span className="text-neutral-400">·</span>
                    <span className="font-mono text-emerald-700">
                      spent {fmtUsd(actualSpend)}
                    </span>
                  </>
                ) : null}
              </span>
            </div>
            {running ? (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPaused((p) => !p)}
                  className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold transition active:scale-[0.98] ${
                    paused
                      ? "border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                      : "border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100"
                  }`}
                  title={
                    paused
                      ? "Resume dispatching queued prompts"
                      : "Stop dispatching new prompts. In-flight images keep running."
                  }
                >
                  {paused ? "▶ Resume" : "⏸ Pause"}
                </button>
                <span className="inline-flex items-center gap-2 rounded-xl bg-neutral-100 px-4 py-2.5 text-sm font-semibold text-neutral-600">
                  <Spinner />
                  {paused ? "Paused" : "Generating"} {doneCount + failedCount}/{promptCount}
                  {batchStart != null ? (
                    <span className="font-mono text-xs font-medium text-neutral-500">· {fmtDuration(batchElapsedMs)}</span>
                  ) : null}
                </span>
              </div>
            ) : (
              <button
                type="button"
                onClick={runBatch}
                disabled={!promptCount || !orderedSelectedRefUrls.length}
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-b from-neutral-800 to-neutral-950 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:from-neutral-700 hover:to-neutral-900 hover:shadow-md active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-neutral-300 disabled:bg-none disabled:text-neutral-500"
              >
                ⚡ Generate {promptCount || ""}
              </button>
            )}
          </div>
        </section>

        {/* Results panel */}
        <aside className="flex w-full shrink-0 flex-col overflow-y-auto bg-neutral-50 lg:w-[28rem]">
          <div className="flex items-center justify-between border-b border-neutral-200 bg-white px-5 py-4">
            <div>
              <h2 className="text-sm font-semibold text-neutral-900">Results</h2>
              <p className="text-[11px] text-neutral-500">
                {results.length
                  ? `${doneCount} done · ${failedCount} failed · ${results.length - doneCount - failedCount} pending`
                  : "Run a batch to see results"}
              </p>
              {flatImages.length > 1 ? (
                <p className="mt-1 text-[10px] text-neutral-400">
                  ←↑↓→ navigate · Enter to expand · {selectedIdx + 1}/{flatImages.length}
                </p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={downloadAll}
              disabled={!doneCount}
              className="rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
            >
              Download all
            </button>
          </div>

          <div className="flex-1 space-y-3 p-4">
            {results.length === 0 ? (
              <div className="flex h-full min-h-40 items-center justify-center text-xs text-neutral-400">
                No results yet
              </div>
            ) : (
              (() => {
                // Walk results once and assign each "done" image a global index
                // that matches `flatImages` exactly, so arrow-key selection
                // stays in lock-step with thumbnail render order.
                let globalIdx = 0;
                return results.map((r) => {
                  const elapsedMs =
                    r.startedAt == null
                      ? null
                      : (r.finishedAt ?? (r.status === "running" ? nowTick : null)) != null
                        ? (r.finishedAt ?? nowTick) - r.startedAt
                        : null;
                  return (
                  <div key={r.id} className="rounded-lg border border-neutral-200 bg-white p-3">
                    <div className="mb-2 flex items-start justify-between gap-2">
                      <p className="line-clamp-2 flex-1 text-[11px] leading-snug text-neutral-700">
                        {r.prompt}
                      </p>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <StatusPill status={r.status} />
                        {elapsedMs != null ? (
                          <span className="font-mono text-[10px] text-neutral-400">{fmtDuration(elapsedMs)}</span>
                        ) : null}
                      </div>
                    </div>
                    {r.settings ? (
                      <div
                        className="mb-2 flex flex-wrap gap-1"
                        aria-label="Generation settings"
                      >
                        {[
                          r.settings.modelLabel,
                          r.settings.aspect,
                          r.settings.resolution,
                          `${r.settings.numImages} ${r.settings.numImages === 1 ? "image" : "images"}`,
                          `${r.settings.referenceCount} ${r.settings.referenceCount === 1 ? "reference" : "references"}`,
                          r.settings.format.toUpperCase(),
                        ].map((setting) => (
                          <span
                            key={setting}
                            className="rounded-full border border-neutral-200 bg-neutral-50 px-2 py-0.5 text-[9px] font-medium text-neutral-500"
                          >
                            {setting}
                          </span>
                        ))}
                      </div>
                    ) : null}
                    {r.status === "done" && r.urls.length ? (
                      <div className="grid grid-cols-2 gap-2">
                        {r.urls.map((url, i) => {
                          const idx = globalIdx++;
                          const selected = idx === selectedIdx;
                          return (
                            <button
                              key={`${url}-${i}`}
                              ref={(el) => {
                                thumbRefs.current[idx] = el;
                              }}
                              type="button"
                              onClick={() => {
                                setSelectedIdx(idx);
                                setPreviewIdx(idx);
                              }}
                              onMouseEnter={() => setSelectedIdx(idx)}
                              className={`block overflow-hidden rounded-md border transition ${
                                selected
                                  ? "border-brand-500 ring-2 ring-brand-500/40"
                                  : "border-neutral-200"
                              }`}
                            >
                              <img src={url} alt="" className="block h-auto w-full" />
                            </button>
                          );
                        })}
                      </div>
                    ) : r.status === "failed" ? (
                      <p className="text-[11px] text-red-600">{r.error}</p>
                    ) : (
                      <div className="flex h-20 items-center justify-center text-[11px] text-neutral-400">
                        {r.status === "running" ? (
                          <span className="inline-flex items-center gap-2">
                            <Spinner /> Generating…
                          </span>
                        ) : (
                          "Queued"
                        )}
                      </div>
                    )}
                  </div>
                  );
                });
              })()
            )}
          </div>

          {history.length > 0 ? (
            <div className="border-t border-neutral-200 bg-white px-5 py-4">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-[11px] font-semibold uppercase tracking-widest text-neutral-700">
                  History
                </h3>
                <button
                  type="button"
                  onClick={clearHistory}
                  className="text-[11px] text-neutral-500 hover:text-red-600"
                >
                  Clear
                </button>
              </div>
              <ul className="space-y-1.5">
                {history.slice(0, 8).map((run) => {
                  const done = run.results.filter((r) => r.status === "done").length;
                  return (
                    <li key={run.id}>
                      <button
                        type="button"
                        onClick={() => loadRun(run)}
                        className="w-full rounded-md border border-neutral-100 bg-neutral-50 px-2.5 py-1.5 text-left text-[11px] text-neutral-600 hover:border-neutral-300 hover:bg-white"
                      >
                        <span className="font-semibold text-neutral-800">
                          {MODELS[run.modelId]?.label ?? run.modelId}
                        </span>{" "}
                        · {run.aspect} · {run.resolution} · {run.results.length} prompts · {done} done
                        <span className="ml-1 text-neutral-400">
                          {new Date(run.timestamp).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}
        </aside>
      </div>

      {previewIdx !== null && flatImages[previewIdx] ? (
        <ImageLightbox
          src={flatImages[previewIdx]}
          alt={`Result ${previewIdx + 1} of ${flatImages.length}`}
          images={flatImages}
          currentIndex={previewIdx}
          onIndexChange={(next) => {
            setPreviewIdx(next);
            setSelectedIdx(next);
          }}
          onClose={() => setPreviewIdx(null)}
        />
      ) : null}

      {refPreviewSrc ? (
        <ImageLightbox
          src={refPreviewSrc}
          alt="Reference preview"
          onClose={() => setRefPreviewSrc(null)}
        />
      ) : null}

      {error ? (
        <div className="fixed bottom-6 right-6 max-w-sm rounded-lg bg-red-600 px-4 py-3 text-sm text-white shadow-lg">
          <div className="flex items-start gap-2">
            <span className="font-semibold">Error:</span>
            <span className="flex-1">{error}</span>
            <button onClick={() => setError(null)} className="opacity-70 hover:opacity-100">
              ×
            </button>
          </div>
        </div>
      ) : null}
    </main>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] font-semibold uppercase tracking-widest text-neutral-500">
        {label}
      </span>
      {children}
      {hint ? (
        <span className="mt-1 block text-[10px] leading-snug text-neutral-400">{hint}</span>
      ) : null}
    </label>
  );
}

function StatusPill({ status }: { status: ResultStatus }) {
  const styles: Record<ResultStatus, string> = {
    queued: "bg-neutral-100 text-neutral-500",
    running: "bg-amber-50 text-amber-700",
    done: "bg-emerald-50 text-emerald-700",
    failed: "bg-red-50 text-red-700",
  };
  return (
    <span
      className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider ${styles[status]}`}
    >
      {status}
    </span>
  );
}
