"use client";

import { useEffect, useMemo, useState } from "react";
import Sidebar from "@/components/Sidebar";
import PromptPanel, { type BatchProgress } from "@/components/PromptPanel";
import OutputPanel from "@/components/OutputPanel";
import TopTabs from "@/components/TopTabs";
import type { HistoryItem, UploadedImage } from "@/components/types";
import type { ModelId } from "@/lib/models";
import type { OverlayMode, OverlayPlacement } from "@/lib/fal";
import { resizeIfNeeded } from "@/lib/image-resize";

function deriveOverlayMode(showName: boolean, showNumber: boolean): OverlayMode {
  if (showName && showNumber) return "both";
  if (showName) return "name";
  if (showNumber) return "number";
  return "none";
}

const HISTORY_KEY = "davidani_history_v1";

/**
 * Fetch a JSON endpoint and return the parsed body. If the response body is
 * not valid JSON (e.g. Next.js returned an HTML error page because a server
 * route crashed or middleware redirected), surface the first 200 chars of the
 * raw body in the thrown error so we can actually diagnose what failed.
 */
async function fetchJson(label: string, input: string, init?: RequestInit): Promise<any> {
  const res = await fetch(input, init);
  const raw = await res.text();
  let data: any;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    const preview = raw.replace(/\s+/g, " ").slice(0, 200);
    throw new Error(
      `${label}: server returned non-JSON (${res.status}). First 200 chars: "${preview}"`
    );
  }
  if (!res.ok) {
    throw new Error(`${label}: ${data?.error || `HTTP ${res.status}`}`);
  }
  return data;
}

export default function StudioPage() {
  // Controls
  const [modelId, setModelId] = useState<ModelId>("nano-banana");
  const [aspect, setAspect] = useState<string>("2:3");
  const [resolution, setResolution] = useState<string>("2K");
  const [format, setFormat] = useState<"png" | "jpeg">("png");
  const [numImages, setNumImages] = useState<number>(1);

  // Background color (sent to analyzer → becomes the studio backdrop)
  const [backgroundColor, setBackgroundColor] = useState<string>("#edeeee");

  // Text overlay controls
  const [colorName, setColorName] = useState<string>("");
  const [styleNumber, setStyleNumber] = useState<string>("");
  const [showName, setShowName] = useState<boolean>(false);
  const [showNumber, setShowNumber] = useState<boolean>(false);
  const [overlayPlacement, setOverlayPlacement] =
    useState<OverlayPlacement>("bottom-left");
  const [fontFamily, setFontFamily] = useState<string>("DM Sans");
  const [fontSize, setFontSize] = useState<number>(12);

  // Upload state
  const [uploads, setUploads] = useState<UploadedImage[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);

  // Style reference (image 2). null → server picks the default from
  // public/style-reference.png (or style-reference-2.png for pants).
  const [referenceImageUrl, setReferenceImageUrl] = useState<string | null>(null);
  const [referenceUploading, setReferenceUploading] = useState(false);

  // Prompt & generation
  const [prompt, setPrompt] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reference-is-a-two-piece-set toggle. User must set this themselves (the
  // reference photo alone isn't reliably auto-classifiable), and when true we
  // route Analyze through the four-field coordinated-set analyzer in lib/fal.
  const [twoPiece, setTwoPiece] = useState<boolean>(false);

  // History (client-only, localStorage)
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);

  // Batch state — non-null while a batch is in flight so the UI can show a
  // progress bar and disable the single-image actions. Goes back to null
  // once all images have been processed.
  const [batchProgress, setBatchProgress] = useState<BatchProgress | null>(null);

  // Load history on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      if (raw) {
        const parsed: HistoryItem[] = JSON.parse(raw);
        setHistory(parsed);
        if (parsed[0]) setCurrentId(parsed[0].id);
      }
    } catch {
      /* ignore */
    }
  }, []);

  // Persist history
  useEffect(() => {
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, 50)));
    } catch {
      /* ignore */
    }
  }, [history]);

  const currentRun = useMemo(
    () => history.find((h) => h.id === currentId) ?? null,
    [history, currentId]
  );

  // URL → original upload filename, so OutputPanel can name downloads
  // after the source product photo (e.g. "blue-pants.jpg" → "blue-pants.png")
  // instead of "davidani-<timestamp>.png". Rebuilt cheaply whenever the
  // uploads list changes.
  const uploadNames = useMemo(() => {
    const map: Record<string, string> = {};
    for (const u of uploads) map[u.url] = u.name;
    return map;
  }, [uploads]);

  function toggleSelect(url: string) {
    setSelected((s) => (s.includes(url) ? s.filter((u) => u !== url) : [...s, url]));
  }

  function removeUpload(url: string) {
    setUploads((list) => list.filter((u) => u.url !== url));
    setSelected((s) => s.filter((u) => u !== url));
  }

  async function replaceReferenceImage(file: File) {
    setReferenceUploading(true);
    setError(null);
    try {
      // Shrink oversized phone photos client-side — Vercel's serverless
      // functions reject bodies larger than 4.5 MB.
      const resized = await resizeIfNeeded(file);
      const form = new FormData();
      form.append("files", resized);
      const data = await fetchJson("Upload reference", "/api/upload", {
        method: "POST",
        body: form,
      });
      const url: string | undefined = data.uploads?.[0]?.url;
      if (!url) throw new Error("Upload succeeded but no URL returned");
      setReferenceImageUrl(url);
    } catch (err: any) {
      setError(err.message || "Reference upload failed");
    } finally {
      setReferenceUploading(false);
    }
  }

  function resetReferenceImage() {
    setReferenceImageUrl(null);
  }

  async function addFiles(files: FileList) {
    setUploading(true);
    setError(null);
    try {
      // Shrink oversized photos before sending to our upload endpoint.
      // See lib/image-resize.ts for rationale (Vercel body-size limit).
      const resized = await Promise.all(
        Array.from(files).map((f) => resizeIfNeeded(f))
      );
      const form = new FormData();
      resized.forEach((f) => form.append("files", f));

      const data = await fetchJson("Upload", "/api/upload", { method: "POST", body: form });
      const added: UploadedImage[] = data.uploads;
      if (added.length > 0) {
        setUploads((list) => [...list, ...added]);
        // auto-select newly uploaded
        setSelected((s) => [...s, ...added.map((a) => a.url)]);
      }
    } catch (err: any) {
      setError(err.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function analyzeProduct() {
    if (selected.length === 0) return;
    setAnalyzing(true);
    setError(null);
    try {
      // Analyze the first selected image — that's the product.
      const data = await fetchJson("Analyze", "/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageUrl: selected[0], backgroundColor, twoPiece }),
      });
      setPrompt(data.prompt);
      return data.prompt as string;
    } catch (err: any) {
      setError(err.message || "Analysis failed");
      return null;
    } finally {
      setAnalyzing(false);
    }
  }

  async function runGeneration() {
    if (selected.length === 0) return;

    // Unified flow: ALWAYS analyze on every click, then generate.
    //
    // We used to only analyze when the textarea was empty, which meant
    // toggling "2-piece set" or uploading new photos could silently reuse a
    // stale prompt. The user explicitly asked for the atomic behaviour —
    // every Generate click re-runs the analyzer so the prompt stays in sync
    // with the current photo + toggle state. The textarea remains editable
    // for debugging, but its content is overwritten on the next click.
    const analyzed = await analyzeProduct();
    if (!analyzed) return;
    const activePrompt = analyzed.trim();

    setLoading(true);
    setError(null);
    try {
      const data = await fetchJson("Generate", "/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          modelId,
          prompt: activePrompt,
          imageUrls: selected,
          referenceImageUrl,
          aspectRatio: aspect,
          resolution,
          format,
          numImages,
          overlay: {
            mode: deriveOverlayMode(showName, showNumber),
            placement: overlayPlacement,
            colorName,
            styleNumber,
            fontFamily,
            fontSize,
          },
        }),
      });

      const id = (crypto.randomUUID?.() || String(Date.now())).replace(/-/g, "");
      const item: HistoryItem = {
        id,
        timestamp: Date.now(),
        modelId,
        prompt: activePrompt,
        imageUrls: data.images.map((i: any) => i.url),
        referenceUrls: [...selected],
        aspect,
        resolution,
      };
      setHistory((h) => [item, ...h]);
      setCurrentId(id);
    } catch (err: any) {
      setError(err.message || "Generation failed");
    } finally {
      setLoading(false);
    }
  }

  /**
   * Batch mode — run the full analyze → generate pipeline once per selected
   * image, sequentially. Each successful generation becomes its own history
   * item so the user can tell which input produced which output. Failures
   * don't halt the batch; they're collected and summarised at the end.
   *
   * Sequential (not parallel) for three reasons:
   *   1. fal.ai rate-limits can trip when many edit jobs fire at once
   *   2. Vercel serverless instances could exhaust memory on 6 concurrent
   *      Nano Banana subscribes
   *   3. The progress UI reads much more naturally one-at-a-time than
   *      "everything's pending → everything's done"
   */
  async function runBatchGeneration() {
    if (selected.length < 2) return;

    const queue = [...selected];
    const failures: { url: string; error: string }[] = [];
    setError(null);

    setBatchProgress({
      total: queue.length,
      done: 0,
      failed: 0,
      stage: "analyzing",
    });

    // Create a SINGLE history item upfront. As each generation finishes we
    // append its output URL (and source/prompt) to this one item, so the
    // OutputPanel's multi-variant thumbnail strip naturally shows all results
    // together. Without this grouping, each iteration would create its own
    // history entry and only the last one would appear in the main preview.
    const batchId = (crypto.randomUUID?.() || String(Date.now())).replace(/-/g, "");
    const batchItem: HistoryItem = {
      id: batchId,
      timestamp: Date.now(),
      modelId,
      prompt: "", // will be set to the first successful prompt below
      imageUrls: [],
      referenceUrls: [],
      aspect,
      resolution,
      prompts: [],
      batch: true,
    };
    setHistory((h) => [batchItem, ...h]);
    setCurrentId(batchId);

    for (let i = 0; i < queue.length; i++) {
      const sourceUrl = queue[i];

      // --- Analyze this specific image ---
      setBatchProgress((p) => (p ? { ...p, stage: "analyzing" } : p));
      let imagePrompt: string;
      try {
        const analyzeData = await fetchJson("Analyze", "/api/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageUrl: sourceUrl, backgroundColor, twoPiece }),
        });
        imagePrompt = (analyzeData.prompt as string).trim();
        if (!imagePrompt) throw new Error("Analyzer returned empty prompt");
      } catch (err: any) {
        failures.push({ url: sourceUrl, error: err?.message || "Analyze failed" });
        setBatchProgress((p) =>
          p ? { ...p, done: p.done + 1, failed: p.failed + 1, stage: "idle" } : p
        );
        continue;
      }

      // --- Generate from that prompt, using only this one image ---
      setBatchProgress((p) => (p ? { ...p, stage: "generating" } : p));
      try {
        const data = await fetchJson("Generate", "/api/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            modelId,
            prompt: imagePrompt,
            // Batch mode: each input is its own generation — use only this URL.
            imageUrls: [sourceUrl],
            referenceImageUrl,
            aspectRatio: aspect,
            resolution,
            format,
            // Always 1 variant per input in batch mode (see design decisions).
            numImages: 1,
            overlay: {
              mode: deriveOverlayMode(showName, showNumber),
              placement: overlayPlacement,
              colorName,
              styleNumber,
              fontFamily,
              fontSize,
            },
          }),
        });

        const outputUrls: string[] = data.images.map((x: any) => x.url);
        // Append the new output(s) to the shared batch run. Using the
        // functional setHistory form ensures we don't clobber earlier
        // appends from this same loop.
        setHistory((h) =>
          h.map((item) =>
            item.id === batchId
              ? {
                  ...item,
                  prompt: item.prompt || imagePrompt,
                  imageUrls: [...item.imageUrls, ...outputUrls],
                  referenceUrls: [...item.referenceUrls, sourceUrl],
                  prompts: [...(item.prompts ?? []), imagePrompt],
                }
              : item
          )
        );
      } catch (err: any) {
        failures.push({ url: sourceUrl, error: err?.message || "Generate failed" });
        setBatchProgress((p) =>
          p ? { ...p, failed: p.failed + 1 } : p
        );
      } finally {
        setBatchProgress((p) =>
          p ? { ...p, done: p.done + 1, stage: "idle" } : p
        );
      }
    }

    // If every single image failed, the shared batch run will be empty — drop
    // it so we don't leave a zero-image placeholder in history.
    setHistory((h) => {
      const run = h.find((item) => item.id === batchId);
      if (run && run.imageUrls.length === 0) {
        return h.filter((item) => item.id !== batchId);
      }
      return h;
    });

    // Clear the progress strip but surface a summary toast if anything failed.
    setBatchProgress(null);
    if (failures.length > 0) {
      const list = failures
        .slice(0, 3)
        .map((f, idx) => `• image ${idx + 1}: ${f.error}`)
        .join("\n");
      const more =
        failures.length > 3 ? `\n• …and ${failures.length - 3} more` : "";
      setError(
        `Batch finished — ${queue.length - failures.length} of ${queue.length} succeeded. ${failures.length} failed:\n${list}${more}`
      );
    }
  }

  return (
    <main className="flex h-screen flex-col bg-neutral-50">
      {/* Top bar */}
      <header className="flex items-center justify-between border-b border-neutral-200 bg-white px-6 py-3">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-neutral-900 text-xs font-bold text-white">
            D
          </div>
          <span className="text-sm font-semibold">Davi &amp; Dani Photo Studio</span>
          <TopTabs active="image" />
        </div>
        <div className="flex items-center gap-3 text-xs text-neutral-500">
          <span>Runs: {history.length}</span>
          <span>·</span>
          <span>Active: {loading ? 1 : 0}</span>
        </div>
      </header>

      {/* 3-column layout */}
      <div className="flex min-h-0 flex-1">
        <Sidebar
          modelId={modelId}
          onModelChange={setModelId}
          aspect={aspect}
          onAspectChange={setAspect}
          resolution={resolution}
          onResolutionChange={setResolution}
          format={format}
          onFormatChange={setFormat}
          uploads={uploads}
          selectedUrls={selected}
          onToggleSelect={toggleSelect}
          onAddFiles={addFiles}
          onRemoveUpload={removeUpload}
          backgroundColor={backgroundColor}
          onBackgroundColorChange={setBackgroundColor}
          colorName={colorName}
          onColorNameChange={setColorName}
          styleNumber={styleNumber}
          onStyleNumberChange={setStyleNumber}
          showName={showName}
          onShowNameChange={setShowName}
          showNumber={showNumber}
          onShowNumberChange={setShowNumber}
          overlayPlacement={overlayPlacement}
          onOverlayPlacementChange={setOverlayPlacement}
          fontFamily={fontFamily}
          onFontFamilyChange={setFontFamily}
          fontSize={fontSize}
          onFontSizeChange={setFontSize}
          referenceImageUrl={referenceImageUrl}
          defaultReferencePreview="/style-reference.png"
          onReferenceReplace={replaceReferenceImage}
          onReferenceReset={resetReferenceImage}
          referenceUploading={referenceUploading}
        />

        <PromptPanel
          prompt={prompt}
          onPromptChange={setPrompt}
          numImages={numImages}
          onNumImagesChange={setNumImages}
          onGenerate={runGeneration}
          analyzing={analyzing}
          loading={loading || uploading}
          disabled={selected.length === 0}
          onBatchGenerate={runBatchGeneration}
          canBatch={selected.length >= 2}
          batchProgress={batchProgress}
          twoPiece={twoPiece}
          onTwoPieceChange={setTwoPiece}
        />

        <OutputPanel
          current={currentRun}
          history={history}
          onSelectHistory={setCurrentId}
          uploadNames={uploadNames}
          onClearHistory={() => {
            setHistory([]);
            setCurrentId(null);
          }}
          // "Regenerate this" from a batch thumbnail: drop the prompt into
          // the PromptPanel, put the batch-slot's source image back into the
          // selection, and scroll the user back to the prompt so they can
          // edit before re-running. We deliberately DON'T auto-generate —
          // the whole point is letting the user tweak a weak prompt.
          onRegenerate={({ prompt: p, sourceUrl }) => {
            if (p) setPrompt(p);
            if (sourceUrl) {
              // Make sure the source is uploaded + selected so Generate has
              // something to work with. If the URL isn't in `uploads` yet
              // (e.g. the user cleared them), we add a synthetic entry so
              // the thumbnail lights up in the sidebar.
              setUploads((list) =>
                list.some((u) => u.url === sourceUrl)
                  ? list
                  : [...list, { url: sourceUrl, name: "batch-source" }]
              );
              setSelected([sourceUrl]);
            }
            // No analyze-gate to clear anymore — unified Generate always
            // re-runs the analyzer itself. If the user clicks Generate after
            // Regenerate, the prompt they just dropped in will be overwritten.
            // That's intentional: the user's tweak survives as long as they
            // don't click Generate, which matches the rest of the flow.
          }}
        />
      </div>

      {/* Error / batch-summary toast — whitespace-pre-line so multi-line
          batch summaries render correctly. */}
      {error && (
        <div className="fixed bottom-6 right-6 max-w-md rounded-lg bg-red-600 px-4 py-3 text-sm text-white shadow-lg">
          <div className="flex items-start gap-2">
            <span className="font-semibold">
              {error.startsWith("Batch finished") ? "Summary:" : "Error:"}
            </span>
            <span className="flex-1 whitespace-pre-line">{error}</span>
            <button onClick={() => setError(null)} className="opacity-70 hover:opacity-100">
              ×
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
