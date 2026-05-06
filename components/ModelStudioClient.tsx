"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import ModelSidebar from "@/components/ModelSidebar";
import PromptPanel, {
  type AnalysisReview,
  type BatchProgress,
} from "@/components/PromptPanel";
import OutputPanel from "@/components/OutputPanel";
import StudioHeader from "@/components/StudioHeader";
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
import {
  addFeedbackMemory,
  buildFeedbackNote,
  feedbackMemorySuffix,
  loadFeedbackMemoryFromCloud,
  syncFeedbackMemoryToCloud,
  type FeedbackIssueKey,
} from "@/lib/feedback-memory";
import { startStudioJob } from "@/components/studio-job-store";
import {
  clearCloudHistory,
  loadCloudHistory,
  mergeHistoryItems,
  syncCloudHistory,
} from "@/lib/client-cloud-history";
import type { CloudHistoryStudio } from "@/lib/cloud-history";

function deriveOverlayMode(showName: boolean, showNumber: boolean): OverlayMode {
  if (showName && showNumber) return "both";
  if (showName) return "name";
  if (showNumber) return "number";
  return "none";
}

// Separate history key so Model Studio runs don't commingle with Image Studio
// runs in localStorage. Each workspace has its own run list.
const HISTORY_KEY = "davidani_model_history_v1";
const BETA_HISTORY_KEY = "davidani_model_beta_history_v1";
const CURRENT_ID_KEY = "davidani_model_current_run_v1";
const BETA_CURRENT_ID_KEY = "davidani_model_beta_current_run_v1";
const MODEL_STUDIO_IMPORT_KEY = "davidani:model-studio:library-import";

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
type ProportionRepairMode = "head-smaller" | "head-larger" | "natural-proportion";
type QualityControlAction =
  | "restore-face"
  | "retry-closer"
  | "different-pose"
  | "restore-proportion";
type PhotoshootView = "front" | "side" | "back" | "full";
const MULTI_MODEL_VIEWS: PresetView[] = ["front", "side", "back", "full"];

function multiModelPoseVariantIndex(view: PresetView): number {
  // The primary Kylie back canvas is an over-shoulder pose that exposes the
  // face, which encourages Nano Banana to generate a 3/4 "back" result. The
  // first numbered back alternate is the straight rear pose when available;
  // models without that alternate safely fall back on the server.
  return view === "back" ? 1 : 0;
}

function buildMultiModelViewSuffix(view: PresetView, hasBackReference: boolean): string {
  const label = view === "full" ? "full-body complete outfit" : view;
  return (
    ` Multi Model Studio directive: generate the ${label} view only. ` +
    `This run is part of one four-view ecommerce photoshoot set: front, side, back, and full. ` +
    `Keep the exact same model identity, face, body proportions, lighting, warm beige studio background, camera quality, garment color, construction, trims, texture, and styling continuity across the set. ` +
    (hasBackReference
      ? "Combined garment contract: the first garment reference and second garment reference together define one exact SKU. The first image supplies the front-facing truth; the second image supplies the back-facing truth. Merge both references into one physical garment identity, not two garments, not two design options, and not inspiration images. "
      : "") +
    (view === "back" && hasBackReference
      ? "For this back view, use the second uploaded garment image as the back-reference source of truth for back artwork, seams, pockets, hem shape, wash, construction, and trim placement. The model must face away from camera in a true rear view: show the back of the head, shoulders, torso, sleeves, and garment back. Do not show the model's face, do not use an over-the-shoulder glance, and do not rotate into a 3/4 back pose. "
      : view === "back"
      ? "For this back view, infer the back logically from the front garment image while preserving the same garment category, fabric, construction, trims, and realistic production details. The model must face away from camera in a true rear view; do not show the model's face or an over-the-shoulder glance. "
      : view === "side" && hasBackReference
      ? "For this side view, bridge the uploaded front and back references into one continuous garment: front details should wrap naturally toward the side, back details should only appear where they would truly be visible from the side, and no new alternate garment design should appear. "
      : view === "full" && hasBackReference
      ? "For this full-body view, use the uploaded front and back references together as continuity anchors so the garment reads as the same SKU already shown in the front, side, and back outputs. "
      : "") +
    `Do not generate variants, do not create a collage, and do not change the selected view into another angle.`
  );
}

function buildMultiModelConsistencySuffix(garment: string, features: string): string {
  const cleanGarment = garment.trim();
  const cleanFeatures = features.trim();
  const garmentLine = cleanGarment
    ? `Combined garment identity contract for this four-view set: ${cleanGarment}. `
    : "Combined garment identity contract for this four-view set: use the uploaded front and back product images together as the single source of truth. ";
  const featureLine = cleanFeatures
    ? `The same physical SKU must keep the combined front/back feature map in every angle: ${cleanFeatures}. `
    : "The same physical SKU must keep the exact same silhouette, fabric, color, seams, trims, pockets, hardware, hem, and construction in every angle. ";
  return (
    ` ${garmentLine}${featureLine}` +
    "The front and back uploads are paired evidence for the same garment and must be reconciled into one complete product map before generating any angle. " +
    "All four outputs must look like one real garment photographed from front, side, back, and full-body angles, not four related garments, not four colorways, and not four reinterpretations. " +
    "Keep the same garment length, volume, fit, fabric texture, color, construction logic, pocket size and placement, closure type, cuff/hem behavior, graphics, and trim placement across the set. " +
    "Only reveal angle-specific information that would naturally be visible from that view."
  );
}

function mergeMultiModelGarmentIdentity(
  frontData: any,
  backData?: any
): { garment: string; features: string } {
  const frontGarment = String(frontData?.garment || "").trim();
  const frontFeatures = String(frontData?.features || "").trim();
  const backGarment = String(backData?.garment || "").trim();
  const backFeatures = String(backData?.features || "").trim();
  const garment = frontGarment || backGarment;
  const features = [
    frontFeatures ? `Front-facing source of truth: ${frontFeatures}` : "",
    backFeatures ? `Back-facing source of truth: ${backFeatures}` : "",
  ]
    .filter(Boolean)
    .join(". ");
  return { garment, features: features || frontFeatures || backFeatures };
}

function buildQualityControlSuffix(
  action: QualityControlAction,
  fitMode?: FitRepairMode,
  proportionMode?: ProportionRepairMode,
  repairNote?: string,
  fitModes?: FitRepairMode[]
): string {
  const activeFitModes = Array.from(new Set([...(fitModes ?? []), fitMode].filter(Boolean))) as FitRepairMode[];
  const userCorrection = repairNote?.trim()
    ? ` User correction note from the designer: "${repairNote.trim()}". Treat this note as the highest-priority repair instruction while still preserving the garment identity, model identity, pose family, lighting, background, and camera angle unless the note explicitly asks otherwise.`
    : "";
  if (action === "restore-face") {
    return (
      " Quality control directive: restore and preserve the model's original face, facial features, skin tone, expression, hair, head angle, body proportions, and identity from the selected model pose image exactly. " +
      "Do not beautify, age-shift, reshape, repaint, or replace the face. Keep the background, lighting, camera angle, and garment edit otherwise unchanged." +
      userCorrection
    );
  }
  if (action === "restore-proportion") {
    if (proportionMode === "head-smaller") {
      return (
        " Quality control directive: the previous result made the model's head or face look too large for the body. Regenerate with the head and face scaled slightly smaller to restore natural fashion-model proportions. " +
        "Make only a subtle proportional correction; preserve the exact face identity, facial features, hair, expression, pose, body shape, garment fit, garment details, lighting, background, and camera angle." +
        userCorrection
      );
    }
    if (proportionMode === "head-larger") {
      return (
        " Quality control directive: the previous result made the model's head or face look too small for the body. Regenerate with the head and face scaled slightly larger to restore natural fashion-model proportions. " +
        "Make only a subtle proportional correction; preserve the exact face identity, facial features, hair, expression, pose, body shape, garment fit, garment details, lighting, background, and camera angle." +
        userCorrection
      );
    }
    return (
      " Quality control directive: restore accurate, realistic model proportions. Match the selected model pose image's natural head-to-body scale, face size, neck length, shoulder width, torso length, limb proportions, and overall fashion photography anatomy. " +
      "Do not alter identity, pose, garment, lighting, background, or camera angle except for subtle proportional correction." +
      userCorrection
    );
  }
  if (action === "retry-closer") {
    const clauses: string[] = [];
    if (activeFitModes.includes("silhouette")) {
      clauses.push(
        "Repair the garment silhouette and fit using the uploaded garment reference as the source of truth. Match the original width, volume, body distance, shoulder/waist/hip proportions, leg or sleeve shape, drape, and overall outline. Do not make the garment tighter, looser, straighter, puffier, cropped, or longer unless that exact shape is visible in the reference."
      );
    }
    if (activeFitModes.includes("upload-reference")) {
      clauses.push(
        "Use the additional uploaded fit reference image only as a fit and proportion guide. Copy its garment fit, body distance, length, volume, drape, and silhouette behavior onto the original garment from the product reference. Do not copy the fit reference's color, print, fabric, trims, styling, model, face, pose, background, or unrelated garment details."
      );
    }
    if (activeFitModes.includes("length-shorter")) {
      clauses.push(
        "The previous result made the garment too long. Make the garment visibly shorter, not just a tiny crop adjustment. Move hems, cuffs, crop points, inseams, rises, and sleeve endings upward enough that the change is obvious while preserving seams, stitching, fabric behavior, trims, hardware, model identity, pose, lighting, and background."
      );
    }
    if (activeFitModes.includes("length-longer")) {
      clauses.push(
        "The previous result made the garment too short or too cropped. Make the garment visibly longer, not just barely longer. For jackets, tops, and cardigans, extend the body hem downward so it covers more of the waistband and reads less cropped; if the garment is meant to be longer, let the hem fall closer to the upper hip. If any earlier prompt text says cropped, short, or above-waist, override that wording for this repair only. Extend sleeve cuffs or pant hems only where relevant. Preserve seam placement logic, pockets, drawstrings, trims, hardware, graphics, fabric behavior, model identity, pose, lighting, and background."
      );
    }
    if (activeFitModes.includes("length-much-shorter")) {
      clauses.push(
        "The previous result is far too long. Regenerate the garment noticeably shorter, not just a tiny crop adjustment. Move the hem/cuffs/crop point meaningfully upward so the change is visually obvious, but keep seams, stitching, trims, hardware, fabric behavior, model identity, pose, lighting, and background intact."
      );
    }
    if (activeFitModes.includes("length-much-longer")) {
      clauses.push(
        "The previous result is still too short. Regenerate the garment dramatically longer, not just slightly longer. For jackets and tops, lengthen the body coverage clearly below the previous hem while preserving the original silhouette logic, pockets, drawstrings, trims, sleeve shape, model identity, pose, lighting, and background."
      );
    }
    if (activeFitModes.includes("more-oversized")) {
      clauses.push(
        "The previous result is not oversized enough. Make the garment clearly more oversized and boutique-relaxed: increase body ease and width, add room through the torso, create roomier sleeves, allow lower/relaxed shoulder behavior when appropriate, and make the fabric hang farther away from the body. This must be visibly noticeable, especially through the sleeves and body, while preserving exact product identity, construction, seams, trims, pockets, hardware, graphics, fabric behavior, model identity, pose, lighting, and background."
      );
    }
    if (activeFitModes.includes("more-fitted")) {
      clauses.push(
        "The previous result is too oversized or bulky. Regenerate with a more fitted, closer-to-body fit while preserving the garment category and all visible product details. Reduce excess width and volume through the body and sleeves without changing the fabric, construction, trims, pockets, hardware, graphics, model identity, pose, lighting, and background."
      );
    }
    if (activeFitModes.includes("all") || clauses.length === 0) {
      clauses.push(
        "Retry closer to the uploaded garment reference. Preserve the garment's exact silhouette, fit, length, seam placement, stitching, fabric texture, trims, hardware, pockets, cuffs, waistband, graphics, and material behavior. Use the uploaded garment as the source of truth because the previous result drifted away from the product shape."
      );
    }
    return (
      " Quality control directive: edit the selected generated result image as the canvas. Do not start over from the blank model pose. Apply every selected garment repair at the same time; do not ignore any selected fit or length fix. " +
      clauses.join(" ") +
      " Do not simplify the construction, do not change the garment category, and do not drift away from the original product. Keep the same selected result, model identity, pose family, lighting, background, and camera angle." +
      userCorrection
    );
  }
  return (
    " Quality control directive: create a neighboring pose variation while preserving the same model identity, face, body proportions, garment, background, lighting, and camera style. " +
    "Use a subtle different pose: a small head angle change, slight shoulder rotation, gentle hand/arm variation, or natural weight shift. Do not change the view into a dramatically different shot." +
    userCorrection
  );
}

function buildSetCarryForwardPrompt(
  action: QualityControlAction,
  fitMode?: FitRepairMode,
  fitModes?: FitRepairMode[],
  proportionMode?: ProportionRepairMode,
  repairNote?: string
): string {
  const activeFitModes = Array.from(new Set([...(fitModes ?? []), fitMode].filter(Boolean))) as FitRepairMode[];
  const directives: string[] = [];

  if (action === "retry-closer") {
    if (activeFitModes.includes("more-oversized")) {
      directives.push("carry forward the approved more oversized fit: roomier body, wider torso, relaxed shoulder behavior where appropriate, fuller sleeves, and looser drape away from the body");
    }
    if (activeFitModes.includes("more-fitted")) {
      directives.push("carry forward the approved more fitted silhouette: closer body fit, reduced sleeve/body volume, and cleaner garment-to-body proportion");
    }
    if (activeFitModes.includes("length-longer")) {
      directives.push("carry forward the approved longer garment length: the body hem should sit lower than the original short/cropped version, cover more of the waistband, and read consistently longer in every generated view");
    }
    if (activeFitModes.includes("length-shorter")) {
      directives.push("carry forward the approved shorter garment length: hems, cuffs, crop points, or inseams should sit higher than the original longer version in every generated view");
    }
    if (activeFitModes.includes("all") || activeFitModes.includes("silhouette") || activeFitModes.includes("upload-reference")) {
      directives.push("carry forward the approved corrected garment silhouette, fit, body distance, drape, and length from the accepted front result");
    }
  }

  if (action === "restore-proportion") {
    if (proportionMode === "head-smaller") directives.push("carry forward the approved slightly smaller, realistic head and face scale");
    if (proportionMode === "head-larger") directives.push("carry forward the approved slightly larger, realistic head and face scale");
    if (proportionMode === "natural-proportion") directives.push("carry forward the approved realistic model proportions");
  }

  if (repairNote?.trim()) {
    directives.push(`carry forward this designer correction note where relevant: "${repairNote.trim()}"`);
  }

  if (directives.length === 0) return "";
  return `Approved front view quality-control memory: ${directives.join("; ")}. Apply this same approved correction consistently to every generated missing ecommerce view. Do not revert to the older pre-repair fit, length, or proportions.`;
}

function friendlyModelStudioError(message: string): string {
  if (/output_format is not within the range of allowed options/i.test(message)) {
    return [
      "Nano Banana rejected the selected output format before generation started.",
      "Use PNG with Nano Banana, or switch to another image model before choosing JPEG.",
      "Technical detail: kie.ai rejected output_format for this model.",
    ].join("\n");
  }
  if (/credits insufficient|balance isn.?t enough|top up/i.test(message)) {
    return [
      "Nano Banana could not start because the kie.ai account has insufficient credits.",
      "Top up kie.ai billing, then click Generate again.",
      "No image generation ran for this attempt.",
    ].join("\n");
  }
  if (/pose photo analysis failed/i.test(message)) {
    return [
      "The app could not read the selected model pose image.",
      "Try clicking Generate again first. If it keeps happening, switch to another look/view for this model, then switch back.",
      "Technical detail: the AI vision service rejected the pose reference before generation.",
    ].join("\n");
  }
  if (/garment photo analysis failed/i.test(message)) {
    return [
      "The app could not read the uploaded garment image clearly enough.",
      "Try a cleaner product photo, crop out extra background, or upload a front-facing garment reference.",
      "Technical detail: the garment analysis step failed before generation.",
    ].join("\n");
  }
  if (/bad request/i.test(message)) {
    return [
      "The AI service rejected one of the images for this request.",
      "Try generating again, or switch the model view/look and retry.",
    ].join("\n");
  }
  return message;
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
  if (!res.ok) throw new Error(friendlyModelStudioError(`${label}: ${data?.error || `HTTP ${res.status}`}`));
  return data;
}

interface Props {
  initialHumanModels: HumanModel[];
  beta?: boolean;
}

export default function ModelStudioClient({ initialHumanModels, beta = false }: Props) {
  const historyKey = beta ? BETA_HISTORY_KEY : HISTORY_KEY;
  const currentIdKey = beta ? BETA_CURRENT_ID_KEY : CURRENT_ID_KEY;
  const cloudHistoryStudio: CloudHistoryStudio = beta ? "model-beta" : "model";
  const promptMode = "classic";
  /* ---------- Output (AI image) model & settings ---------- */
  // Default to Nano Banana 2 — fastest of the three (~8-12s vs gpt-image's
  // ~20-30s) and best for surgical garment swaps. Users can switch to
  // Seedream or GPT Image from the sidebar when they want different tradeoffs.
  const [modelId, setModelId] = useState<ModelId>("nano-banana");
  const [aspect, setAspect] = useState<string>("2:3");
  const [resolution, setResolution] = useState<string>("4K");
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

  /* ---------- Swap area override ----------
     "auto" lets inferSwapScope decide based on the analyzer's noun phrase
     (current default behavior). The other three values force a specific
     scope and skip inference — useful when the analyzer mislabels a top as
     a "romper" or vice versa. The latest inferredScope from the analyzer is
     surfaced in the UI so the user can see the auto decision before
     generating. */
  const [swapScopeChoice, setSwapScopeChoice] = useState<
    "auto" | "upper-body" | "lower-body" | "full-look"
  >("auto");
  const [inferredScope, setInferredScope] = useState<
    "upper-body" | "lower-body" | "full-look" | undefined
  >(undefined);

  /* ---------- History ---------- */
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [batchProgress, setBatchProgress] = useState<BatchProgress | null>(null);
  const [localHistoryHydrated, setLocalHistoryHydrated] = useState(false);
  const [cloudHistoryHydrated, setCloudHistoryHydrated] = useState(false);
  const lastSyncedHistoryRef = useRef("");

  /* ---------- Persist / load history ---------- */
  useEffect(() => {
    try {
      const raw = localStorage.getItem(historyKey);
      if (raw) {
        const parsed: HistoryItem[] = JSON.parse(raw);
        setHistory(parsed);
        const savedCurrent = localStorage.getItem(currentIdKey);
        if (savedCurrent && parsed.some((item) => item.id === savedCurrent)) {
          setCurrentId(savedCurrent);
        } else if (parsed[0]) {
          setCurrentId(parsed[0].id);
        }
      }
    } catch {
      /* ignore */
    } finally {
      setLocalHistoryHydrated(true);
    }
  }, [historyKey, currentIdKey]);

  useEffect(() => {
    let cancelled = false;
    setCloudHistoryHydrated(false);

    loadCloudHistory(cloudHistoryStudio)
      .then((cloudHistory) => {
        if (cancelled || cloudHistory.length === 0) return;
        setHistory((localHistory) => mergeHistoryItems(cloudHistory, localHistory));
        setCurrentId((existing) => existing ?? cloudHistory[0]?.id ?? null);
      })
      .catch((err) => {
        console.warn("[cloud-history] load failed:", err);
      })
      .finally(() => {
        if (!cancelled) setCloudHistoryHydrated(true);
      });

    return () => {
      cancelled = true;
    };
  }, [cloudHistoryStudio]);

  useEffect(() => {
    loadFeedbackMemoryFromCloud(cloudHistoryStudio).catch(() => {
      /* local feedback memory still works */
    });
  }, [cloudHistoryStudio]);

  useEffect(() => {
    const refresh = (event?: Event) => {
      const detail = (event as CustomEvent | undefined)?.detail;
      if (detail && detail.historyKey !== historyKey) return;
      try {
        const parsed: HistoryItem[] = JSON.parse(localStorage.getItem(historyKey) || "[]");
        setHistory(parsed);
        const nextCurrent = detail?.currentId || localStorage.getItem(currentIdKey);
        if (nextCurrent && parsed.some((item) => item.id === nextCurrent)) {
          setCurrentId(nextCurrent);
        }
      } catch {
        /* ignore */
      }
    };
    window.addEventListener("davidani:history-updated", refresh as EventListener);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("davidani:history-updated", refresh as EventListener);
      window.removeEventListener("storage", refresh);
    };
  }, [historyKey, currentIdKey]);

  useEffect(() => {
    try {
      localStorage.setItem(historyKey, JSON.stringify(history.slice(0, 50)));
    } catch {
      /* ignore */
    }
  }, [history, historyKey]);

  useEffect(() => {
    if (!localHistoryHydrated || !cloudHistoryHydrated || history.length === 0) return;
    const syncKey = JSON.stringify(history.slice(0, 50));
    if (syncKey === lastSyncedHistoryRef.current) return;
    const timer = window.setTimeout(() => {
      syncCloudHistory(cloudHistoryStudio, history)
        .then(() => {
          lastSyncedHistoryRef.current = syncKey;
        })
        .catch((err) => {
          console.warn("[cloud-history] sync failed:", err);
        });
    }, 750);
    return () => window.clearTimeout(timer);
  }, [cloudHistoryStudio, cloudHistoryHydrated, history, localHistoryHydrated]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(MODEL_STUDIO_IMPORT_KEY);
      if (!raw) return;
      localStorage.removeItem(MODEL_STUDIO_IMPORT_KEY);
      const imported = JSON.parse(raw) as Partial<{
        name: string;
        url: string;
        styleNumber: string;
        color: string;
      }>;
      if (!imported.url) return;
      const nextUpload: UploadedImage = {
        name: imported.name || imported.styleNumber || "Library image",
        url: imported.url,
      };
      setUploads((list) =>
        list.some((item) => item.url === nextUpload.url) ? list : [...list, nextUpload]
      );
      setSelected((items) =>
        items.includes(nextUpload.url) ? items : [...items, nextUpload.url]
      );
      if (imported.styleNumber) setStyleNumber(imported.styleNumber);
      if (imported.color) setColorName(imported.color);
      setPrompt("");
      setAnalysisReview(null);
    } catch {
      /* ignore */
    }
  }, []);

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

  const activeGarmentUrls = useMemo(() => {
    return selected.filter(Boolean);
  }, [selected]);

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
      setSelected(added.map((a) => a.url));
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
    const garmentUrls = activeGarmentUrls;
    if (garmentUrls.length === 0 || !selectedHumanModelId || !selectedPoseId) return null;
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
          garmentImageUrl: garmentUrls[0],
          garmentImageUrls: garmentUrls,
          twoPiece,
          promptMode,
          garmentOverride,
          swapScopeOverride: swapScopeChoice === "auto" ? undefined : swapScopeChoice,
          adjustments: {
            fit: fitAdjustment,
            length: lengthAdjustment,
          },
        }),
      });
      setPrompt(data.prompt);
      if (data.inferredScope) setInferredScope(data.inferredScope);
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

  type MultiModelView = (typeof MULTI_MODEL_VIEWS)[number];
  type MultiModelSlot = NonNullable<HistoryItem["multiModelViews"]>[MultiModelView];

  function pendingMultiModelViews(run: HistoryItem | null): MultiModelView[] {
    if (!run?.multiModelViews) return [];
    return MULTI_MODEL_VIEWS.filter((view) => {
      const slot = run.multiModelViews?.[view];
      return !slot?.url || slot.status === "failed";
    });
  }

  function isProviderTimeoutError(message: string): boolean {
    return /timed out|timeout|504|gateway|temporarily unavailable|high demand/i.test(message);
  }

  function isNonRetryableProviderError(message: string): boolean {
    return /output_format is not within the range of allowed options|credits insufficient|balance isn.?t enough|top up/i.test(
      message
    );
  }

  function mergeMultiModelSlot(
    item: HistoryItem,
    view: MultiModelView,
    patch: MultiModelSlot
  ): HistoryItem {
    const multiModelViews = {
      ...(item.multiModelViews ?? {}),
      [view]: {
        ...(item.multiModelViews?.[view] ?? {}),
        ...patch,
        updatedAt: Date.now(),
      },
    };
    const slot = multiModelViews[view];
    const imageUrls = [...item.imageUrls];
    const prompts = [...(item.prompts ?? [])];
    const viewLabels = [...(item.viewLabels ?? [])];
    const referenceUrls = [...item.referenceUrls];
    const existingIndex = viewLabels.findIndex((label) => label.toLowerCase() === view);

    if (slot?.url) {
      if (existingIndex >= 0) {
        imageUrls[existingIndex] = slot.url;
        prompts[existingIndex] = slot.prompt || prompts[existingIndex] || "";
        referenceUrls[existingIndex] = slot.referenceUrl || referenceUrls[existingIndex] || "";
      } else {
        imageUrls.push(slot.url);
        prompts.push(slot.prompt || "");
        viewLabels.push(view);
        referenceUrls.push(slot.referenceUrl || item.sourceImageUrls?.[0] || item.referenceUrls[0] || "");
      }
    }

    return {
      ...item,
      imageUrls,
      prompts,
      prompt: prompts[0] || item.prompt,
      viewLabels,
      referenceUrls: referenceUrls.filter(Boolean),
      multiModelViews,
    };
  }

  async function runGeneration() {
    const garmentUrls = activeGarmentUrls;
    if (garmentUrls.length === 0 || !selectedHumanModelId || !selectedPoseId) return;
    if (beta) {
      await runMultiModelGeneration(garmentUrls);
      return;
    }
    const id = (crypto.randomUUID?.() || String(Date.now())).replace(/-/g, "");
    const humanModelId = selectedHumanModelId;
    const poseId = selectedPoseId;
    const view = selectedView;
    const reviewOverride =
      !twoPiece && analysisReview?.edited === true && analysisReview.garment.trim()
        ? {
            garment: analysisReview.garment.trim(),
            features: analysisReview.features.trim(),
          }
        : undefined;
    setLoading(true);
    setError(null);
    startStudioJob(
      {
        id,
        kind: beta ? "model-beta" : "model",
        label: beta ? "Multi Model Studio generation" : "Single Model Studio generation",
        historyKey,
        currentIdKey,
      },
      async ({ setStatus }) => {
        try {
          setStatus("analyzing");
          const analyzeData = await fetchJson("Analyze for model", "/api/analyze-model", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              modelId: humanModelId,
              poseId,
              view,
              garmentImageUrl: garmentUrls[0],
              garmentImageUrls: twoPiece ? garmentUrls.slice(0, 2) : garmentUrls,
              twoPiece,
              promptMode,
              garmentOverride: reviewOverride,
              swapScopeOverride: swapScopeChoice === "auto" ? undefined : swapScopeChoice,
              adjustments: {
                fit: fitAdjustment,
                length: lengthAdjustment,
              },
            }),
          });
          const activePrompt = String(analyzeData.prompt || "").trim();
          if (!activePrompt) throw new Error("Analyzer returned empty prompt");
          setPrompt(activePrompt);
          if (analyzeData.inferredScope) setInferredScope(analyzeData.inferredScope);
          if (!twoPiece) {
            setAnalysisReview({
              garment: String(analyzeData.garment || ""),
              features: String(analyzeData.features || ""),
              updatedAt: Date.now(),
              edited: false,
            });
          }
          const studioFeedbackMemory = feedbackMemorySuffix(cloudHistoryStudio);
          const activePromptWithMemory = `${activePrompt}${studioFeedbackMemory}`;
          const promptUsed = optimizePromptForModel(modelId, activePromptWithMemory);

          // Both studios get a `prompts: string[3]` array from the analyzer
          // (classic gets Image-A/Image-B variants, beta gets composition-first
          // variants). The trio picker UI works identically in either mode.
          const promptVariants: string[] | undefined = Array.isArray(analyzeData.prompts)
            ? (analyzeData.prompts as string[]).filter(
                (p): p is string => typeof p === "string" && p.trim().length > 0
              )
            : undefined;
          const useTrio = promptVariants && promptVariants.length === 3;
          const promptVariantsWithMemory = promptVariants?.map(
            (variantPrompt) => `${variantPrompt}${studioFeedbackMemory}`
          );

          setStatus("generating");
          const overlay = {
            mode: deriveOverlayMode(showName, showNumber),
            placement: overlayPlacement,
            colorName,
            styleNumber,
            fontFamily,
            fontSize,
          };
          const baseGenerationBody = {
            modelId,
            humanModelId,
            poseId,
            view,
            garmentImageUrls: garmentUrls,
            aspectRatio: aspect,
            resolution,
            format,
            numImages: useTrio ? 1 : numImages,
            overlay,
            // Default to the selected pose photo as the model canvas. The trio
            // path below asks for poseVariantIndex 0/1/2 so Variant A/B/C can
            // use front/front2/front3, side/side2/side3, etc. when available.
            poseVariantIndex: 0,
          };

          let imageUrls: string[];
          let promptsForHistory: string[] | undefined;
          let multiOption: HistoryItem["multiOption"] | undefined;
          let poseUrl: string | undefined;
          let poseUrlsForHistory: string[] = [];

          if (useTrio) {
            const optimizedTrio = promptVariantsWithMemory!.map((p) =>
              optimizePromptForModel(modelId, p)
            );
            // Seed an in-flight HistoryItem with empty imageUrls so OutputPanel
            // can render skeleton placeholders for the three pending variants
            // immediately. Each variant's URL fills in as its API call resolves
            // (parallel, but each ~10-15s — visible "filling in" feedback).
            const seedItem: HistoryItem = {
              id,
              timestamp: Date.now(),
              modelId,
              prompt: promptUsed,
              imageUrls: [],
              referenceUrls: [...garmentUrls].filter(Boolean) as string[],
              sourceImageUrls: garmentUrls,
              aspect,
              resolution,
              format,
              styleNumber: styleNumber.trim() || undefined,
              humanModelId,
              poseId,
              view,
              prompts: optimizedTrio,
              multiOption: { version: "v1" },
            };
            setHistory((existing) => [seedItem, ...existing.filter((run) => run.id !== id)].slice(0, 50));
            setCurrentId(id);
            localStorage.setItem(currentIdKey, id);

            // Track per-slot URLs in slot order (0/1/2) so the picker shows the
            // variants positionally, not in the order they happened to finish.
            // Each slot requests the matching numbered pose reference for the
            // selected view when it exists. The server falls back to the primary
            // pose for models/views that only have one or two references.
            const slotUrls: (string | null)[] = [null, null, null];
            const slotPoseUrls: (string | null)[] = [null, null, null];
            for (let idx = 0; idx < optimizedTrio.length; idx += 1) {
              const variantPrompt = optimizedTrio[idx];
              let lastError = "";
              for (let attempt = 0; attempt < 3; attempt += 1) {
                try {
                  const response = await fetchJson(
                    "Generate",
                    "/api/generate-model",
                    {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        ...baseGenerationBody,
                        prompt: variantPrompt,
                        resolution,
                        poseVariantIndex: idx,
                      }),
                    }
                  );
                  const url = response.images?.[0]?.url;
                  if (typeof url === "string") {
                    slotUrls[idx] = url;
                    if (typeof response.poseUrl === "string") slotPoseUrls[idx] = response.poseUrl;
                    if (!poseUrl && response.poseUrl) poseUrl = response.poseUrl;
                    // Update the seeded HistoryItem incrementally so the
                    // skeleton card for this slot turns into a real image.
                    setHistory((existing) =>
                      existing.map((run) =>
                        run.id === id
                          ? {
                              ...run,
                              imageUrls: slotUrls.filter(
                                (u): u is string => typeof u === "string"
                              ),
                            }
                        : run
                      )
                    );
                    lastError = "";
                    break;
                  }
                } catch (variantErr) {
                  lastError =
                    variantErr instanceof Error
                      ? variantErr.message
                      : `Variant ${idx + 1} failed`;
                  console.warn(
                    `[runGeneration] variant ${idx} attempt ${attempt + 1} failed:`,
                    variantErr
                  );
                  if (isNonRetryableProviderError(lastError)) {
                    throw new Error(lastError);
                  }
                }
              }
            }
            const collectedUrls = slotUrls.filter(
              (url): url is string => typeof url === "string"
            );
            if (collectedUrls.length === 0) {
              throw new Error("All three Studio 1 prompt variants failed to return an image.");
            }
            imageUrls = collectedUrls;
            promptsForHistory = optimizedTrio;
            multiOption = { version: "v1" };
            poseUrlsForHistory = Array.from(
              new Set(slotPoseUrls.filter((url): url is string => typeof url === "string"))
            );
            poseUrl = slotPoseUrls.find((url): url is string => typeof url === "string") || poseUrl;
          } else {
            const data = await fetchJson("Generate", "/api/generate-model", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ ...baseGenerationBody, prompt: activePromptWithMemory }),
            });
            imageUrls = data.images.map((i: any) => i.url);
            poseUrl = data.poseUrl;
          }

          const item: HistoryItem = {
            id,
            timestamp: Date.now(),
            modelId,
            prompt: promptUsed,
            imageUrls,
            referenceUrls: [
              ...garmentUrls,
              ...(poseUrlsForHistory.length > 0 ? poseUrlsForHistory : poseUrl ? [poseUrl] : []),
            ].filter(Boolean) as string[],
            sourceImageUrls: garmentUrls,
            aspect,
            resolution,
            format,
            styleNumber: styleNumber.trim() || undefined,
            humanModelId,
            poseId,
            view,
            ...(promptsForHistory ? { prompts: promptsForHistory } : {}),
            ...(multiOption ? { multiOption } : {}),
          };
          setHistory((existing) => [item, ...existing.filter((run) => run.id !== item.id)].slice(0, 50));
          setCurrentId(id);
          localStorage.setItem(currentIdKey, id);
          return { historyItem: item };
        } catch (err: any) {
          setError(err.message || "Generation failed");
          throw err;
        } finally {
          setLoading(false);
        }
      }
    );
  }

  async function runMultiModelGeneration(garmentUrls: string[]) {
    if (garmentUrls.length === 0 || !selectedHumanModelId || !selectedPoseId) return;
    const id = (crypto.randomUUID?.() || String(Date.now())).replace(/-/g, "");
    const humanModelId = selectedHumanModelId;
    const poseId = selectedPoseId;
    const frontGarmentUrl = garmentUrls[0];
    const backGarmentUrl = garmentUrls[1];
    const hasBackReference = typeof backGarmentUrl === "string" && backGarmentUrl.trim().length > 0;
    setLoading(true);
    setError(null);
    startStudioJob(
      {
        id,
        kind: "model-beta",
        label: "Multi Model Studio generation",
        historyKey,
        currentIdKey,
      },
      async ({ setStatus }) => {
        try {
          setStatus("analyzing");
          const seedItem: HistoryItem = {
            id,
            timestamp: Date.now(),
            modelId,
            prompt: "",
            imageUrls: [],
            referenceUrls: [frontGarmentUrl, backGarmentUrl].filter(Boolean) as string[],
            sourceImageUrls: [frontGarmentUrl, backGarmentUrl].filter(Boolean) as string[],
            aspect,
            resolution,
            format,
            styleNumber: styleNumber.trim() || undefined,
            humanModelId,
            poseId,
            view: "front",
            prompts: [],
            viewLabels: [...MULTI_MODEL_VIEWS],
          };
          setHistory((existing) => [seedItem, ...existing.filter((run) => run.id !== id)].slice(0, 50));
          setCurrentId(id);
          localStorage.setItem(currentIdKey, id);

          const overlay = {
            mode: deriveOverlayMode(showName, showNumber),
            placement: overlayPlacement,
            colorName,
            styleNumber,
            fontFamily,
            fontSize,
          };
          const slotUrls: (string | null)[] = [null, null, null, null];
          const slotPrompts: string[] = [];
          const slotReferences: string[] = [];
          const slotStatuses: Array<
            NonNullable<NonNullable<HistoryItem["multiModelViews"]>["front"]>["status"]
          > = ["queued", "queued", "queued", "queued"];
          const slotErrors: string[] = [];
          const baseReferences = [frontGarmentUrl, backGarmentUrl].filter(Boolean) as string[];
          const multiModelGarmentRefs = hasBackReference
            ? [frontGarmentUrl, backGarmentUrl]
            : [frontGarmentUrl];
          const [frontGarmentIdentityData, backGarmentIdentityData] = await Promise.all([
            fetchJson("Analyze shared multi model front garment", "/api/analyze-model", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                modelId: humanModelId,
                poseId,
                view: "front",
                garmentImageUrl: frontGarmentUrl,
                garmentImageUrls: [frontGarmentUrl],
                twoPiece: false,
                promptMode: "classic",
                swapScopeOverride: swapScopeChoice === "auto" ? undefined : swapScopeChoice,
                adjustments: {
                  fit: fitAdjustment,
                  length: lengthAdjustment,
                },
              }),
            }),
            hasBackReference
              ? fetchJson("Analyze shared multi model back garment", "/api/analyze-model", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    modelId: humanModelId,
                    poseId,
                    view: "back",
                    garmentImageUrl: backGarmentUrl,
                    garmentImageUrls: [backGarmentUrl],
                    twoPiece: false,
                    promptMode: "classic",
                    swapScopeOverride: swapScopeChoice === "auto" ? undefined : swapScopeChoice,
                    adjustments: {
                      fit: fitAdjustment,
                      length: lengthAdjustment,
                    },
                  }),
                })
              : Promise.resolve(null),
          ]);
          const sharedGarmentOverride = mergeMultiModelGarmentIdentity(
            frontGarmentIdentityData,
            backGarmentIdentityData
          );
          const consistencySuffix = buildMultiModelConsistencySuffix(
            sharedGarmentOverride.garment,
            sharedGarmentOverride.features
          );

          const buildPartialItem = (): HistoryItem => {
            const imageUrls: string[] = [];
            const prompts: string[] = [];
            const viewLabels: string[] = [];
            const generatedReferences: string[] = [];
            const multiModelViews = MULTI_MODEL_VIEWS.reduce<NonNullable<HistoryItem["multiModelViews"]>>(
              (acc, targetView, viewIndex) => {
                const url = slotUrls[viewIndex] || undefined;
                const promptForView = slotPrompts[viewIndex] || undefined;
                const referenceUrl = slotReferences[viewIndex] || undefined;
                if (url) {
                  imageUrls.push(url);
                  prompts.push(promptForView || "");
                  viewLabels.push(targetView);
                  if (referenceUrl) generatedReferences.push(referenceUrl);
                }
                acc[targetView] = {
                  status: url ? "done" : slotStatuses[viewIndex] || "queued",
                  url,
                  prompt: promptForView,
                  referenceUrl,
                  error: slotErrors[viewIndex],
                  updatedAt: Date.now(),
                };
                return acc;
              },
              {}
            );

            return {
              id,
              timestamp: Date.now(),
              modelId,
              prompt: slotPrompts[0] || "",
              imageUrls,
              referenceUrls: [...baseReferences, ...generatedReferences],
              sourceImageUrls: baseReferences,
              aspect,
              resolution,
              format,
              styleNumber: styleNumber.trim() || undefined,
              humanModelId,
              poseId,
              view: "front",
              prompts,
              viewLabels,
              multiModelViews,
            };
          };

          const upsertPartialItem = (
            view: (typeof MULTI_MODEL_VIEWS)[number],
            patch: NonNullable<HistoryItem["multiModelViews"]>[typeof view]
          ) => {
            const viewIndex = MULTI_MODEL_VIEWS.indexOf(view);
            if (viewIndex >= 0 && patch?.status) slotStatuses[viewIndex] = patch.status;
            if (viewIndex >= 0 && typeof patch?.error === "string") slotErrors[viewIndex] = patch.error;
            if (viewIndex >= 0 && patch?.status === "done") slotErrors[viewIndex] = "";
            setHistory((existing) =>
              existing.map((run) => {
                if (run.id !== id) return run;
                const partial = buildPartialItem();
                return {
                  ...run,
                  ...partial,
                  multiModelViews: {
                    ...partial.multiModelViews,
                    [view]: {
                      ...(partial.multiModelViews?.[view] || {}),
                      ...patch,
                      updatedAt: Date.now(),
                    },
                  },
                };
              })
            );
          };

          const generateOneView = async (
            targetView: (typeof MULTI_MODEL_VIEWS)[number],
            idx: number,
            requestResolution: string
          ) => {
            upsertPartialItem(targetView, {
              status: "analyzing",
              error: "",
            });
            const analyzeData = await fetchJson("Analyze for multi model", "/api/analyze-model", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  modelId: humanModelId,
                  poseId,
                  view: targetView,
                  garmentImageUrl: frontGarmentUrl,
                  garmentImageUrls: multiModelGarmentRefs,
                  twoPiece: false,
                  // Multi Model Studio intentionally uses the Single Model
                  // Studio prompt structure, but calls it once per view.
	                  promptMode: "classic",
	                  garmentOverride: sharedGarmentOverride,
	                  swapScopeOverride: swapScopeChoice === "auto" ? undefined : swapScopeChoice,
	                  adjustments: {
                    fit: fitAdjustment,
                    length: lengthAdjustment,
                  },
                }),
              });
            const basePrompt = String(analyzeData.prompt || "").trim();
            if (!basePrompt) throw new Error(`Analyzer returned empty ${targetView} prompt`);
	            const optimizedPrompt = optimizePromptForModel(
	              modelId,
	              `${basePrompt}${consistencySuffix}${buildMultiModelViewSuffix(targetView, hasBackReference)}${feedbackMemorySuffix(cloudHistoryStudio)}`
	            );
            slotPrompts[idx] = optimizedPrompt;
            upsertPartialItem(targetView, { status: "generating", prompt: optimizedPrompt });
            if (idx === 0) {
              setPrompt(optimizedPrompt);
              if (analyzeData.inferredScope) setInferredScope(analyzeData.inferredScope);
              setAnalysisReview({
                garment: String(analyzeData.garment || ""),
                features: String(analyzeData.features || ""),
                updatedAt: Date.now(),
                edited: false,
              });
            }
            setStatus("generating");
            const response = await fetchJson("Generate multi model view", "/api/generate-model", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  modelId,
                  humanModelId,
                  poseId,
                  view: targetView,
                  garmentImageUrls: multiModelGarmentRefs,
                  aspectRatio: aspect,
                  resolution: requestResolution,
                  format,
                  numImages: 1,
                  overlay,
                  outputSize: { width: 2000, height: 3000 },
                  poseVariantIndex: multiModelPoseVariantIndex(targetView),
                  preserveSecondaryReferences: hasBackReference,
                  prompt: optimizedPrompt,
                }),
              });
            const url = response.images?.[0]?.url;
            if (typeof url !== "string") {
              throw new Error(`${targetView} view did not return an image`);
            }
            slotUrls[idx] = url;
            slotReferences[idx] = response.poseUrl || frontGarmentUrl;
            upsertPartialItem(targetView, {
              status: "done",
              url,
              prompt: optimizedPrompt,
              referenceUrl: slotReferences[idx],
            });
          };

          const failures: Array<{ view: (typeof MULTI_MODEL_VIEWS)[number]; error: string }> = [];
          let nextViewIndex = 0;
          const worker = async () => {
            while (nextViewIndex < MULTI_MODEL_VIEWS.length) {
              const idx = nextViewIndex;
              nextViewIndex += 1;
              const targetView = MULTI_MODEL_VIEWS[idx];
              let lastError = "";
              for (let attempt = 0; attempt < 3; attempt += 1) {
                try {
                  await generateOneView(targetView, idx, resolution);
                  lastError = "";
                  break;
                } catch (err: any) {
                  lastError = err?.message || `${targetView} view failed`;
                  if (attempt < 2) {
                    upsertPartialItem(targetView, {
                      status: "queued",
                      error:
                        attempt === 1 && resolution === "4K" && isProviderTimeoutError(lastError)
                          ? `4K timed out. Retrying 4K with the longer wait window.`
                          : `Retrying after: ${lastError}`,
                    });
                  }
                }
              }
              if (lastError) {
                failures.push({ view: targetView, error: lastError });
                upsertPartialItem(targetView, { status: "failed", error: lastError });
              }
            }
          };

          // Multi-view generation is slower, but running all long image jobs
          // concurrently has been the main cause of provider-side 300s
          // timeouts. Keep this sequential so each completed view is saved
          // predictably and the user can retry only the slots that fail.
          await worker();

          const imageUrls = slotUrls.filter((url): url is string => typeof url === "string");
          if (imageUrls.length === 0) {
            throw new Error(
              failures[0]?.error || "Multi Model Studio did not return any completed views."
            );
          }
          const item = buildPartialItem();
          setHistory((existing) => [item, ...existing.filter((run) => run.id !== item.id)].slice(0, 50));
          setCurrentId(id);
          localStorage.setItem(currentIdKey, id);
          if (failures.length) {
            setError(
              `Multi Model Studio saved ${imageUrls.length}/4 views. Retry only the failed views: ${failures
                .map((failure) => failure.view)
                .join(", ")}.`
            );
          }
          return { historyItem: item };
        } catch (err: any) {
          setError(err.message || "Multi Model Studio generation failed");
          throw err;
        } finally {
          setLoading(false);
        }
      }
    );
  }

  async function retryMultiModelViews(views?: MultiModelView[]) {
    const run = currentRun;
    if (!run?.multiModelViews || !run.humanModelId || !run.poseId) return;
    const targetViews = (views?.length ? views : pendingMultiModelViews(run)).filter(
      (view, index, list) => list.indexOf(view) === index
    );
    if (!targetViews.length) return;

    const frontGarmentUrl = run.sourceImageUrls?.[0] || activeGarmentUrls[0] || run.referenceUrls[0];
    const backGarmentUrl = run.sourceImageUrls?.[1] || activeGarmentUrls[1];
    if (!frontGarmentUrl) return;

    const humanModelId = run.humanModelId;
    const poseId = run.poseId;
    const hasBackReference = typeof backGarmentUrl === "string" && backGarmentUrl.trim().length > 0;
    const multiModelGarmentRefs = hasBackReference
      ? [frontGarmentUrl, backGarmentUrl]
      : [frontGarmentUrl];
    const overlay = {
      mode: deriveOverlayMode(showName, showNumber),
      placement: overlayPlacement,
      colorName,
      styleNumber,
      fontFamily,
      fontSize,
    };
    let workingRun = run;

    const applySlot = (view: MultiModelView, patch: MultiModelSlot) => {
      workingRun = mergeMultiModelSlot(workingRun, view, patch);
      setHistory((existing) =>
        existing.map((item) =>
          item.id === run.id ? mergeMultiModelSlot(item, view, patch) : item
        )
      );
    };

    setLoading(true);
    setError(null);
    startStudioJob(
      {
        id: `${run.id}-retry-${Date.now()}`,
        kind: "model-beta",
        label: `Multi Model Studio retry (${targetViews.join(", ")})`,
        historyKey,
        currentIdKey,
      },
      async ({ setStatus }) => {
        const failures: Array<{ view: MultiModelView; error: string }> = [];
        try {
          setStatus("analyzing");
          const [frontGarmentIdentityData, backGarmentIdentityData] = await Promise.all([
            fetchJson("Analyze shared multi model front garment", "/api/analyze-model", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                modelId: humanModelId,
                poseId,
                view: "front",
                garmentImageUrl: frontGarmentUrl,
                garmentImageUrls: [frontGarmentUrl],
                twoPiece: false,
                promptMode: "classic",
                swapScopeOverride: swapScopeChoice === "auto" ? undefined : swapScopeChoice,
                adjustments: {
                  fit: fitAdjustment,
                  length: lengthAdjustment,
                },
              }),
            }),
            hasBackReference
              ? fetchJson("Analyze shared multi model back garment", "/api/analyze-model", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    modelId: humanModelId,
                    poseId,
                    view: "back",
                    garmentImageUrl: backGarmentUrl,
                    garmentImageUrls: [backGarmentUrl],
                    twoPiece: false,
                    promptMode: "classic",
                    swapScopeOverride: swapScopeChoice === "auto" ? undefined : swapScopeChoice,
                    adjustments: {
                      fit: fitAdjustment,
                      length: lengthAdjustment,
                    },
                  }),
                })
              : Promise.resolve(null),
          ]);
          const sharedGarmentOverride = mergeMultiModelGarmentIdentity(
            frontGarmentIdentityData,
            backGarmentIdentityData
          );
          const consistencySuffix = buildMultiModelConsistencySuffix(
            sharedGarmentOverride.garment,
            sharedGarmentOverride.features
          );

          for (const targetView of targetViews) {
            let lastError = "";
            const requestedResolution = run.resolution || resolution;
            for (let attempt = 0; attempt < 3; attempt += 1) {
              try {
                applySlot(targetView, {
                  status: attempt === 0 ? "analyzing" : "queued",
                  error: attempt === 0 ? "" : "Retrying 4K...",
                });
                setStatus("analyzing");
                const analyzeData = await fetchJson("Analyze for multi model", "/api/analyze-model", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    modelId: humanModelId,
                    poseId,
                    view: targetView,
                    garmentImageUrl: frontGarmentUrl,
                    garmentImageUrls: multiModelGarmentRefs,
                    twoPiece: false,
                    promptMode: "classic",
                    garmentOverride: sharedGarmentOverride,
                    swapScopeOverride: swapScopeChoice === "auto" ? undefined : swapScopeChoice,
                    adjustments: {
                      fit: fitAdjustment,
                      length: lengthAdjustment,
                    },
                  }),
                });
                const basePrompt = String(analyzeData.prompt || "").trim();
                if (!basePrompt) throw new Error(`Analyzer returned empty ${targetView} prompt`);
                const optimizedPrompt = optimizePromptForModel(
                  modelId,
                  `${basePrompt}${consistencySuffix}${buildMultiModelViewSuffix(targetView, hasBackReference)}${feedbackMemorySuffix(cloudHistoryStudio)}`
                );

                applySlot(targetView, { status: "generating", prompt: optimizedPrompt, error: "" });
                setStatus("generating");
                const response = await fetchJson("Generate multi model view", "/api/generate-model", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    modelId,
                    humanModelId,
                    poseId,
                    view: targetView,
                    garmentImageUrls: multiModelGarmentRefs,
                    aspectRatio: run.aspect || aspect,
                    resolution: requestedResolution,
                    format,
                    numImages: 1,
                    overlay,
                    poseVariantIndex: multiModelPoseVariantIndex(targetView),
                    preserveSecondaryReferences: hasBackReference,
                    prompt: optimizedPrompt,
                  }),
                });
                const url = response.images?.[0]?.url;
                if (typeof url !== "string") {
                  throw new Error(`${targetView} view did not return an image`);
                }
                applySlot(targetView, {
                  status: "done",
                  url,
                  prompt: optimizedPrompt,
                  referenceUrl: response.poseUrl || frontGarmentUrl,
                  error: "",
                });
                lastError = "";
                break;
              } catch (err: any) {
                lastError = err?.message || `${targetView} view failed`;
                if (
                  attempt === 1 &&
                  requestedResolution === "4K" &&
                  isProviderTimeoutError(lastError)
                ) {
                  applySlot(targetView, {
                    status: "queued",
                    error: "4K timed out. Retrying 4K with the longer wait window.",
                  });
                }
              }
            }
            if (lastError) {
              failures.push({ view: targetView, error: lastError });
              applySlot(targetView, { status: "failed", error: lastError });
            }
          }

          setCurrentId(run.id);
          localStorage.setItem(currentIdKey, run.id);
          if (failures.length) {
            const completedCount = MULTI_MODEL_VIEWS.filter(
              (view) => workingRun.multiModelViews?.[view]?.url
            ).length;
            setError(
              `Multi Model Studio saved ${completedCount}/4 views. Retry only the failed views: ${failures
                .map((failure) => failure.view)
                .join(", ")}.`
            );
          }
          return { historyItem: workingRun };
        } catch (err: any) {
          setError(err.message || "Multi Model Studio retry failed");
          throw err;
        } finally {
          setLoading(false);
        }
      }
    );
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
      format,
      styleNumber: styleNumber.trim() || undefined,
      prompts: [],
      sourceImageUrls: [],
      batch: true,
      humanModelId: selectedHumanModelId,
      poseId: selectedPoseId,
      view: selectedView,
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
            promptMode,
            swapScopeOverride: swapScopeChoice === "auto" ? undefined : swapScopeChoice,
            adjustments: {
              fit: fitAdjustment,
              length: lengthAdjustment,
            },
          }),
        });
        const basePrompt = (analyzeData.prompt as string).trim();
        if (analyzeData.inferredScope) setInferredScope(analyzeData.inferredScope);
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
                  sourceImageUrls: [...(item.sourceImageUrls ?? []), sourceUrl],
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
    fitModes?: FitRepairMode[];
    proportionMode?: ProportionRepairMode;
    fitReferenceUrl?: string;
    repairNote?: string;
    prompt: string;
    sourceUrl: string | null;
    resultUrl?: string | null;
  }) {
    const repairHumanModelId = currentRun?.humanModelId || selectedHumanModelId;
    const repairPoseId = currentRun?.poseId || selectedPoseId;
    const repairView = (currentRun?.view as PresetView | undefined) || selectedView;
    if (!repairHumanModelId || !repairPoseId) return;
    const sourceUrl = params.sourceUrl || activeGarmentUrls[0];
    if (!sourceUrl) return;

    const qualityControlSuffix = buildQualityControlSuffix(
      params.action,
      params.fitMode,
      params.proportionMode,
      params.repairNote,
      params.fitModes
    );
    const setCarryForwardPrompt = buildSetCarryForwardPrompt(
      params.action,
      params.fitMode,
      params.fitModes,
      params.proportionMode,
      params.repairNote
    );
    const imagePrompt = optimizePromptForModel(
      modelId,
      `${params.prompt.trim()}${qualityControlSuffix}${feedbackMemorySuffix(cloudHistoryStudio)}`
    );
    const garmentImageUrls = params.fitReferenceUrl
      ? [sourceUrl, params.fitReferenceUrl]
      : [sourceUrl];

    setLoading(true);
    setError(null);
    try {
      const data = await fetchJson("Quality control", "/api/generate-model", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          modelId,
          humanModelId: repairHumanModelId,
          poseId: repairPoseId,
          view: repairView,
          prompt: imagePrompt,
          garmentImageUrls,
          canvasImageUrl: params.resultUrl || undefined,
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
        referenceUrls: [sourceUrl, params.fitReferenceUrl, data.poseUrl].filter(Boolean),
        sourceImageUrls: [sourceUrl],
        aspect,
        resolution,
        format,
        styleNumber: styleNumber.trim() || undefined,
        humanModelId: repairHumanModelId,
        poseId: repairPoseId,
        view: repairView,
        setCarryForwardPrompt,
      };
      setHistory((h) => [item, ...h]);
      setCurrentId(id);
    } catch (err: any) {
      setError(err.message || "Quality control failed");
    } finally {
      setLoading(false);
    }
  }

  async function uploadFeedbackMarkup(markupDataUrl: string): Promise<string | null> {
    if (!markupDataUrl) return null;
    const blob = await (await fetch(markupDataUrl)).blob();
    const form = new FormData();
    form.append("files", new File([blob], "feedback-markup.png", { type: "image/png" }));
    const data = await fetchJson("Upload feedback markup", "/api/upload", {
      method: "POST",
      body: form,
    });
    return data.uploads?.[0]?.url || null;
  }

  async function runFeedbackRegeneration(params: {
    sourceUrl: string | null;
    resultUrl: string;
    prompt: string;
    feedback: string;
    issueKeys?: FeedbackIssueKey[];
    generationId?: string;
    resultIndex?: number;
    markupDataUrl?: string | null;
  }) {
    const sourceUrl = params.sourceUrl || activeGarmentUrls[0];
    if (!sourceUrl || (!params.feedback.trim() && !params.issueKeys?.length)) return;

    const issueKeys = params.issueKeys ?? [];
    const note = buildFeedbackNote(issueKeys, params.feedback);
    const memoryItem = addFeedbackMemory({
      studio: cloudHistoryStudio,
      generationId: params.generationId,
      issueKeys,
      note: params.feedback,
      sourceUrl,
      resultUrl: params.resultUrl,
    });
    syncFeedbackMemoryToCloud(memoryItem);

    const repairHumanModelId = currentRun?.humanModelId || selectedHumanModelId;
    const repairPoseId = currentRun?.poseId || selectedPoseId;
    const repairView = (currentRun?.view as PresetView | undefined) || selectedView;
    if (!repairHumanModelId || !repairPoseId) return;

    setLoading(true);
    setError(null);
    try {
      const markupUrl = params.markupDataUrl
        ? await uploadFeedbackMarkup(params.markupDataUrl)
        : null;
      const imagePrompt = optimizePromptForModel(
        modelId,
        [
          params.prompt.trim(),
          "COMPARE AND REGENERATE: edit the selected generated model photo as the canvas and correct only the marked or described product/model issues.",
          `Designer feedback: ${note}`,
          markupUrl
            ? "A red-marked feedback image is attached. The red marks show problem areas only; never render red marks, circles, or annotations in the final image."
            : "",
          "Preserve the selected result's model identity, face, pose family, body proportions, camera angle, warm studio background, lighting, and styling unless the feedback explicitly says otherwise. Preserve the uploaded garment as the product source of truth.",
          feedbackMemorySuffix(cloudHistoryStudio),
        ]
          .filter(Boolean)
          .join(" ")
      );
      const data = await fetchJson("Feedback repair", "/api/generate-model", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          modelId,
          humanModelId: repairHumanModelId,
          poseId: repairPoseId,
          view: repairView,
          prompt: imagePrompt,
          garmentImageUrls: [sourceUrl, markupUrl].filter(Boolean),
          canvasImageUrl: params.resultUrl,
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
        sourceImageUrls: [sourceUrl],
        aspect,
        resolution,
        format,
        styleNumber: styleNumber.trim() || undefined,
        humanModelId: repairHumanModelId,
        poseId: repairPoseId,
        view: repairView,
        feedbackNotes: [note],
        feedbackMemory: [
          {
            issueKeys,
            note: params.feedback.trim() || undefined,
            createdAt: Date.now(),
          },
        ],
      };
      setHistory((h) => [item, ...h]);
      setCurrentId(id);
    } catch (err: any) {
      setError(err.message || "Feedback repair failed");
    } finally {
      setLoading(false);
    }
  }

  /**
   * Trio photoshoot extension. For each requested view (e.g. "side"), runs
   * the analyzer once on the primary view photo to get three prompt variants,
   * then dispatches three parallel /api/generate-model calls — one per
   * variant slot, each with poseVariantIndex 0/1/2 so they consume different
   * pose photos when alternates exist. All 3 result URLs are appended to the
   * same HistoryItem so the 3-up trio grid stays visible above and the new
   * views render in a per-view strip below.
   */
  async function runTrioPhotoshootSet(opts: {
    sourceRun: HistoryItem;
    sourceUrl: string;
    humanModelId: string;
    poseId: string;
    uniqueViews: PhotoshootView[];
    backReferenceUrl?: string;
  }) {
    const { sourceRun, sourceUrl, humanModelId, poseId, uniqueViews, backReferenceUrl } = opts;
    setBatchProgress({
      total: uniqueViews.length * 3,
      done: 0,
      failed: 0,
      stage: "analyzing",
    });
    setError(null);
    const failures: { view: string; variant: number; error: string }[] = [];

    for (const view of uniqueViews) {
      const analysisGarmentUrls =
        view === "back" && backReferenceUrl ? [backReferenceUrl, sourceUrl] : [sourceUrl];
      const generationGarmentUrls =
        view === "back" && backReferenceUrl ? [backReferenceUrl] : [sourceUrl];

      setBatchProgress((p) => (p ? { ...p, stage: "analyzing" } : p));

      // Analyzer runs once per view on the primary pose photo. The variants
      // it returns get distributed across the three parallel generates below.
      let viewPromptVariants: string[];
      try {
        const analyzeData = await fetchJson("Analyze trio photoshoot view", "/api/analyze-model", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            modelId: humanModelId,
            poseId,
            view,
            garmentImageUrl: analysisGarmentUrls[0],
            garmentImageUrls: analysisGarmentUrls,
            twoPiece: false,
            promptMode,
            swapScopeOverride: swapScopeChoice === "auto" ? undefined : swapScopeChoice,
            adjustments: { fit: fitAdjustment, length: lengthAdjustment },
          }),
        });
        if (analyzeData.inferredScope) setInferredScope(analyzeData.inferredScope);
        const analyzedVariants = Array.isArray(analyzeData.prompts)
          ? (analyzeData.prompts as string[]).filter(
              (p): p is string => typeof p === "string" && p.trim().length > 0
            )
          : [];
        const fallbackPrompt = String(analyzeData.prompt || "").trim();
        if (analyzedVariants.length === 3) {
          viewPromptVariants = analyzedVariants;
        } else if (fallbackPrompt) {
          viewPromptVariants = [fallbackPrompt, fallbackPrompt, fallbackPrompt];
        } else {
          throw new Error(`Analyzer returned no prompt for ${view} view`);
        }
      } catch (err: any) {
        for (let i = 0; i < 3; i++) failures.push({ view, variant: i, error: err?.message || "Analyze failed" });
        setBatchProgress((p) => (p ? { ...p, done: p.done + 3, failed: p.failed + 3, stage: "idle" } : p));
        continue;
      }

      setBatchProgress((p) => (p ? { ...p, stage: "generating" } : p));

      const continuityDirective = [
        `Photoshoot continuity directive: this is the ${view} view of the same coordinated set. Match the model identity, garment color, fabric behavior, trims, hardware, and overall lighting / camera quality of the front variants exactly. Use the selected view's pose photo as the pose anchor.`,
        view === "side"
          ? "Side-view placement rule: preserve the garment's true wearer-left and wearer-right artwork placement from the product image. Do not move patches, sleeve graphics, embroidery, zipper pockets, or text from the far sleeve onto the visible sleeve."
          : "",
        view === "back" && backReferenceUrl
          ? "For the back view, use the uploaded back reference as the source of truth for back artwork, pockets, seams, embroidery, labels, wash, and construction."
          : "",
        view === "back" && !backReferenceUrl
          ? "Back-view rule: only generate back details that can be logically inferred. Do not copy front chest graphics onto the back unless the garment reference clearly shows matching back artwork."
          : "",
      ]
        .filter(Boolean)
        .join(" ");

      // Track per-slot results so they merge in slot order even if one variant
      // resolves before another. Append all three to the run together once
      // every generate completes (or fails).
      const slotResults: Array<{ url: string; prompt: string } | null> = [null, null, null];
      await Promise.all(
        [0, 1, 2].map(async (variantIdx) => {
          try {
            const variantPrompt = optimizePromptForModel(
              modelId,
              `${viewPromptVariants[variantIdx]} ${continuityDirective}`
            );
            const data = await fetchJson(
              `Generate trio ${view} variant ${variantIdx + 1}`,
              "/api/generate-model",
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  modelId,
                  humanModelId,
                  poseId,
                  view,
                  prompt: variantPrompt,
                  garmentImageUrls: generationGarmentUrls,
                  aspectRatio: aspect,
                  resolution,
                  format,
                  numImages: 1,
                  poseVariantIndex: variantIdx,
                  overlay: {
                    mode: deriveOverlayMode(showName, showNumber),
                    placement: overlayPlacement,
                    colorName,
                    styleNumber,
                    fontFamily,
                    fontSize,
                  },
                }),
              }
            );
            const url = data.images?.[0]?.url;
            if (typeof url !== "string") throw new Error("Generator returned no image URL.");
            slotResults[variantIdx] = { url, prompt: variantPrompt };
          } catch (err: any) {
            failures.push({ view, variant: variantIdx, error: err?.message || "Generate failed" });
          } finally {
            setBatchProgress((p) =>
              p ? { ...p, done: p.done + 1, failed: p.failed + (slotResults[variantIdx] ? 0 : 1) } : p
            );
          }
        })
      );

      // Append the three (or fewer, if any failed) new view URLs to the
      // sourceRun's HistoryItem in slot order, with parallel viewLabels and
      // prompts so OutputPanel can group them per view.
      const successful = slotResults.filter(
        (slot): slot is { url: string; prompt: string } => slot !== null
      );
      if (successful.length === 0) continue;
      setHistory((existing) =>
        existing.map((run) => {
          if (run.id !== sourceRun.id) return run;
          const nextImageUrls = [...run.imageUrls];
          // Backfill any missing viewLabels / prompts so the parallel arrays
          // stay in sync with imageUrls. This guards against trios that were
          // generated before the seed populated viewLabels — without this,
          // appending a new view leaves the original 3 entries unlabeled and
          // the photoshoot UI treats them as "missing front".
          const baseViewLabel = (run.view || "front") as PhotoshootView;
          const nextViewLabels = [...(run.viewLabels ?? [])];
          while (nextViewLabels.length < nextImageUrls.length) {
            nextViewLabels.push(baseViewLabel);
          }
          const nextPrompts = [...(run.prompts ?? [])];
          while (nextPrompts.length < nextImageUrls.length) {
            nextPrompts.push(run.prompt || "");
          }
          const nextRefs = [...run.referenceUrls];
          for (const slot of successful) {
            nextImageUrls.push(slot.url);
            nextViewLabels.push(view);
            nextPrompts.push(slot.prompt);
            nextRefs.push(generationGarmentUrls[0]);
          }
          return {
            ...run,
            imageUrls: nextImageUrls,
            viewLabels: nextViewLabels,
            prompts: nextPrompts,
            referenceUrls: nextRefs,
          };
        })
      );
    }

    setBatchProgress(null);
    if (failures.length) {
      setError(
        `Photoshoot views finished with ${failures.length} issue${
          failures.length === 1 ? "" : "s"
        }:\n${failures
          .slice(0, 4)
          .map((failure) => `• ${failure.view} variant ${failure.variant + 1}: ${failure.error}`)
          .join("\n")}`
      );
    }
  }

  async function runCompletePhotoshootSet(params: {
    sourceUrl: string;
    basePrompt: string;
    approvedImageUrl: string;
    approvedView: PhotoshootView;
    views: PhotoshootView[];
    backReferenceUrl?: string;
  }) {
    const sourceRun = currentRun;
    const setHumanModelId = sourceRun?.humanModelId || selectedHumanModelId;
    const setPoseId = sourceRun?.poseId || selectedPoseId;
    if (!setHumanModelId || !setPoseId || !params.sourceUrl || !params.views.length) return;

    const viewCounts = new Map<PhotoshootView, number>();
    const labels = sourceRun?.viewLabels?.length
      ? sourceRun.viewLabels
      : sourceRun?.view
      ? sourceRun.imageUrls.map(() => sourceRun.view as string)
      : [];
    for (const label of labels) {
      const normalized = label.toLowerCase();
      if (["front", "side", "back", "full"].includes(normalized)) {
        const view = normalized as PhotoshootView;
        viewCounts.set(view, (viewCounts.get(view) ?? 0) + 1);
      }
    }
    const uniqueViews = Array.from(new Set(params.views)).filter((view) =>
      sourceRun?.multiOption ? (viewCounts.get(view) ?? 0) < 3 : (viewCounts.get(view) ?? 0) < 1
    );
    if (uniqueViews.length === 0) return;

    // Trio photoshoot path: when the source is a multiOption (3-variant) run,
    // generate 3 parallel images per requested view (one per variant, each
    // with poseVariantIndex 0/1/2) and append them to the SAME HistoryItem.
    // This keeps the 3-up grid visible above and renders the new views in a
    // strip below, instead of replacing the trio with a single-variant set.
    // Available in both Studio 1 (classic) and Studio 2 (beta) since both
    // produce multiOption runs.
    if (sourceRun?.multiOption) {
      await runTrioPhotoshootSet({
        sourceRun,
        sourceUrl: params.sourceUrl,
        humanModelId: setHumanModelId,
        poseId: setPoseId,
        uniqueViews,
        backReferenceUrl: params.backReferenceUrl,
      });
      return;
    }

    const setId = sourceRun?.batch
      ? sourceRun.id
      : (crypto.randomUUID?.() || String(Date.now())).replace(/-/g, "");
    const seedView = params.approvedView || (sourceRun?.view as PhotoshootView | undefined) || "front";
    const seedImage = params.approvedImageUrl;
    const seedPrompt = params.basePrompt || sourceRun?.prompt || "";
    const carryForwardPrompt = sourceRun?.setCarryForwardPrompt || "";

    if (!sourceRun?.batch) {
      const setItem: HistoryItem = {
        id: setId,
        timestamp: Date.now(),
        modelId: sourceRun?.modelId || modelId,
        prompt: seedPrompt,
        imageUrls: seedImage ? [seedImage] : [],
        referenceUrls: seedImage ? [params.sourceUrl] : [],
        sourceImageUrls: [params.sourceUrl],
        aspect,
        resolution,
        format,
        styleNumber: sourceRun?.styleNumber || styleNumber.trim() || undefined,
        prompts: seedImage ? [seedPrompt] : [],
        viewLabels: seedImage ? [seedView] : [],
        batch: true,
        humanModelId: setHumanModelId,
        poseId: setPoseId,
        view: seedView,
        setCarryForwardPrompt: carryForwardPrompt,
      };
      setHistory((h) => [setItem, ...h]);
    }
    setCurrentId(setId);
    setBatchProgress({
      total: uniqueViews.length,
      done: 0,
      failed: 0,
      stage: "analyzing",
    });
    setError(null);

    const failures: { view: string; error: string }[] = [];

    for (const view of uniqueViews) {
      const analysisGarmentUrls =
        view === "back" && params.backReferenceUrl
          ? [params.backReferenceUrl, params.sourceUrl]
          : [params.sourceUrl];
      const generationGarmentUrls =
        view === "back" && params.backReferenceUrl
          ? [params.backReferenceUrl]
          : [params.sourceUrl];

      setBatchProgress((progress) =>
        progress ? { ...progress, stage: "analyzing" } : progress
      );

      let viewPrompt = "";
      try {
        const analyzeData = await fetchJson("Analyze photoshoot view", "/api/analyze-model", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            modelId: setHumanModelId,
            poseId: setPoseId,
            view,
            garmentImageUrl: analysisGarmentUrls[0],
            garmentImageUrls: analysisGarmentUrls,
            twoPiece: false,
            promptMode,
            swapScopeOverride: swapScopeChoice === "auto" ? undefined : swapScopeChoice,
            adjustments: {
              fit: fitAdjustment,
              length: lengthAdjustment,
            },
          }),
        });

        const continuityDirective = [
          `Complete photoshoot set directive: generate the ${view} view for the same style as the approved shot.`,
          "Keep the same model identity, styling world, lighting, background, camera quality, product color, fabric behavior, trims, seams, hardware, and overall ecommerce catalog feel.",
          carryForwardPrompt,
          "Use the selected view's model pose image as the pose/view anchor. Do not invent a different model or photoshoot environment.",
          view === "side"
            ? "Side-view placement rule: preserve the garment's true wearer-left and wearer-right artwork placement from the product image. Do not move patches, sleeve graphics, embroidery, zipper pockets, or text from the far sleeve onto the visible sleeve. If a detail belongs on the hidden side, it should be hidden or only naturally glimpsed, not relocated."
            : "",
          view === "back" && params.backReferenceUrl
            ? "For the back view, use the uploaded back reference as the source of truth for back artwork, pockets, seams, embroidery, labels, wash, and construction. The front image is only continuity context during analysis; the generation reference image is the real back garment view."
            : "",
          view === "back" && !params.backReferenceUrl
            ? "Back-view rule: only generate back details that can be logically inferred. Do not copy front chest graphics onto the back unless the garment reference clearly shows matching back artwork."
            : "",
        ]
          .filter(Boolean)
          .join(" ");

        viewPrompt = optimizePromptForModel(
          (sourceRun?.modelId || modelId) as ModelId,
          `${(analyzeData.prompt as string).trim()} ${continuityDirective}`
        );
      } catch (err: any) {
        failures.push({ view, error: err?.message || "Analyze failed" });
        setBatchProgress((progress) =>
          progress
            ? { ...progress, done: progress.done + 1, failed: progress.failed + 1, stage: "idle" }
            : progress
        );
        continue;
      }

      setBatchProgress((progress) =>
        progress ? { ...progress, stage: "generating" } : progress
      );

      try {
        const data = await fetchJson("Generate photoshoot view", "/api/generate-model", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            modelId: sourceRun?.modelId || modelId,
            humanModelId: setHumanModelId,
            poseId: setPoseId,
            view,
            prompt: viewPrompt,
            garmentImageUrls: generationGarmentUrls,
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

        const outputUrl = data.images?.[0]?.url;
        if (!outputUrl) throw new Error("Generator returned no image URL.");
        setHistory((h) =>
          h.map((item) =>
            item.id === setId
              ? {
                  ...item,
                  imageUrls: [...item.imageUrls, outputUrl],
                  referenceUrls: [...item.referenceUrls, generationGarmentUrls[0]],
                  prompts: [...(item.prompts ?? []), viewPrompt],
                  viewLabels: [...(item.viewLabels ?? []), view],
                }
              : item
          )
        );
      } catch (err: any) {
        failures.push({ view, error: err?.message || "Generate failed" });
        setBatchProgress((progress) =>
          progress ? { ...progress, failed: progress.failed + 1 } : progress
        );
      } finally {
        setBatchProgress((progress) =>
          progress ? { ...progress, done: progress.done + 1, stage: "idle" } : progress
        );
      }
    }

    setBatchProgress(null);
    if (failures.length) {
      setError(
        `Photoshoot set finished with ${failures.length} issue${
          failures.length === 1 ? "" : "s"
        }:\n${failures
          .slice(0, 4)
          .map((failure) => `• ${failure.view}: ${failure.error}`)
          .join("\n")}`
      );
    }
  }

  async function regeneratePhotoshootView(params: {
    index: number;
    view: PhotoshootView;
    prompt: string;
    sourceUrl: string | null;
  }) {
    const run = currentRun;
    if (!run?.batch || !run.humanModelId || !run.poseId) return;
    const sourceUrl = params.sourceUrl || run.referenceUrls[0];
    if (!sourceUrl) return;

    const retryPrompt = optimizePromptForModel(
      run.modelId as ModelId,
      [
        params.prompt.trim() || run.prompt,
        `Redo only the ${params.view} view for this approved ecommerce set.`,
        "Keep the same style, model identity, lighting, background, camera quality, product color, trims, seams, hardware, and catalog feel.",
        "Improve this single view without changing the other approved set images.",
      ].join(" ")
    );

    setLoading(true);
    setError(null);
    try {
      const data = await fetchJson("Redo photoshoot view", "/api/generate-model", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          modelId: run.modelId || modelId,
          humanModelId: run.humanModelId,
          poseId: run.poseId,
          view: params.view,
          prompt: retryPrompt,
          garmentImageUrls: [sourceUrl],
          aspectRatio: run.aspect || aspect,
          resolution: run.resolution || resolution,
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

      const outputUrl = data.images?.[0]?.url;
      if (!outputUrl) throw new Error("Generator returned no image URL.");
      setHistory((history) =>
        history.map((item) => {
          if (item.id !== run.id) return item;
          const imageUrls = [...item.imageUrls];
          const prompts = [...(item.prompts ?? [])];
          const referenceUrls = [...item.referenceUrls];
          const viewLabels = [...(item.viewLabels ?? [])];
          imageUrls[params.index] = outputUrl;
          prompts[params.index] = retryPrompt;
          referenceUrls[params.index] = sourceUrl;
          viewLabels[params.index] = params.view;
          return {
            ...item,
            timestamp: Date.now(),
            imageUrls,
            prompts,
            referenceUrls,
            viewLabels,
          };
        })
      );
      setCurrentId(run.id);
    } catch (err: any) {
      setError(err.message || "Redo photoshoot view failed");
    } finally {
      setLoading(false);
    }
  }

  const canAnalyze =
    activeGarmentUrls.length > 0 && !!selectedHumanModelId && !!selectedPoseId;

  return (
    <main className="flex min-h-screen flex-col bg-neutral-50 lg:h-screen">
      <StudioHeader
        active={beta ? "model-beta" : "model"}
        title={beta ? "Multi Model Studio" : "Single Model Studio"}
        subtitle={
          beta
            ? "Generate front, side, back, and full model photos in one run."
            : "Generate on-model photography, then repair fit, pose, and proportion."
        }
        metrics={[
          { label: "Runs", value: history.length },
          { label: "Active", value: loading || batchProgress ? 1 : 0 },
        ]}
      />

      <div className="model-studio-layout min-h-0 flex-1">
        <div className="model-studio-setup min-h-0">
          <ModelSidebar
            modelId={modelId}
            onModelChange={(nextModelId) => {
              setModelId(nextModelId);
              if (nextModelId === "nano-banana") setFormat("png");
            }}
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
            multiModelMode={beta}
          />
        </div>
        <div className="model-studio-workbench min-h-0">
          <div className="model-studio-brief min-h-0">
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
            onBatchGenerate={beta ? undefined : runBatchGeneration}
            canBatch={!beta && canAnalyze && selected.length >= 2}
            batchProgress={batchProgress}
            twoPiece={beta ? false : twoPiece}
            onTwoPieceChange={beta ? () => undefined : handleTwoPieceChange}
            fitAdjustment={fitAdjustment}
            onFitAdjustmentChange={handleFitAdjustmentChange}
            lengthAdjustment={lengthAdjustment}
            onLengthAdjustmentChange={handleLengthAdjustmentChange}
            pantsAdjustments={selectedModelIsPants}
            analysisReview={twoPiece ? null : analysisReview}
            onAnalysisReviewChange={twoPiece ? undefined : handleAnalysisReviewChange}
            swapScopeChoice={swapScopeChoice}
            onSwapScopeChoiceChange={(choice) => {
              setSwapScopeChoice(choice);
              // Override invalidates the previously assembled prompt; force a
              // re-analyze on next Generate so the new scope is applied.
              setPrompt("");
            }}
            inferredScope={inferredScope}
            hideTwoPieceToggle={beta}
            hideVariantControl={beta}
            generateLabel={beta ? "Generate 4 views" : undefined}
          />
          </div>
          <div className="model-studio-output min-h-0">
          <OutputPanel
            current={currentRun}
            history={history}
            onSelectHistory={setCurrentId}
            onFeedbackRegenerate={runFeedbackRegeneration}
            onQualityControl={runQualityControl}
            onMultiOptionSelect={({ generationId, selectedIndex, view }) => {
              setHistory((existing) =>
                existing.map((run) =>
                  run.id === generationId && run.multiOption
                    ? {
                        ...run,
                        multiOption: {
                          ...run.multiOption,
                          selectedIndex: view && view !== "front" ? run.multiOption.selectedIndex : selectedIndex,
                          picksByView: {
                            ...(run.multiOption.picksByView ?? {}),
                            [view || "front"]: selectedIndex,
                          },
                        },
                      }
                    : run
                )
              );
            }}
            onRetryMultiModelView={
              beta
                ? ({ view }) => {
                    void retryMultiModelViews([view]);
                  }
                : undefined
            }
            onRetryFailedMultiModelViews={
              beta
                ? () => {
                    void retryMultiModelViews();
                  }
                : undefined
            }
            uploadNames={uploadNames}
            onClearHistory={() => {
              setHistory([]);
              setCurrentId(null);
              localStorage.removeItem(currentIdKey);
              clearCloudHistory(cloudHistoryStudio).catch((err) => {
                console.warn("[cloud-history] clear failed:", err);
              });
            }}
          />
          </div>
        </div>
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
