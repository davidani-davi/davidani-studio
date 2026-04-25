"use client";

import { useEffect, useMemo, useState } from "react";
import ModelSidebar from "@/components/ModelSidebar";
import PromptPanel, {
  type AnalysisReview,
  type BatchProgress,
} from "@/components/PromptPanel";
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
import { optimizePromptForModel } from "@/lib/prompt-strategy";

function deriveOverlayMode(showName: boolean, showNumber: boolean): OverlayMode {
  if (showName && showNumber) return "both";
  if (showName) return "name";
  if (showNumber) return "number";
  return "none";
}

// Separate history key so Model Studio runs don't commingle with Image Studio
// runs in localStorage. Each workspace has its own run list.
const HISTORY_KEY = "davidani_model_history_v1";

const POSE_VARIATION_NOTES = [
  "Keep the selected preset as the clear pose anchor, but introduce a subtle variation: a tiny head-angle shift and a slightly softer shoulder line.",
  "Keep the same overall stance and framing, but vary the pose slightly with a small torso turn and a gentler hand position.",
  "Preserve the selected preset's pose family, but add a subtle asymmetry: a slight weight shift and a slightly different arm relaxation.",
  "Keep the chosen preset recognizable, but introduce a minor pose variation through a softer elbow bend and a small chin-angle change.",
  "Match the same overall preset pose, but vary it subtly with a light shoulder rotation and a slightly different hip balance.",
  "Keep the preset's view, framing, and identity intact, but make the final pose feel like a neighboring shot from the same set with a small stance adjustment.",
] as const;

function buildPoseVariationSuffix(index: number, total: number): string {
  const note = POSE_VARIATION_NOTES[index % POSE_VARIATION_NOTES.length];
  return (
    ` Pose variation directive for batch image ${index + 1} of ${total}: ${note} ` +
    `Do not change the selected view, do not change the model identity, and do not drift into a dramatically different pose.`
  );
}

type FitRepairMode = "all" | "silhouette" | "length" | "details";
type QualityControlAction = "restore-face" | "retry-closer" | "different-pose";

function buildQualityControlSuffix(action: QualityControlAction, fitMode?: FitRepairMode): string {
  if (action === "restore-face") {
    return (
      " Quality control directive: restore and preserve the model's original face, facial features, skin tone, expression, hair, head angle, body proportions, and identity from the selected model pose image exactly. " +
      "Do not beautify, age-shift, reshape, repaint, or replace the face. Keep the background, lighting, camera angle, and garment edit otherwise unchanged."
    );
  }
  if (action === "retry-closer") {
    if (fitMode === "silhouette") {
      return (
        " Quality control directive: repair the garment silhouette and fit using the uploaded garment reference as the source of truth. Match the original width, volume, body distance, shoulder/waist/hip proportions, leg or sleeve shape, drape, and overall outline. " +
        "Do not make the garment tighter, looser, straighter, puffier, cropped, or longer unless that exact shape is visible in the reference."
      );
    }
    if (fitMode === "length") {
      return (
        " Quality control directive: repair the garment length using the uploaded garment reference as the source of truth. Match the hem placement, crop point, sleeve length, inseam, rise, cuff position, waistband placement, and visible proportions exactly. " +
        "Do not shorten, lengthen, tuck, crop, cuff, or extend the garment beyond the reference."
      );
    }
    if (fitMode === "details") {
      return (
        " Quality control directive: repair garment construction details using the uploaded garment reference as the source of truth. Restore seam placement, stitching, panels, pockets, buttons, zippers, drawstrings, ribbing, hems, trims, hardware, fabric texture, folds, and material behavior. " +
        "Do not simplify, omit, invent, or move construction details."
      );
    }
    return (
      " Quality control directive: retry closer to the uploaded garment reference. Preserve the garment's exact silhouette, fit, length, seam placement, stitching, fabric texture, trims, hardware, pockets, cuffs, waistband, and material behavior. " +
      "Use the uploaded garment as the source of truth because the previous result drifted away from the product shape. Do not simplify the construction, do not change the garment category, and do not drift away from the original product."
    );
  }
  return (
    " Quality control directive: create a neighboring pose variation while preserving the same model identity, face, body proportions, garment, background, lighting, and camera style. " +
    "Use a subtle different pose: a small head angle change, slight shoulder rotation, gentle hand/arm variation, or natural weight shift. Do not change the view into a dramatically different shot."
  );
}

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
  const [modelId, setModelId] = useState<ModelId>("gpt-image");
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
  const [analysisReview, setAnalysisReview] = useState<AnalysisReview | null>(null);

  /* ---------- Coordinated two-piece-set toggle ----------
     When checked, the analyze-model API routes through extractTwoPieceFields
     + buildModelSwapTwoPiecePrompt so the model's entire outfit (not just a
     single garment) is swapped for a matching top + bottom set. */
  const [twoPiece, setTwoPiece] = useState<boolean>(false);

  /* ---------- History ---------- */
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [batchProgress, setBatchProgress] = useState<BatchProgress | null>(null);

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
  const selectedModelIsPants = selectedHumanModelId?.startsWith("pants") ?? false;

  // URL → original garment upload filename, so OutputPanel names model-swap
  // downloads after the garment the user dropped in.
  const uploadNames = useMemo(() => {
    const map: Record<string, string> = {};
    for (const u of uploads) map[u.url] = u.name;
    return map;
  }, [uploads]);

  /* ---------- Handlers ---------- */

  function toggleSelect(url: string) {
    setPrompt("");
    setAnalysisReview(null);
    setSelected((s) => (s.includes(url) ? s.filter((u) => u !== url) : [...s, url]));
  }
  function removeUpload(url: string) {
    setPrompt("");
    setAnalysisReview(null);
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
      setPrompt("");
      setAnalysisReview(null);
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
    setAnalysisReview(null);
  }
  function handlePoseChange(id: string) {
    setSelectedPoseId(id);
    // Same rationale — prompts are pose-specific (they cite the exact pose).
    setPrompt("");
    setAnalysisReview(null);
  }

  function handleViewChange(view: PresetView) {
    setSelectedView(view);
    setPrompt("");
    setAnalysisReview(null);
  }

  function handleTwoPieceChange(value: boolean) {
    setTwoPiece(value);
    setPrompt("");
    setAnalysisReview(null);
  }

  function handleFitAdjustmentChange(value: GarmentFitAdjustment) {
    setFitAdjustment(value);
    setPrompt("");
  }

  function handleLengthAdjustmentChange(value: GarmentLengthAdjustment) {
    setLengthAdjustment(value);
    setPrompt("");
  }

  function handleAnalysisReviewChange(next: AnalysisReview) {
    setAnalysisReview({ ...next, edited: true });
    setPrompt("");
  }

  /**
   * Analyze = run both vision passes (user garment + selected pose) and
   * assemble the deterministic model-swap prompt.
   */
  async function analyzeForModel({
    useReviewOverride = true,
  }: { useReviewOverride?: boolean } = {}): Promise<string | null> {
    if (selected.length === 0 || !selectedHumanModelId || !selectedPoseId) return null;
    setAnalyzing(true);
    setError(null);
    try {
      const garmentOverride =
        useReviewOverride && !twoPiece && analysisReview?.garment.trim()
          ? {
              garment: analysisReview.garment.trim(),
              features: analysisReview.features.trim(),
            }
          : undefined;
      const data = await fetchJson("Analyze for model", "/api/analyze-model", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          modelId: selectedHumanModelId,
          poseId: selectedPoseId,
          view: selectedView,
          garmentImageUrl: selected[0],
          garmentImageUrls: selected,
          twoPiece,
          garmentOverride,
          adjustments: {
            fit: fitAdjustment,
            length: lengthAdjustment,
          },
        }),
      });
      setPrompt(data.prompt);
      if (!data.twoPiece && typeof data.garment === "string") {
        setAnalysisReview({
          garment: data.garment,
          features: typeof data.features === "string" ? data.features : "",
          updatedAt: Date.now(),
          edited: false,
        });
      } else {
        setAnalysisReview(null);
      }
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
    const analyzed = await analyzeForModel({
      useReviewOverride: analysisReview?.edited === true,
    });
    if (!analyzed) return;
    const activePrompt = analyzed.trim();
    const promptUsed = optimizePromptForModel(modelId, activePrompt);

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
        prompt: promptUsed,
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

  async function runBatchGeneration() {
    if (selected.length < 2 || !selectedHumanModelId || !selectedPoseId) return;

    const queue = [...selected];
    const failures: { url: string; error: string }[] = [];
    setError(null);

    setBatchProgress({
      total: queue.length,
      done: 0,
      failed: 0,
      stage: "analyzing",
    });

    const batchId = (crypto.randomUUID?.() || String(Date.now())).replace(/-/g, "");
    const batchItem: HistoryItem = {
      id: batchId,
      timestamp: Date.now(),
      modelId,
      prompt: "",
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

      setBatchProgress((p) => (p ? { ...p, stage: "analyzing" } : p));
      let imagePrompt: string;
      try {
        const analyzeData = await fetchJson("Analyze for model", "/api/analyze-model", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            modelId: selectedHumanModelId,
            poseId: selectedPoseId,
            view: selectedView,
            garmentImageUrl: sourceUrl,
            garmentImageUrls: twoPiece ? selected.slice(0, 2) : [sourceUrl],
            twoPiece,
            adjustments: {
              fit: fitAdjustment,
              length: lengthAdjustment,
            },
          }),
        });
        const basePrompt = (analyzeData.prompt as string).trim();
        if (!basePrompt) throw new Error("Analyzer returned empty prompt");
        imagePrompt = optimizePromptForModel(
          modelId,
          `${basePrompt}${buildPoseVariationSuffix(i, queue.length)}`
        );
      } catch (err: any) {
        failures.push({ url: sourceUrl, error: err?.message || "Analyze failed" });
        setBatchProgress((p) =>
          p ? { ...p, done: p.done + 1, failed: p.failed + 1, stage: "idle" } : p
        );
        continue;
      }

      setBatchProgress((p) => (p ? { ...p, stage: "generating" } : p));
      try {
        const data = await fetchJson("Generate", "/api/generate-model", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            modelId,
            humanModelId: selectedHumanModelId,
            poseId: selectedPoseId,
            view: selectedView,
            prompt: imagePrompt,
            garmentImageUrls: [sourceUrl],
            aspectRatio: aspect,
            resolution,
            format,
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
        setBatchProgress((p) => (p ? { ...p, failed: p.failed + 1 } : p));
      } finally {
        setBatchProgress((p) =>
          p ? { ...p, done: p.done + 1, stage: "idle" } : p
        );
      }
    }

    setHistory((h) => {
      const run = h.find((item) => item.id === batchId);
      if (run && run.imageUrls.length === 0) {
        return h.filter((item) => item.id !== batchId);
      }
      return h;
    });

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

  async function runQualityControl(params: {
    action: QualityControlAction;
    fitMode?: FitRepairMode;
    prompt: string;
    sourceUrl: string | null;
  }) {
    if (!selectedHumanModelId || !selectedPoseId) return;
    const sourceUrl = params.sourceUrl || selected[0];
    if (!sourceUrl) return;

    const imagePrompt = optimizePromptForModel(
      modelId,
      `${params.prompt.trim()}${buildQualityControlSuffix(params.action, params.fitMode)}`
    );

    setLoading(true);
    setError(null);
    try {
      const data = await fetchJson("Quality control", "/api/generate-model", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          modelId,
          humanModelId: selectedHumanModelId,
          poseId: selectedPoseId,
          view: selectedView,
          prompt: imagePrompt,
          garmentImageUrls: [sourceUrl],
          aspectRatio: aspect,
          resolution,
          format,
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

      const id = (crypto.randomUUID?.() || String(Date.now())).replace(/-/g, "");
      const item: HistoryItem = {
        id,
        timestamp: Date.now(),
        modelId,
        prompt: imagePrompt,
        imageUrls: data.images.map((i: any) => i.url),
        referenceUrls: [sourceUrl, data.poseUrl].filter(Boolean),
        aspect,
        resolution,
      };
      setHistory((h) => [item, ...h]);
      setCurrentId(id);
    } catch (err: any) {
      setError(err.message || "Quality control failed");
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
            V1.3
          </span>
          <TopTabs active="model" />
        </div>
        <div className="flex items-center gap-3 text-xs text-neutral-500 lg:justify-end">
          <span>Runs: {history.length}</span>
          <span>·</span>
          <span>Active: {loading || batchProgress ? 1 : 0}</span>
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
          onViewChange={handleViewChange}
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
          onAnalyze={() => analyzeForModel({ useReviewOverride: false })}
          analyzing={analyzing}
          loading={loading || uploading}
          disabled={!canAnalyze}
          onBatchGenerate={runBatchGeneration}
          canBatch={canAnalyze && selected.length >= 2}
          batchProgress={batchProgress}
          twoPiece={twoPiece}
          onTwoPieceChange={handleTwoPieceChange}
          fitAdjustment={fitAdjustment}
          onFitAdjustmentChange={handleFitAdjustmentChange}
          lengthAdjustment={lengthAdjustment}
          onLengthAdjustmentChange={handleLengthAdjustmentChange}
          pantsAdjustments={selectedModelIsPants}
          analysisReview={twoPiece ? null : analysisReview}
          onAnalysisReviewChange={twoPiece ? undefined : handleAnalysisReviewChange}
        />

        <OutputPanel
          current={currentRun}
          history={history}
          onSelectHistory={setCurrentId}
          onQualityControl={runQualityControl}
          uploadNames={uploadNames}
          onClearHistory={() => {
            setHistory([]);
            setCurrentId(null);
          }}
        />
      </div>

      {/* Error toast */}
      {error && (
        <div className="fixed bottom-6 right-6 max-w-sm whitespace-pre-line rounded-lg bg-red-600 px-4 py-3 text-sm text-white shadow-lg">
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
