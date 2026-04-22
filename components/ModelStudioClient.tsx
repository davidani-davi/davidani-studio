"use client";

import { useEffect, useMemo, useState } from "react";
import ModelSidebar from "@/components/ModelSidebar";
import PromptPanel from "@/components/PromptPanel";
import OutputPanel from "@/components/OutputPanel";
import TopTabs from "@/components/TopTabs";
import type { HistoryItem, UploadedImage } from "@/components/types";
import type {
  GarmentFitAdjustment,
  GarmentLengthAdjustment,
  OverlayMode,
  OverlayPlacement,
} from "@/lib/fal";
import { resizeIfNeeded } from "@/lib/image-resize";
import type { ModelId } from "@/lib/models";
import type { HumanModel, PresetView } from "@/lib/models-registry";

function deriveOverlayMode(showName: boolean, showNumber: boolean): OverlayMode {
  if (showName && showNumber) return "both";
  if (showName) return "name";
  if (showNumber) return "number";
  return "none";
}

// Separate history key so Model Studio runs don't commingle with Image Studio
// runs in localStorage. Each workspace has its own run list.
const HISTORY_KEY = "davidani_model_history_v1";

async function fetchJson(label: string, input: string, init?: RequestInit): Promise<any> {
  const res = await fetch(input, init);
  const raw = await res.text();
  let data: any;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    const preview = raw.replace(/\s+/g, " ").slice(0, 200);
    if (/server action not found/i.test(raw)) {
      throw new Error(
        `${label}: your browser is talking to a stale Next.js dev build. Hard refresh the page and restart \`npm run dev\` if needed.`
      );
    }
    throw new Error(
      `${label}: server returned non-JSON (${res.status}). First 200 chars: "${preview}"`
    );
  }
  if (!res.ok) {
    throw new Error(`${label}: ${data?.error || `HTTP ${res.status}`}`);
  }
  return data;
}

interface Props {
  initialHumanModels: HumanModel[];
}

export default function ModelStudioClient({ initialHumanModels }: Props) {
  /* ---------- Output (AI image) model & settings ---------- */
  const [modelId, setModelId] = useState<ModelId>("nano-banana");
  const [aspect, setAspect] = useState<string>("2:3");
  const [resolution, setResolution] = useState<string>("2K");
  const [format, setFormat] = useState<"png" | "jpeg">("png");
  const [numImages, setNumImages] = useState<number>(1);

  /* ---------- Text overlay ---------- */
  const [colorName, setColorName] = useState<string>("");
  const [styleNumber, setStyleNumber] = useState<string>("");
  const [showName, setShowName] = useState<boolean>(false);
  const [showNumber, setShowNumber] = useState<boolean>(false);
  const [overlayPlacement, setOverlayPlacement] =
    useState<OverlayPlacement>("bottom-left");
  const [fontFamily, setFontFamily] = useState<string>("DM Sans");
  const [fontSize, setFontSize] = useState<number>(12);

  /* ---------- User-uploaded garment photos ---------- */
  const [uploads, setUploads] = useState<UploadedImage[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);

  /* ---------- Human model catalog ---------- */
  const [humanModels] = useState<HumanModel[]>(initialHumanModels);
  const [modelsLoading] = useState(false);
  const [selectedHumanModelId, setSelectedHumanModelId] = useState<string | null>(
    initialHumanModels[0]?.id ?? null
  );
  const [selectedPoseId, setSelectedPoseId] = useState<string | null>(
    initialHumanModels[0]?.poses[0]?.id ?? null
  );
  const [selectedView, setSelectedView] = useState<PresetView>("front");

  /* ---------- Prompt & generation ---------- */
  const [prompt, setPrompt] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fitAdjustment, setFitAdjustment] =
    useState<GarmentFitAdjustment>("true-to-reference");
  const [lengthAdjustment, setLengthAdjustment] =
    useState<GarmentLengthAdjustment>("true-to-reference");

  /* ---------- Coordinated two-piece-set toggle ----------
     When checked, the analyze-model API routes through extractTwoPieceFields
     + buildModelSwapTwoPiecePrompt so the model's entire outfit (not just a
     single garment) is swapped for a matching top + bottom set. */
  const [twoPiece, setTwoPiece] = useState<boolean>(false);

  /* ---------- History ---------- */
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);

  /* ---------- Persist / load history ---------- */
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

  // URL → original garment upload filename, so OutputPanel names model-swap
  // downloads after the garment the user dropped in.
  const uploadNames = useMemo(() => {
    const map: Record<string, string> = {};
    for (const u of uploads) map[u.url] = u.name;
    return map;
  }, [uploads]);

  /* ---------- Handlers ---------- */

  function toggleSelect(url: string) {
    setSelected((s) => (s.includes(url) ? s.filter((u) => u !== url) : [...s, url]));
  }
  function removeUpload(url: string) {
    setUploads((list) => list.filter((u) => u.url !== url));
    setSelected((s) => s.filter((u) => u !== url));
  }

  async function addFiles(files: FileList) {
    setUploading(true);
    setError(null);
    try {
      const resized = await Promise.all(
        Array.from(files).map((f) => resizeIfNeeded(f))
      );
      const form = new FormData();
      resized.forEach((f) => form.append("files", f));
      const data = await fetchJson("Upload", "/api/upload", { method: "POST", body: form });
      const added: UploadedImage[] = data.uploads;
      setUploads((list) => [...list, ...added]);
      setSelected((s) => [...s, ...added.map((a) => a.url)]);
    } catch (err: any) {
      setError(err.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  function handleHumanModelChange(id: string) {
    setSelectedHumanModelId(id);
    const m = humanModels.find((hm) => hm.id === id);
    // Reset pose to the first pose of the newly-selected model.
    setSelectedPoseId(m?.poses[0]?.id ?? null);
    // Invalidate any stale prompt — it was written for the previous model/pose.
    setPrompt("");
  }
  function handlePoseChange(id: string) {
    setSelectedPoseId(id);
    // Same rationale — prompts are pose-specific (they cite the exact pose).
    setPrompt("");
  }

  /**
   * Analyze = run both vision passes (user garment + selected pose) and
   * assemble the deterministic model-swap prompt.
   */
  async function analyzeForModel(): Promise<string | null> {
    if (selected.length === 0 || !selectedHumanModelId || !selectedPoseId) return null;
    setAnalyzing(true);
    setError(null);
    try {
      const data = await fetchJson("Analyze for model", "/api/analyze-model", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          modelId: selectedHumanModelId,
          poseId: selectedPoseId,
          view: selectedView,
          garmentImageUrl: selected[0],
          twoPiece,
          adjustments: {
            fit: fitAdjustment,
            length: lengthAdjustment,
          },
        }),
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
    if (selected.length === 0 || !selectedHumanModelId || !selectedPoseId) return;

    // Unified flow: always re-analyze on every click, then generate. The
    // textarea still shows the current prompt for debugging but its content
    // is overwritten on each run — see the PromptPanel header copy.
    const analyzed = await analyzeForModel();
    if (!analyzed) return;
    const activePrompt = analyzed.trim();

    setLoading(true);
    setError(null);
    try {
      const data = await fetchJson("Generate", "/api/generate-model", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          modelId,
          humanModelId: selectedHumanModelId,
          poseId: selectedPoseId,
          view: selectedView,
          prompt: activePrompt,
          garmentImageUrls: selected,
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
        referenceUrls: [...selected, data.poseUrl].filter(Boolean),
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

  const canAnalyze =
    selected.length > 0 && !!selectedHumanModelId && !!selectedPoseId;

  return (
    <main className="flex min-h-screen flex-col bg-neutral-50 lg:h-screen">
      {/* Top bar */}
      <header className="flex flex-col gap-3 border-b border-neutral-200 bg-white px-4 py-3 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-neutral-900 text-xs font-bold text-white">
            D
          </div>
          <span className="text-sm font-semibold">Davi &amp; Dani Photo Studio</span>
          <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-neutral-600">
            V1.1
          </span>
          <TopTabs active="model" />
        </div>
        <div className="flex items-center gap-3 text-xs text-neutral-500 lg:justify-end">
          <span>Runs: {history.length}</span>
          <span>·</span>
          <span>Active: {loading ? 1 : 0}</span>
        </div>
      </header>

      {/* 3-column layout */}
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <ModelSidebar
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
          humanModels={humanModels}
          selectedHumanModelId={selectedHumanModelId}
          onHumanModelChange={handleHumanModelChange}
          selectedPoseId={selectedPoseId}
          onPoseChange={handlePoseChange}
          selectedView={selectedView}
          onViewChange={setSelectedView}
          modelsLoading={modelsLoading}
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
        />

        <PromptPanel
          prompt={prompt}
          onPromptChange={setPrompt}
          numImages={numImages}
          onNumImagesChange={setNumImages}
          onGenerate={runGeneration}
          analyzing={analyzing}
          loading={loading || uploading}
          disabled={!canAnalyze}
          twoPiece={twoPiece}
          onTwoPieceChange={setTwoPiece}
          fitAdjustment={fitAdjustment}
          onFitAdjustmentChange={setFitAdjustment}
          lengthAdjustment={lengthAdjustment}
          onLengthAdjustmentChange={setLengthAdjustment}
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
