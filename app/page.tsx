"use client";

import { useEffect, useMemo, useState } from "react";
import Sidebar from "@/components/Sidebar";
import PromptPanel from "@/components/PromptPanel";
import OutputPanel from "@/components/OutputPanel";
import type { HistoryItem, UploadedImage } from "@/components/types";
import type { ModelId } from "@/lib/models";
import type { OverlayMode, OverlayPlacement } from "@/lib/fal";

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

  // History (client-only, localStorage)
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);

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
      const form = new FormData();
      form.append("files", file);
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
      const form = new FormData();
      Array.from(files).forEach((f) => form.append("files", f));

      const data = await fetchJson("Upload", "/api/upload", { method: "POST", body: form });
      const added: UploadedImage[] = data.uploads;
      setUploads((list) => [...list, ...added]);
      // auto-select newly uploaded
      setSelected((s) => [...s, ...added.map((a) => a.url)]);
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
        body: JSON.stringify({ imageUrl: selected[0], backgroundColor }),
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

    // Two-step flow:
    //   1. If no prompt is loaded yet (or user wants a fresh one), analyze the
    //      selected product photo into a Zara-template prompt.
    //   2. Send that prompt + the product photo to Nano Banana's edit endpoint
    //      so the product is preserved pixel-perfect while the aesthetic
    //      matches the template.
    let activePrompt = prompt.trim();
    if (!activePrompt) {
      const analyzed = await analyzeProduct();
      if (!analyzed) return;
      activePrompt = analyzed.trim();
    }

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

  return (
    <main className="flex h-screen flex-col bg-neutral-50">
      {/* Top bar */}
      <header className="flex items-center justify-between border-b border-neutral-200 bg-white px-6 py-3">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-neutral-900 text-xs font-bold text-white">
            D
          </div>
          <span className="text-sm font-semibold">Davi &amp; Dani Photo Studio</span>
          <nav className="ml-6 flex items-center gap-4 text-sm text-neutral-500">
            <span className="rounded-md bg-neutral-100 px-2 py-1 text-neutral-900">Image Studio</span>
          </nav>
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
          onAnalyze={analyzeProduct}
          analyzing={analyzing}
          loading={loading || uploading}
          canAnalyze={selected.length > 0}
          disabled={selected.length === 0}
        />

        <OutputPanel
          current={currentRun}
          history={history}
          onSelectHistory={setCurrentId}
          onClearHistory={() => {
            setHistory([]);
            setCurrentId(null);
          }}
        />
      </div>

      {/* Error toast */}
      {error && (
        <div className="fixed bottom-6 right-6 max-w-sm rounded-lg bg-red-600 px-4 py-3 text-sm text-white shadow-lg">
          <div className="flex items-start gap-2">
            <span className="font-semibold">Error:</span>
            <span className="flex-1">{error}</span>
            <button onClick={() => setError(null)} className="opacity-70 hover:opacity-100">
              ×
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
