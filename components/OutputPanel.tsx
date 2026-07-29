"use client";

import { useEffect, useRef, useState } from "react";
import type { HistoryItem } from "./types";
import ImageLightbox, { ZoomButton } from "./ImageLightbox";
import { FEEDBACK_ISSUES, type FeedbackIssueKey } from "@/lib/feedback-memory";

type FitRepairMode =
  | "all"
  | "silhouette"
  | "upload-reference"
  | "length-shorter"
  | "length-longer"
  | "length-much-shorter"
  | "length-much-longer"
  | "more-oversized"
  | "more-fitted";

type QcMode =
  | "restore-face"
  | "proportion-natural"
  | "head-smaller"
  | "head-larger"
  | "fit"
  | "more-oversized"
  | "more-fitted"
  | "length-shorter"
  | "length-longer"
  | "match-original"
  | "different-pose";

type PhotoshootView = "front" | "side" | "back" | "full";

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
  onAbPreferenceSelect?: (params: {
    generationId: string;
    selectedImage: "left" | "right" | "no_preference";
    promptUsed: string;
  }) => Promise<void> | void;
  /**
   * Optional: persist the user's pick from a 3-up Studio 1 multi-option run.
   * Index is 0/1/2 — corresponds to the position in current.imageUrls.
   */
  onMultiOptionSelect?: (params: {
    generationId: string;
    view?: PhotoshootView;
    selectedIndex: 0 | 1 | 2;
  }) => Promise<void> | void;
  onFeedbackRegenerate?: (params: {
    sourceUrl: string | null;
    resultUrl: string;
    prompt: string;
    feedback: string;
    issueKeys?: FeedbackIssueKey[];
    generationId?: string;
    resultIndex?: number;
    markupDataUrl?: string | null;
  }) => void;
  onQualityControl?: (params: {
    action: "restore-face" | "retry-closer" | "different-pose" | "restore-proportion";
    fitMode?: FitRepairMode;
    fitModes?: FitRepairMode[];
    proportionMode?: "head-smaller" | "head-larger" | "natural-proportion";
    fitReferenceUrl?: string;
    repairNote?: string;
    prompt: string;
    sourceUrl: string | null;
    resultUrl: string | null;
  }) => void;
  onCompletePhotoshootSet?: (params: {
    sourceUrl: string;
    basePrompt: string;
    approvedImageUrl: string;
    approvedView: PhotoshootView;
    views: PhotoshootView[];
    backReferenceUrl?: string;
  }) => void;
  onRegeneratePhotoshootView?: (params: {
    index: number;
    view: PhotoshootView;
    prompt: string;
    sourceUrl: string | null;
  }) => void;
  onRetryMultiModelView?: (params: { view: PhotoshootView }) => void;
  onRetryFailedMultiModelViews?: () => void;
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
  onAbPreferenceSelect,
  onMultiOptionSelect,
  onFeedbackRegenerate,
  onQualityControl,
  onCompletePhotoshootSet,
  onRegeneratePhotoshootView,
  onRetryMultiModelView,
  onRetryFailedMultiModelViews,
  uploadNames,
}: Props) {
  const [index, setIndex] = useState(0);
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);
  const [promptOpen, setPromptOpen] = useState(false);
  const [qcDrawerOpen, setQcDrawerOpen] = useState(false);
  const [compareOpen, setCompareOpen] = useState(false);
  const [feedbackText, setFeedbackText] = useState("");
  const [selectedFeedbackIssues, setSelectedFeedbackIssues] = useState<FeedbackIssueKey[]>([]);
  const [hasCompareMarks, setHasCompareMarks] = useState(false);
  const [selectedQcModes, setSelectedQcModes] = useState<QcMode[]>(["fit"]);
  const [previewHeight, setPreviewHeight] = useState(560);
  const [fitReferenceUploading, setFitReferenceUploading] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [libraryStyleNumber, setLibraryStyleNumber] = useState("");
  const [libraryColor, setLibraryColor] = useState("");
  const [libraryViewLabel, setLibraryViewLabel] = useState("front");
  const [libraryStatus, setLibraryStatus] = useState<string | null>(null);
  const [libraryUploading, setLibraryUploading] = useState(false);
  const [abSaving, setAbSaving] = useState(false);
  const [abStatus, setAbStatus] = useState<string | null>(null);
  const [repairNote, setRepairNote] = useState("");
  const [strongerRepair, setStrongerRepair] = useState(false);
  const [backReferenceUrl, setBackReferenceUrl] = useState<string | null>(null);
  const [backReferenceUploading, setBackReferenceUploading] = useState(false);
  // Active tab for multiOption (trio) runs — controls which view's 3 variants
  // the 3-up grid displays. Resets to "front" whenever the run changes.
  const [activeView, setActiveView] = useState<PhotoshootView>("front");
  const fitReferenceInputRef = useRef<HTMLInputElement | null>(null);
  const backReferenceInputRef = useRef<HTMLInputElement | null>(null);
  const compareCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const compareDrawingRef = useRef(false);
  const previewResizeRef = useRef<{ startY: number; height: number } | null>(null);

  // Whenever the current run changes (e.g. new generation, clicked a different
  // history item), reset the gallery to image 0 so we never show a stale
  // out-of-range index left over from a previous multi-variant run.
  useEffect(() => {
    setIndex(0);
    setActiveView("front");
    setQcDrawerOpen(false);
    setSelectedQcModes(["fit"]);
    setLibraryOpen(false);
    setLibraryStatus(null);
    setAbSaving(false);
    setAbStatus(null);
    setRepairNote("");
    setCompareOpen(false);
    setFeedbackText("");
    setSelectedFeedbackIssues([]);
    setHasCompareMarks(false);
    setStrongerRepair(false);
    setLibraryStyleNumber(current?.styleNumber || "");
    setBackReferenceUrl(null);
  }, [current?.id]);

  useEffect(() => {
    function handleMove(event: PointerEvent) {
      const drag = previewResizeRef.current;
      if (!drag) return;
      const nextHeight = drag.height + event.clientY - drag.startY;
      setPreviewHeight(Math.min(720, Math.max(180, nextHeight)));
    }

    function handleUp() {
      previewResizeRef.current = null;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    }

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };
  }, []);

  function beginPreviewResize(event: React.PointerEvent<HTMLButtonElement>) {
    previewResizeRef.current = {
      startY: event.clientY,
      height: previewHeight,
    };
    document.body.style.cursor = "row-resize";
    document.body.style.userSelect = "none";
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function clearCompareMarks() {
    const canvas = compareCanvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasCompareMarks(false);
  }

  function drawCompareMark(event: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = compareCanvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || !compareDrawingRef.current) return;
    const rect = canvas.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * canvas.width;
    const y = ((event.clientY - rect.top) / rect.height) * canvas.height;
    ctx.lineWidth = 10;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "rgba(220, 38, 38, 0.9)";
    ctx.lineTo(x, y);
    ctx.stroke();
    setHasCompareMarks(true);
  }

  function beginCompareMark(event: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = compareCanvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    compareDrawingRef.current = true;
    canvas.setPointerCapture(event.pointerId);
    const rect = canvas.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * canvas.width;
    const y = ((event.clientY - rect.top) / rect.height) * canvas.height;
    ctx.beginPath();
    ctx.moveTo(x, y);
    drawCompareMark(event);
  }

  function endCompareMark() {
    compareDrawingRef.current = false;
  }

  function submitFeedbackRegeneration() {
    if (!onFeedbackRegenerate || !active) return;
    const feedback = feedbackText.trim();
    if (!feedback && !selectedFeedbackIssues.length) return;
    onFeedbackRegenerate({
      sourceUrl: activeSource,
      resultUrl: active,
      prompt: activePrompt,
      feedback,
      issueKeys: selectedFeedbackIssues,
      generationId: current?.id,
      resultIndex: safeIndex,
      markupDataUrl: hasCompareMarks ? compareCanvasRef.current?.toDataURL("image/png") ?? null : null,
    });
  }

  function toggleFeedbackIssue(issueKey: FeedbackIssueKey) {
    setSelectedFeedbackIssues((currentIssues) =>
      currentIssues.includes(issueKey)
        ? currentIssues.filter((key) => key !== issueKey)
        : [...currentIssues, issueKey]
    );
  }

  async function selectAbPreference(selectedImage: "left" | "right" | "no_preference") {
    if (!current?.abTest || !onAbPreferenceSelect) return;
    setAbSaving(true);
    setAbStatus(null);
    try {
      await onAbPreferenceSelect({
        generationId: current.id,
        selectedImage,
        promptUsed: current.prompt,
      });
      setAbStatus("Preference saved");
    } catch (err: any) {
      setAbStatus(err?.message || "Preference save failed");
    } finally {
      setAbSaving(false);
    }
  }

  async function selectMultiOption(selectedIndex: 0 | 1 | 2, view: PhotoshootView = activeView) {
    if (!current?.multiOption || !onMultiOptionSelect) return;
    try {
      await onMultiOptionSelect({
        generationId: current.id,
        view,
        selectedIndex,
      });
    } catch (err: any) {
      // Non-fatal — picker UI just won't reflect the favorite. Surface a
      // gentle warning via the existing AB status channel for visibility.
      setAbStatus(err?.message || "Could not save favorite");
    }
  }

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
  const photoshootEnabled = Boolean(onCompletePhotoshootSet);
  const activeViewLabel = photoshootEnabled
    ? (current?.viewLabels?.[safeIndex] || current?.view || "").toLowerCase()
    : "";
  const activePhotoshootView = ["front", "side", "back", "full"].includes(activeViewLabel)
    ? (activeViewLabel as PhotoshootView)
    : null;
  const photoshootViews: PhotoshootView[] = ["front", "side", "back", "full"];
  const photoshootViewLabel: Record<PhotoshootView, string> = {
    front: "Front",
    side: "Side",
    back: "Back",
    full: "Full",
  };
  type PhotoshootSlot = {
    url: string;
    index: number;
    viewIndex: 0 | 1 | 2;
    prompt: string;
    sourceUrl: string | null;
  };
  const photoshootGroups: Record<PhotoshootView, PhotoshootSlot[]> = {
    front: [],
    side: [],
    back: [],
    full: [],
  };
  const viewImageMap = new Map<
    PhotoshootView,
    { url: string; index: number; prompt: string; sourceUrl: string | null }
  >();
  if (current) {
    const labels = current.viewLabels?.length
      ? current.viewLabels
      : current.view
      ? current.imageUrls.map(() => current.view as string)
      : [];
    current.imageUrls.forEach((_, imageIndex) => {
      const normalized = labels[imageIndex]?.toLowerCase();
      if (!normalized || !photoshootViews.includes(normalized as PhotoshootView)) return;
      const view = normalized as PhotoshootView;
      const viewIndex = Math.min(photoshootGroups[view].length, 2) as 0 | 1 | 2;
      photoshootGroups[view].push({
        url: current.imageUrls[imageIndex],
        index: imageIndex,
        viewIndex,
        prompt: current.prompts?.[imageIndex] ?? current.prompt ?? "",
        sourceUrl: current.batch
          ? current.referenceUrls?.[imageIndex] ?? current.referenceUrls?.[0] ?? null
          : current.referenceUrls?.[0] ?? null,
      });
    });

    for (const view of photoshootViews) {
      const indices = photoshootGroups[view];
      if (!indices.length) continue;
      const pickIdx =
        current.multiOption?.picksByView?.[view] ??
        (view === "front" ? current.multiOption?.selectedIndex : undefined) ??
        0;
      const chosenSlot = indices[pickIdx] ?? indices[0];
      viewImageMap.set(view, {
        url: chosenSlot.url,
        index: chosenSlot.index,
        prompt: chosenSlot.prompt,
        sourceUrl: chosenSlot.sourceUrl,
      });
    }
  }
  const photoshootSeedSlot =
    viewImageMap.get("front") ?? [...viewImageMap.values()][0] ?? null;
  const photoshootSeedView =
    ([...viewImageMap.entries()].find(([, slot]) => slot === photoshootSeedSlot)?.[0] ||
      (activePhotoshootView ?? "front")) as PhotoshootView;
  const photoshootSeedImageUrl = photoshootSeedSlot?.url ?? active;
  const photoshootSeedPrompt = photoshootSeedSlot?.prompt ?? activePrompt;
  const photoshootSeedSource = photoshootSeedSlot?.sourceUrl ?? activeSource;
  const completedViews = new Set<PhotoshootView>(
    photoshootViews.filter((view) => photoshootGroups[view].length >= 3)
  );
  const missingViews = photoshootViews.filter((view) => !completedViews.has(view));
  const isMultiModelSet =
    (Boolean(current?.multiModelViews) || Boolean(current?.viewLabels?.length)) &&
    !current?.multiOption &&
    !current?.batch &&
    (Boolean(current?.multiModelViews) ||
      photoshootViews.every((view) =>
        current?.viewLabels?.some((label) => label.toLowerCase() === view)
      ));
  const failedMultiModelViews = isMultiModelSet
    ? photoshootViews.filter((view) => current?.multiModelViews?.[view]?.status === "failed")
    : [];
  const lightboxGalleryImages =
    previewSrc && current?.multiOption && current.imageUrls.length > 1
      ? current.imageUrls
      : previewSrc && current?.abTest && current.imageUrls.length > 1
      ? current.imageUrls
      : previewSrc && isMultiModelSet && current && current.imageUrls.length > 1
      ? current.imageUrls
      : undefined;
  const lightboxGalleryLabels =
    current?.multiOption
      ? ["Variant A", "Variant B", "Variant C"]
      : current?.abTest
      ? ["Variant A", "Variant B"]
      : isMultiModelSet && current?.viewLabels?.length
      ? current.viewLabels.map((label) => {
          const normalized = label.toLowerCase() as PhotoshootView;
          return photoshootViewLabel[normalized] || label;
        })
      : undefined;
  const variantLabels = ["Variant A", "Variant B", "Variant C"];
  const selectedMultiOptionIndex =
    current?.multiOption?.picksByView?.front ??
    current?.multiOption?.selectedIndex ??
    0;
  const qcPrimaryOptions: Array<[QcMode, string]> = [
    ["fit", "Fit"],
    ["restore-face", "Face"],
    ["proportion-natural", "Proportion"],
    ["match-original", "Match"],
    ["different-pose", "Pose"],
  ];
  const qcFitOptions: Array<[QcMode, string]> = [
    ["more-oversized", "More oversized"],
    ["more-fitted", "More fitted"],
    ["length-longer", "Longer"],
    ["length-shorter", "Shorter"],
  ];
  const qcProportionOptions: Array<[QcMode, string]> = [
    ["head-smaller", "Head smaller"],
    ["head-larger", "Head larger"],
  ];
  const showFitControls = selectedQcModes.some((mode) =>
    ["fit", "match-original", "more-oversized", "more-fitted", "length-longer", "length-shorter"].includes(mode)
  );
  const showProportionControls = selectedQcModes.some((mode) =>
    ["proportion-natural", "head-smaller", "head-larger"].includes(mode)
  );

  function toggleQcMode(mode: QcMode) {
    setSelectedQcModes((current) => {
      const exclusiveGroups: QcMode[][] = [
        ["proportion-natural", "head-smaller", "head-larger"],
        ["more-oversized", "more-fitted"],
        ["length-shorter", "length-longer"],
      ];
      const withoutConflicts = current.filter((item) => {
        const group = exclusiveGroups.find((candidate) => candidate.includes(mode));
        return !group || !group.includes(item);
      });
      if (current.includes(mode)) return current.filter((item) => item !== mode);
      return [...withoutConflicts, mode];
    });
  }

  function repairNoteWithGuidance() {
    const modeLabels: Record<QcMode, string> = {
      "restore-face": "restore the selected model's face and identity",
      "proportion-natural": "restore realistic overall body proportions",
      "head-smaller": "make the head and face slightly smaller",
      "head-larger": "make the head and face slightly larger",
      fit: "repair the garment fit",
      "more-oversized": "make the garment more oversized",
      "more-fitted": "make the garment more fitted",
      "length-shorter": "make the garment slightly shorter",
      "length-longer": "make the garment slightly longer",
      "match-original": "match the original garment reference more closely",
      "different-pose": "create a subtle neighboring pose variation",
    };
    return [
      selectedQcModes.length
        ? `Guided repair selections: ${selectedQcModes.map((mode) => modeLabels[mode]).join(", ")}.`
        : "",
      "Preserve the selected result's model identity, pose family, camera angle, lighting, background, garment fabric, seams, trims, stitching, hardware, graphics, and material behavior unless the repair specifically requires a tiny localized adjustment.",
      strongerRepair
        ? "Use a strong visible correction while still keeping the edit natural and commercially usable."
        : selectedQcModes.some((mode) => ["more-oversized", "more-fitted", "length-shorter", "length-longer"].includes(mode))
        ? "Use a clear visible correction, not a barely perceptible one, while still keeping the edit natural and commercially usable."
        : "Use a subtle natural correction.",
      repairNote.trim(),
    ]
      .filter(Boolean)
      .join(" ");
  }

  function fitModesFromQc(): FitRepairMode[] {
    const modes: FitRepairMode[] = [];
    if (selectedQcModes.includes("more-oversized")) modes.push("more-oversized");
    if (selectedQcModes.includes("more-fitted")) modes.push("more-fitted");
    if (selectedQcModes.includes("length-shorter")) modes.push("length-shorter");
    if (selectedQcModes.includes("length-longer")) modes.push("length-longer");
    if (selectedQcModes.includes("match-original")) modes.push("all");
    return modes.length ? modes : ["all"];
  }

  function applyGuidedRepair() {
    if (!onQualityControl || !activePrompt || selectedQcModes.length === 0) return;
    const note = repairNoteWithGuidance();
    const first = selectedQcModes[0];

    if (first === "restore-face") {
      onQualityControl({
        action: "restore-face",
        repairNote: note,
        prompt: activePrompt,
        sourceUrl: activeSource,
        resultUrl: active,
      });
      return;
    }

    if (["proportion-natural", "head-smaller", "head-larger"].includes(first)) {
      const proportionMode =
        first === "head-smaller"
          ? "head-smaller"
          : first === "head-larger"
          ? "head-larger"
          : "natural-proportion";
      onQualityControl({
        action: "restore-proportion",
        proportionMode,
        repairNote: note,
        prompt: activePrompt,
        sourceUrl: activeSource,
        resultUrl: active,
      });
      return;
    }

    if (first === "different-pose") {
      onQualityControl({
        action: "different-pose",
        repairNote: note,
        prompt: activePrompt,
        sourceUrl: activeSource,
        resultUrl: active,
      });
      return;
    }

    onQualityControl({
      action: "retry-closer",
      fitModes: fitModesFromQc(),
      repairNote: note,
      prompt: activePrompt,
      sourceUrl: activeSource,
      resultUrl: active,
    });
  }

  async function uploadFitReference(file: File) {
    if (!onQualityControl || !activePrompt) return;
    setFitReferenceUploading(true);
    try {
      const form = new FormData();
      form.append("files", file);
      const res = await fetch("/api/upload", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok || !data?.ok || !data.uploads?.[0]?.url) {
        throw new Error(data?.error || "Fit reference upload failed");
      }
      onQualityControl({
        action: "retry-closer",
        fitMode: "upload-reference",
        fitReferenceUrl: data.uploads[0].url,
        repairNote: repairNoteWithGuidance(),
        prompt: activePrompt,
        sourceUrl: activeSource,
        resultUrl: active,
      });
    } catch (err: any) {
      alert(err?.message || "Fit reference upload failed");
    } finally {
      setFitReferenceUploading(false);
      if (fitReferenceInputRef.current) fitReferenceInputRef.current.value = "";
    }
  }

  async function uploadBackReference(file: File): Promise<string | null> {
    setBackReferenceUploading(true);
    try {
      const form = new FormData();
      form.append("files", file);
      const res = await fetch("/api/upload", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok || !data?.ok || !data.uploads?.[0]?.url) {
        throw new Error(data?.error || "Back view upload failed");
      }
      setBackReferenceUrl(data.uploads[0].url);
      return data.uploads[0].url;
    } catch (err: any) {
      alert(err?.message || "Back view upload failed");
      return null;
    } finally {
      setBackReferenceUploading(false);
      if (backReferenceInputRef.current) backReferenceInputRef.current.value = "";
    }
  }

  function generatePhotoshootViews(views: PhotoshootView[], backReferenceOverride?: string | null) {
    if (
      !onCompletePhotoshootSet ||
      !photoshootSeedSource ||
      !photoshootSeedPrompt ||
      !photoshootSeedImageUrl
    ) {
      return;
    }
    const uniqueViews = Array.from(new Set(views)).filter((view) => {
      if (completedViews.has(view)) return false;
      return true;
    });
    if (!uniqueViews.length) return;
    onCompletePhotoshootSet({
      sourceUrl: photoshootSeedSource,
      basePrompt: photoshootSeedPrompt,
      approvedImageUrl: photoshootSeedImageUrl,
      approvedView: photoshootSeedView,
      views: uniqueViews,
      backReferenceUrl: backReferenceOverride || backReferenceUrl || undefined,
    });
  }

  async function uploadActiveToLibrary() {
    if (!active) return;
    setLibraryUploading(true);
    setLibraryStatus("Uploading to team library...");
    try {
      const res = await fetch("/api/library", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          styleNumber: libraryStyleNumber,
          color: libraryColor,
          viewLabel: libraryViewLabel,
          imageUrl: active,
          prompt: activePrompt,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Library upload failed");
      setLibraryStatus(`Saved ${data.style.styleNumber} to the team library.`);
    } catch (err: any) {
      setLibraryStatus(err?.message || "Library upload failed");
    } finally {
      setLibraryUploading(false);
    }
  }

  /**
   * Derive a filename for the result at `resultIndex`. Prefers the original
   * upload's filename (batch runs → per-slot source, non-batch runs →
   * first reference). Falls back to the timestamp pattern when no mapping
   * exists (e.g. user cleared their uploads between generating and
   * downloading, or the OutputPanel is mounted without the map).
   *
   * Guarantees a file extension — strips whatever the upload had and appends
   * the generated output format when known. Older runs fall back to the URL
   * extension and then `.png`.
   * Handles multi-output runs (batch or multi-variant) by suffixing the
   * result index so no two files in the same run clobber each other.
   */
  function outputExtension(resultIndex: number): "jpg" | "png" | "webp" {
    const format = current?.format?.toLowerCase();
    if (format === "jpeg" || format === "jpg") return "jpg";
    if (format === "webp") return "webp";
    if (format === "png") return "png";

    const imageUrl = current?.imageUrls?.[resultIndex] || "";
    const path = imageUrl.split("?")[0]?.toLowerCase() || "";
    if (/\.(jpe?g)$/.test(path)) return "jpg";
    if (/\.webp$/.test(path)) return "webp";
    return "png";
  }

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
    return `${stem}${suffix}.${outputExtension(resultIndex)}`;
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
    <aside className="flex w-full shrink-0 flex-col overflow-y-auto border-t border-neutral-200 bg-white lg:h-full lg:border-l lg:border-t-0">
      <div className="flex items-center justify-between border-b border-neutral-200 px-5 py-4">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            {current ? `Run #${current.id.slice(0, 4)}` : "No runs yet"}
            {current?.batch && (
              <span className="rounded-full bg-indigo-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-indigo-700">
                {current.viewLabels?.length ? "Set" : "Batch"}
              </span>
            )}
            {activeViewLabel && (
              <span className="rounded-full bg-neutral-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-neutral-600">
                {activeViewLabel}
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
        <div className="shrink-0 border-b border-neutral-100 px-5 py-3">
          <div className="flex items-center gap-2 overflow-x-auto">
            {current.imageUrls.map((u, i) => (
              <div
                key={u}
                className={`group relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border ${
                  i === safeIndex ? "border-brand-500 ring-2 ring-brand-200" : "border-neutral-200"
                }`}
              >
                <button
                  onClick={() => {
                    setIndex(i);
                  }}
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
                {onRegeneratePhotoshootView && current.viewLabels?.[i] && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      const view = current.viewLabels?.[i]?.toLowerCase();
                      if (!view || !["front", "side", "back", "full"].includes(view)) return;
                      onRegeneratePhotoshootView({
                        index: i,
                        view: view as PhotoshootView,
                        prompt: current.prompts?.[i] || current.prompt,
                        sourceUrl: current.referenceUrls?.[i] || current.referenceUrls?.[0] || null,
                      });
                    }}
                    title={`Redo ${current.viewLabels[i]} view`}
                    className="absolute bottom-1 left-1 rounded bg-white/90 px-1.5 py-0.5 text-[9px] font-semibold text-neutral-800 opacity-0 shadow-sm transition hover:bg-white group-hover:opacity-100"
                  >
                    Redo
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div
        className="flex shrink-0 items-center justify-center overflow-hidden bg-neutral-50 p-5"
        style={{ height: `${previewHeight}px` }}
      >
        {current?.multiOption && !photoshootEnabled ? (
          <div className="variant-grid grid h-full w-full min-h-0 gap-4 md:grid-cols-3">
            {[0, 1, 2].map((slotIndex) => {
              const url = current.imageUrls[slotIndex];
              const selected = selectedMultiOptionIndex === slotIndex;
              const label = variantLabels[slotIndex] || `Variant ${slotIndex + 1}`;

              if (!url) {
                return (
                  <div
                    key={`pending-variant-${slotIndex}`}
                    className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-dashed border-neutral-200 bg-white p-3"
                  >
                    <div className="flex items-center justify-between pb-3">
                      <span className="text-sm font-semibold text-neutral-400">{label}</span>
                      <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-[10px] font-semibold text-neutral-400">
                        Pending
                      </span>
                    </div>
                    <div className="flex min-h-0 flex-1 items-center justify-center rounded-lg bg-neutral-50 text-xs text-neutral-400">
                      Generating...
                    </div>
                  </div>
                );
              }

              return (
                <div
                  key={url}
                  onDoubleClick={() => selectMultiOption(slotIndex as 0 | 1 | 2, "front")}
                  className={`group relative flex min-h-0 flex-col overflow-hidden rounded-xl border bg-white p-3 text-left shadow-sm transition hover:shadow-md ${
                    selected ? "border-brand-500 ring-2 ring-brand-100" : "border-neutral-200"
                  }`}
                >
                  <div className="flex items-center justify-between pb-3">
                    <span className="text-sm font-semibold text-neutral-900">{label}</span>
                    {selected ? (
                      <span className="rounded-full bg-brand-100 px-3 py-1 text-xs font-semibold text-brand-700">
                        ★ Picked
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          selectMultiOption(slotIndex as 0 | 1 | 2, "front");
                          setIndex(slotIndex);
                        }}
                        className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-semibold text-neutral-500 transition hover:bg-brand-50 hover:text-brand-700"
                      >
                        ☆ Pick
                      </button>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setIndex(slotIndex);
                      setPreviewSrc(url);
                    }}
                    title="Click to preview at full size"
                    className="flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-lg bg-neutral-50"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={url}
                      alt={label}
                      className="max-h-full max-w-full cursor-zoom-in object-contain"
                    />
                  </button>
                </div>
              );
            })}
          </div>
        ) : current?.multiOption && photoshootEnabled ? (
          <div className="flex h-full w-full min-h-0 flex-col gap-3">
            <input
              ref={backReferenceInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={async (event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                const uploadedUrl = await uploadBackReference(file);
                if (uploadedUrl) generatePhotoshootViews(["back"], uploadedUrl);
              }}
            />
            <div className="flex shrink-0 items-center gap-2 overflow-x-auto rounded-xl border border-neutral-200 bg-white p-2">
              {photoshootViews.map((view) => {
                const done = completedViews.has(view);
                const active = activeView === view;
                return (
                  <button
                    key={view}
                    type="button"
                    onClick={() => setActiveView(view)}
                    className={`shrink-0 rounded-lg border px-3 py-2 text-xs font-semibold transition ${
                      active
                        ? "border-neutral-900 bg-neutral-900 text-white"
                        : done
                        ? "border-emerald-100 bg-emerald-50 text-emerald-700 hover:border-emerald-200"
                        : "border-neutral-200 bg-neutral-50 text-neutral-600 hover:border-neutral-300 hover:bg-white"
                    }`}
                  >
                    {photoshootViewLabel[view]} {done ? "✓" : "○"}
                  </button>
                );
              })}
            </div>

            {photoshootGroups[activeView].length > 0 ? (
              <div className="variant-grid grid min-h-0 flex-1 gap-3 md:grid-cols-3">
                {[0, 1, 2].map((slotIndex) => {
                  const slot = photoshootGroups[activeView][slotIndex];
                  const variantLabel = variantLabels[slotIndex] || `Variant ${slotIndex + 1}`;
                  const selected =
                    current.multiOption?.picksByView?.[activeView] === slotIndex ||
                    (activeView === "front" &&
                      !current.multiOption?.picksByView?.front &&
                      current.multiOption?.selectedIndex === slotIndex);

                  if (!slot) {
                    return (
                      <div
                        key={`pending-${activeView}-${slotIndex}`}
                        className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-dashed border-neutral-200 bg-white p-2"
                      >
                        <div className="flex items-center justify-between px-1 pb-2">
                          <span className="text-xs font-semibold text-neutral-400">
                            {variantLabel}
                          </span>
                          <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-semibold text-neutral-400">
                            Pending
                          </span>
                        </div>
                        <div className="flex min-h-0 flex-1 items-center justify-center rounded-lg bg-neutral-50 text-[11px] text-neutral-400">
                          Generate to fill
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div
                      key={slot.url}
                      onDoubleClick={() => selectMultiOption(slotIndex as 0 | 1 | 2, activeView)}
                      className={`group relative flex min-h-0 flex-col overflow-hidden rounded-xl border bg-white p-2 text-left shadow-sm transition hover:shadow-md ${
                        selected ? "border-amber-500 ring-2 ring-amber-100" : "border-neutral-200"
                      }`}
                    >
                      <div className="flex items-center justify-between px-1 pb-2">
                        <span className="text-xs font-semibold text-neutral-800">
                          {variantLabel}
                        </span>
                        {selected ? (
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                            ★ Picked
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              selectMultiOption(slotIndex as 0 | 1 | 2, activeView);
                              setIndex(slot.index);
                            }}
                            className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-semibold text-neutral-500 hover:bg-amber-50 hover:text-amber-700"
                          >
                            Pick
                          </button>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setIndex(slot.index);
                          setPreviewSrc(slot.url);
                        }}
                        className="flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-lg bg-neutral-50"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={slot.url}
                          alt={`${photoshootViewLabel[activeView]} ${variantLabel}`}
                          className="max-h-full max-w-full object-contain"
                        />
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex min-h-0 flex-1 items-center justify-center rounded-2xl border border-dashed border-neutral-200 bg-white p-6 text-center">
                <div className="max-w-sm">
                  <p className="text-sm font-semibold text-neutral-900">
                    Generate 3 {activeView} variants
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-neutral-500">
                    {activeView === "back"
                      ? "Upload the real back view first when the garment has back artwork, pockets, embroidery, wash, or construction details."
                      : `Create three ${photoshootViewLabel[activeView].toLowerCase()} options using the picked front result as continuity.`}
                  </p>
                  {activeView === "back" ? (
                    <div className="mt-4 grid gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          backReferenceUrl
                            ? generatePhotoshootViews(["back"])
                            : backReferenceInputRef.current?.click()
                        }
                        disabled={backReferenceUploading}
                        className="rounded-xl bg-neutral-900 px-4 py-3 text-xs font-semibold text-white transition hover:bg-neutral-800 disabled:bg-neutral-300"
                      >
                        {backReferenceUploading
                          ? "Uploading..."
                          : backReferenceUrl
                          ? "Generate 3 back variants"
                          : "Upload back reference + Generate"}
                      </button>
                      {backReferenceUrl && (
                        <button
                          type="button"
                          onClick={() => setBackReferenceUrl(null)}
                          className="rounded-xl border border-neutral-200 bg-white px-4 py-2 text-xs font-semibold text-neutral-500 hover:bg-neutral-50"
                        >
                          Remove uploaded back reference
                        </button>
                      )}
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => generatePhotoshootViews([activeView])}
                      className="mt-4 rounded-xl bg-neutral-900 px-4 py-3 text-xs font-semibold text-white transition hover:bg-neutral-800"
                    >
                      Generate 3 {activeView} variants
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        ) : current?.abTest && current.imageUrls.length >= 2 ? (
          <div className="grid h-full w-full gap-4 md:grid-cols-2">
            {current.imageUrls.slice(0, 2).map((url, imageIndex) => {
              const side = imageIndex === 0 ? "left" : "right";
              const selected = current.abTest?.selectedImage === side;
              return (
                <button
                  key={url}
                  type="button"
                  onClick={() => {
                    setIndex(imageIndex);
                    setPreviewSrc(url);
                  }}
                  className={`group relative flex min-h-0 flex-col overflow-hidden rounded-xl border bg-white p-2 text-left shadow-sm transition hover:shadow-md ${
                    selected ? "border-brand-500 ring-2 ring-brand-100" : "border-neutral-200"
                  }`}
                >
                  <div className="flex items-center justify-between px-1 pb-2">
                    <span className="text-xs font-semibold text-neutral-800">
                      {imageIndex === 0 ? "Left · Image A" : "Right · Image B"}
                    </span>
                    <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-semibold text-neutral-500">
                      {imageIndex === 0 ? "Current" : "V1.7 test"}
                    </span>
                  </div>
                  <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-xl bg-neutral-50">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={url}
                      alt={imageIndex === 0 ? "Image A current prompt" : "Image B V1.7 prompt"}
                      className="max-h-full max-w-full object-contain"
                    />
                  </div>
                </button>
              );
            })}
          </div>
        ) : isMultiModelSet && current ? (
          <div className="flex h-full w-full min-h-0 flex-col gap-3">
            {failedMultiModelViews.length > 1 && onRetryFailedMultiModelViews && (
              <div className="flex items-center justify-between rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                <span>
                  {failedMultiModelViews.length} views need a retry. Completed views stay saved.
                </span>
                <button
                  type="button"
                  onClick={onRetryFailedMultiModelViews}
                  className="rounded-full bg-red-600 px-3 py-1 font-semibold text-white transition hover:bg-red-700"
                >
                  Retry failed only
                </button>
              </div>
            )}
          <div className="grid h-full w-full min-h-0 gap-4 md:grid-cols-2">
            {photoshootViews.map((view) => {
              const slot = current.multiModelViews?.[view];
              const legacyIndex = current.viewLabels?.findIndex(
                (label) => label.toLowerCase() === view
              );
              const url =
                slot?.url ||
                (typeof legacyIndex === "number" && legacyIndex >= 0
                  ? current.imageUrls[legacyIndex]
                  : null);
              const imageIndex = url ? current.imageUrls.indexOf(url) : legacyIndex;
              const status = slot?.status || (url ? "done" : "generating");
              const failed = status === "failed";
              return (
                <button
                  key={view}
                  type="button"
                  disabled={!url && !(failed && onRetryMultiModelView)}
                  onClick={() => {
                    if (failed && !url && onRetryMultiModelView) {
                      onRetryMultiModelView({ view });
                      return;
                    }
                    if (!url || imageIndex == null || imageIndex < 0) return;
                    setIndex(imageIndex);
                    setPreviewSrc(url);
                  }}
                  className={`group flex min-h-0 flex-col overflow-hidden rounded-xl border bg-white p-2 text-left shadow-sm transition ${
                    url
                      ? "border-neutral-200 hover:shadow-md"
                      : failed
                      ? "border-red-200 bg-red-50 text-red-700"
                      : "border-dashed border-neutral-200 text-neutral-400"
                  }`}
                >
                  <div className="flex items-center justify-between px-1 pb-2">
                    <span className="text-xs font-semibold text-neutral-800">
                      {photoshootViewLabel[view]}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                        url
                          ? "bg-emerald-50 text-emerald-700"
                          : failed
                          ? "bg-red-100 text-red-700"
                          : status === "analyzing"
                          ? "bg-blue-50 text-blue-700"
                          : "bg-neutral-100 text-neutral-500"
                      }`}
                    >
                      {url
                        ? "Done"
                        : failed
                        ? "Retry needed"
                        : status === "analyzing"
                        ? "Analyzing"
                        : status === "queued"
                        ? "Queued"
                        : "Generating"}
                    </span>
                  </div>
                  <div
                    className={`flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-lg ${
                      url
                        ? "bg-neutral-50"
                        : failed
                        ? "bg-red-50"
                        : "animate-pulse bg-neutral-100"
                    }`}
                  >
                    {url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={url}
                        alt={`${photoshootViewLabel[view]} view`}
                        className="max-h-full max-w-full object-contain"
                      />
                    ) : failed ? (
                      <div className="px-4 text-center">
                        <p className="text-xs font-semibold text-red-700">This view did not finish.</p>
                        <p className="mt-1 text-[11px] leading-relaxed text-red-600">
                          Completed views were saved.
                        </p>
                        {onRetryMultiModelView && (
                          <span className="mt-3 inline-flex rounded-full bg-red-600 px-3 py-1 text-[11px] font-semibold text-white">
                            Retry {photoshootViewLabel[view]} only
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-neutral-400" style={{ animationPlayState: "paused" }}>
                        {status === "queued" ? "Waiting..." : "Generating..."}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
          </div>
        ) : active ? (
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
      <button
        type="button"
        aria-label="Resize result preview"
        onPointerDown={beginPreviewResize}
        className="group flex h-3 shrink-0 cursor-row-resize items-center justify-center border-y border-neutral-200 bg-white transition hover:bg-neutral-50"
      >
        <span className="h-0.5 w-10 rounded-full bg-neutral-300 transition group-hover:bg-neutral-500" />
      </button>

      {current && (
        <div className="border-t border-neutral-200 px-5 py-3">
          {current.abTest && onAbPreferenceSelect && (
            <div className="mb-3 rounded-xl border border-neutral-200 bg-white p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-neutral-500">
                    V1.7 A/B test
                  </p>
                  <p className="mt-0.5 text-sm font-semibold text-neutral-900">
                    Which image do you prefer? (Left / Right)
                  </p>
                </div>
                {current.abTest.selectedImage && (
                  <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold text-emerald-700">
                    Saved
                  </span>
                )}
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2">
                {[
                  ["left", "Left"],
                  ["right", "Right"],
                  ["no_preference", "No preference"],
                ].map(([value, label]) => {
                  const activeChoice = current.abTest?.selectedImage === value;
                  return (
                    <button
                      key={value}
                      type="button"
                      onClick={() =>
                        selectAbPreference(value as "left" | "right" | "no_preference")
                      }
                      disabled={abSaving}
                      className={`rounded-xl border px-3 py-2 text-xs font-semibold transition disabled:opacity-60 ${
                        activeChoice
                          ? "border-neutral-900 bg-neutral-900 text-white"
                          : "border-neutral-200 bg-neutral-50 text-neutral-700 hover:bg-neutral-100"
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
              {abStatus && (
                <p
                  className={`mt-2 text-[11px] ${
                    /failed/i.test(abStatus) ? "text-red-600" : "text-emerald-700"
                  }`}
                >
                  {abStatus}
                </p>
              )}
            </div>
          )}
          {onFeedbackRegenerate && active && activeSource && activePrompt && (
            <div className="mb-3 overflow-hidden rounded-xl border border-neutral-200 bg-white">
              <button
                type="button"
                onClick={() => setCompareOpen((open) => !open)}
                className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left"
              >
                <span>
                  <span className="block text-[10px] font-semibold uppercase tracking-widest text-neutral-500">
                    Compare + Feedback
                  </span>
                  <span className="mt-0.5 block text-[11px] text-neutral-500">
                    Mark what changed, then regenerate with correction memory.
                  </span>
                </span>
                <span className="rounded-full bg-neutral-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-neutral-600">
                  {compareOpen ? "Close" : "Open"}
                </span>
              </button>

              {compareOpen && (
                <div className="space-y-3 border-t border-neutral-100 bg-neutral-50 p-3">
                  <div className="grid gap-2 lg:grid-cols-2">
                    <div className="rounded-xl border border-neutral-200 bg-white p-2">
                      <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-neutral-500">
                        Uploaded source
                      </p>
                      <div className="flex h-56 items-center justify-center overflow-hidden rounded-lg bg-neutral-50">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={activeSource} alt="Uploaded source" className="max-h-full max-w-full object-contain" />
                      </div>
                    </div>
                    <div className="rounded-xl border border-neutral-200 bg-white p-2">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <p className="text-[10px] font-semibold uppercase tracking-widest text-neutral-500">
                          Generated result
                        </p>
                        <button
                          type="button"
                          onClick={clearCompareMarks}
                          className="rounded-full bg-neutral-100 px-2 py-1 text-[10px] font-semibold text-neutral-500 hover:bg-neutral-200"
                        >
                          Clear marks
                        </button>
                      </div>
                      <div className="relative flex h-56 touch-none items-center justify-center overflow-hidden rounded-lg bg-neutral-50">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={active} alt="Generated result" className="max-h-full max-w-full object-contain" />
                        <canvas
                          ref={compareCanvasRef}
                          width={720}
                          height={720}
                          onPointerDown={beginCompareMark}
                          onPointerMove={drawCompareMark}
                          onPointerUp={endCompareMark}
                          onPointerLeave={endCompareMark}
                          className="absolute inset-0 h-full w-full cursor-crosshair"
                          aria-label="Draw red marks over problem areas"
                        />
                      </div>
                    </div>
                  </div>

                  <textarea
                    value={feedbackText}
                    onChange={(event) => setFeedbackText(event.target.value)}
                    rows={3}
                    placeholder="Tell AI what is wrong: collar became too small, stripe colors changed, silhouette is too cropped..."
                    className="w-full resize-none rounded-xl border border-neutral-200 bg-white px-3 py-2 text-[11px] leading-relaxed text-neutral-700 outline-none transition placeholder:text-neutral-400 focus:border-neutral-900"
                  />
                  <div>
                    <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-neutral-500">
                      Save mistake to AI memory
                    </p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {FEEDBACK_ISSUES.map((issue) => {
                        const selected = selectedFeedbackIssues.includes(issue.key);
                        return (
                          <button
                            key={issue.key}
                            type="button"
                            onClick={() => toggleFeedbackIssue(issue.key)}
                            className={`rounded-xl border px-3 py-2 text-left text-[11px] font-semibold transition ${
                              selected
                                ? "border-neutral-900 bg-neutral-900 text-white"
                                : "border-neutral-200 bg-white text-neutral-700 hover:border-neutral-400"
                            }`}
                          >
                            {issue.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={submitFeedbackRegeneration}
                    disabled={!feedbackText.trim() && !selectedFeedbackIssues.length}
                    className="w-full rounded-xl bg-neutral-900 px-3 py-2.5 text-xs font-semibold text-white transition hover:bg-neutral-800 disabled:bg-neutral-300 disabled:text-neutral-500"
                  >
                    Regenerate + remember feedback
                  </button>
                </div>
              )}
            </div>
          )}

          {onQualityControl && activePrompt && (
            <div className="mb-3 overflow-hidden rounded-xl border border-neutral-200 bg-neutral-50">
              <button
                type="button"
                onClick={() => setQcDrawerOpen((open) => !open)}
                className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left"
              >
                <span>
                  <span className="block text-[10px] font-semibold uppercase tracking-widest text-neutral-500">
                    Quality Control
                  </span>
                  <span className="mt-0.5 block text-[11px] text-neutral-500">
                    Guided repair for the selected result
                  </span>
                </span>
                <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-neutral-600">
                  {qcDrawerOpen ? "Close" : "Refine"}
                </span>
              </button>

              {qcDrawerOpen && (
                <div className="space-y-3 border-t border-neutral-200 bg-white p-3">
                  <input
                    ref={fitReferenceInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) void uploadFitReference(file);
                    }}
                  />

                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-neutral-500">
                      Fix this image
                    </p>
                    {current.imageUrls.length > 1 && (
                      <span className="rounded-full bg-neutral-100 px-2 py-1 text-[10px] font-semibold text-neutral-500">
                        Image {safeIndex + 1}
                      </span>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    {qcPrimaryOptions.map(([mode, label]) => {
                      const selected = selectedQcModes.includes(mode as QcMode);
                      return (
                        <button
                          key={mode}
                          type="button"
                          onClick={() => toggleQcMode(mode)}
                          className={`rounded-full border px-3 py-1.5 text-[11px] font-semibold transition ${
                            selected
                              ? "border-neutral-900 bg-neutral-900 text-white"
                              : "border-neutral-200 bg-neutral-50 text-neutral-600 hover:border-neutral-300 hover:bg-neutral-100"
                          }`}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>

                  {showFitControls && (
                    <div className="rounded-xl bg-neutral-50 p-2">
                      <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-neutral-400">
                        Fit tweaks
                      </p>
                      <div className="grid grid-cols-2 gap-1.5">
                        {qcFitOptions.map(([mode, label]) => {
                          const selected = selectedQcModes.includes(mode);
                          return (
                            <button
                              key={mode}
                              type="button"
                              onClick={() => toggleQcMode(mode)}
                              className={`rounded-lg border px-2 py-1.5 text-[11px] font-semibold transition ${
                                selected
                                  ? "border-brand-500 bg-brand-50 text-brand-700"
                                  : "border-white bg-white text-neutral-600 hover:border-neutral-200"
                              }`}
                            >
                              {label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {showProportionControls && (
                    <div className="rounded-xl bg-neutral-50 p-2">
                      <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-neutral-400">
                        Proportion
                      </p>
                      <div className="grid grid-cols-2 gap-1.5">
                        {qcProportionOptions.map(([mode, label]) => {
                          const selected = selectedQcModes.includes(mode);
                          return (
                            <button
                              key={mode}
                              type="button"
                              onClick={() => toggleQcMode(mode)}
                              className={`rounded-lg border px-2 py-1.5 text-[11px] font-semibold transition ${
                                selected
                                  ? "border-brand-500 bg-brand-50 text-brand-700"
                                  : "border-white bg-white text-neutral-600 hover:border-neutral-200"
                              }`}
                            >
                              {label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <textarea
                    value={repairNote}
                    onChange={(event) => setRepairNote(event.target.value)}
                    rows={2}
                    placeholder="Optional note: keep snake patch, make sleeves roomier..."
                    className="w-full resize-none rounded-xl border border-neutral-200 bg-white px-3 py-2 text-[11px] leading-relaxed text-neutral-700 outline-none transition placeholder:text-neutral-400 focus:border-neutral-900"
                  />

                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      type="button"
                      disabled={fitReferenceUploading}
                      onClick={() => fitReferenceInputRef.current?.click()}
                      className="rounded-lg border border-neutral-200 bg-neutral-50 px-2 py-2 text-[11px] font-semibold text-neutral-700 transition hover:border-neutral-300 hover:bg-neutral-100 disabled:opacity-60"
                    >
                      {fitReferenceUploading ? "Uploading..." : "Upload fit ref"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setStrongerRepair((value) => !value)}
                      className={`rounded-lg border px-2 py-2 text-[11px] font-semibold transition ${
                        strongerRepair
                          ? "border-brand-500 bg-brand-50 text-brand-700"
                          : "border-neutral-200 bg-neutral-50 text-neutral-700 hover:border-neutral-300 hover:bg-neutral-100"
                      }`}
                    >
                      {strongerRepair ? "Strong fix" : "Natural fix"}
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={applyGuidedRepair}
                    disabled={!selectedQcModes.length && !repairNote.trim()}
                    className="w-full rounded-xl bg-neutral-900 px-3 py-2.5 text-[12px] font-semibold text-white transition hover:bg-neutral-800 disabled:bg-neutral-300 disabled:text-neutral-500"
                  >
                    Apply repair
                  </button>
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
          <button
            type="button"
            onClick={() => setLibraryOpen((open) => !open)}
            disabled={!active}
            className="mt-2 w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-xs font-semibold text-neutral-700 transition hover:bg-neutral-50 disabled:opacity-50"
          >
            Upload to team library
          </button>
          {onRegeneratePhotoshootView && activePhotoshootView && current?.viewLabels?.length ? (
            <button
              type="button"
              onClick={() =>
                onRegeneratePhotoshootView({
                  index: safeIndex,
                  view: activePhotoshootView,
                  prompt: activePrompt,
                  sourceUrl: activeSource,
                })
              }
              className="mt-2 w-full rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs font-semibold text-neutral-700 transition hover:bg-neutral-100"
            >
              Redo selected {activePhotoshootView} view
            </button>
          ) : null}
          {onCompletePhotoshootSet && !current.multiOption && active && activePrompt && activeSource && (
            <div className="mt-3 rounded-xl border border-neutral-200 bg-white p-3">
              <input
                ref={backReferenceInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void uploadBackReference(file);
                }}
              />

              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-neutral-500">
                    Photoshoot views
                  </p>
                  <p className="mt-0.5 text-[11px] text-neutral-500">
                    Generate each look preset view from this approved result.
                  </p>
                </div>
                {missingViews.length > 0 ? (
                  <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-[10px] font-semibold text-neutral-500">
                    {missingViews.length} left
                  </span>
                ) : (
                  <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold text-emerald-700">
                    Complete
                  </span>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2">
                {photoshootViews.map((view) => {
                  const slot = viewImageMap.get(view);
                  const done = Boolean(slot);
                  return (
                    <div
                      key={view}
                      className={`overflow-hidden rounded-xl border ${
                        done
                          ? "border-neutral-200 bg-neutral-100 text-neutral-500"
                          : view === "back"
                          ? "border-amber-200 bg-amber-50/60 text-neutral-800"
                          : "border-neutral-200 bg-white text-neutral-800"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          if (slot) {
                            setIndex(slot.index);
                            return;
                          }
                          generatePhotoshootViews([view]);
                        }}
                        className="block w-full text-left"
                      >
                        <div className="relative aspect-[3/4] bg-neutral-50">
                          {slot ? (
                            <>
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={slot.url}
                                alt={`${photoshootViewLabel[view]} generated view`}
                                className="h-full w-full object-cover opacity-70"
                              />
                              <span className="absolute right-2 top-2 rounded-full bg-white/90 px-2 py-0.5 text-[9px] font-semibold text-neutral-500 shadow-sm">
                                Generated
                              </span>
                            </>
                          ) : (
                            <div className="flex h-full flex-col items-center justify-center px-3 text-center">
                              <span className="text-sm font-semibold">
                                {photoshootViewLabel[view]}
                              </span>
                              <span className="mt-1 text-[10px] leading-snug text-neutral-500">
                                {view === "back"
                                  ? "Back ref recommended"
                                  : "Click to generate"}
                              </span>
                            </div>
                          )}
                        </div>
                        <div className="flex items-center justify-between px-3 py-2">
                          <span className="text-xs font-semibold">
                            {photoshootViewLabel[view]}
                          </span>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[9px] font-semibold ${
                              done
                                ? "bg-neutral-200 text-neutral-500"
                                : "bg-white text-neutral-600"
                            }`}
                          >
                            {done ? "Done" : "Generate"}
                          </span>
                        </div>
                      </button>
                    </div>
                  );
                })}
              </div>

              <div className="mt-2 grid grid-cols-[1fr_auto] gap-2">
                <button
                  type="button"
                  onClick={() => backReferenceInputRef.current?.click()}
                  disabled={backReferenceUploading}
                  className="rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs font-semibold text-neutral-700 transition hover:bg-neutral-100 disabled:opacity-60"
                >
                  {backReferenceUploading
                    ? "Uploading back ref..."
                    : backReferenceUrl
                    ? "Back ref uploaded"
                    : "Upload back ref"}
                </button>
                {backReferenceUrl && (
                  <button
                    type="button"
                    onClick={() => setBackReferenceUrl(null)}
                    className="rounded-xl border border-neutral-200 px-3 py-2 text-xs font-semibold text-neutral-500 hover:bg-red-50 hover:text-red-600"
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>
          )}
          {libraryOpen && (
            <div className="mt-2 rounded-xl border border-neutral-200 bg-neutral-50 p-3">
              <div className="grid gap-2">
                <input
                  value={libraryStyleNumber}
                  onChange={(event) => setLibraryStyleNumber(event.target.value)}
                  placeholder="Style number, e.g. DJ52056"
                  className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-xs outline-none focus:border-neutral-900"
                />
                <input
                  value={libraryColor}
                  onChange={(event) => setLibraryColor(event.target.value)}
                  placeholder="Color, e.g. Black"
                  className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-xs outline-none focus:border-neutral-900"
                />
                <select
                  value={libraryViewLabel}
                  onChange={(event) => setLibraryViewLabel(event.target.value)}
                  className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-xs outline-none focus:border-neutral-900"
                >
                  <option value="front">Front</option>
                  <option value="side">Side</option>
                  <option value="back">Back</option>
                  <option value="full">Full</option>
                  <option value="detail">Detail</option>
                  <option value="alternate">Alternate</option>
                </select>
                <button
                  type="button"
                  onClick={uploadActiveToLibrary}
                  disabled={
                    libraryUploading ||
                    !libraryStyleNumber.trim() ||
                    !libraryColor.trim() ||
                    !active
                  }
                  className="rounded-lg bg-neutral-900 px-3 py-2 text-xs font-semibold text-white transition hover:bg-neutral-800 disabled:bg-neutral-300"
                >
                  {libraryUploading ? "Saving..." : "Save active image"}
                </button>
              </div>
              {libraryStatus && (
                <p className="mt-2 text-xs leading-relaxed text-neutral-600">{libraryStatus}</p>
              )}
            </div>
          )}
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

      <ImageLightbox
        src={previewSrc}
        onClose={() => setPreviewSrc(null)}
        // For multiOption (Studio 1 trio) and abTest (Image Studio A/B) runs,
        // hand the lightbox the full variant array so ←/→ arrow keys navigate
        // between variants without closing the overlay.
        images={lightboxGalleryImages}
        currentIndex={
          previewSrc && current && current.imageUrls.length > 1
            ? Math.max(0, current.imageUrls.indexOf(previewSrc))
            : undefined
        }
        onIndexChange={
          previewSrc && current && current.imageUrls.length > 1
            ? (nextIndex) => {
                const next = current.imageUrls[nextIndex];
                if (next) {
                  setIndex(nextIndex);
                  setPreviewSrc(next);
                }
              }
            : undefined
        }
        labels={
          lightboxGalleryLabels
        }
      />

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
                {h.imageUrls[0] ? (
                  <span className="relative h-9 w-7 shrink-0 overflow-hidden rounded border border-neutral-200 bg-white">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={h.imageUrls[0]} alt="" className="h-full w-full object-cover" />
                    {h.multiOption && h.imageUrls.length > 1 && (
                      <span className="absolute bottom-0 right-0 rounded-tl bg-black/60 px-1 text-[8px] font-semibold text-white">
                        3
                      </span>
                    )}
                  </span>
                ) : (
                  <span className="grid h-9 w-7 shrink-0 place-items-center rounded border border-dashed border-neutral-200 bg-white text-[10px] text-neutral-400">
                    ...
                  </span>
                )}
                <span
                  className={`h-2 w-2 rounded-full ${
                    h.batch ? "bg-indigo-500" : "bg-brand-500"
                  }`}
                />
                <span className="min-w-0">
                  <span className="block font-medium">Run #{h.id.slice(0, 4)}</span>
                  {h.multiOption && (
                    <span className="block truncate text-[10px] text-neutral-500">
                      3 variants grouped
                    </span>
                  )}
                </span>
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
