"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Sidebar from "@/components/Sidebar";
import PromptPanel, { type BatchProgress, type ProductShotMode } from "@/components/PromptPanel";
import OutputPanel from "@/components/OutputPanel";
import StudioHeader from "@/components/StudioHeader";
import type { HistoryItem, UploadedImage } from "@/components/types";
import type { ModelId } from "@/lib/models";
import type { OverlayMode, OverlayPlacement } from "@/lib/fal";
import { PRODUCT_SHOT_REFERENCES } from "@/lib/product-shot-references";
import { resizeIfNeeded } from "@/lib/image-resize";
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

function deriveOverlayMode(showName: boolean, showNumber: boolean): OverlayMode {
  if (showName && showNumber) return "both";
  if (showName) return "name";
  if (showNumber) return "number";
  return "none";
}

const HISTORY_KEY = "davidani_history_v1";
const CURRENT_ID_KEY = "davidani_image_current_run_v1";
const IMAGE_JOBS_KEY = "davidani_image_jobs_v1";
const USER_ID_KEY = "davidani_user_id_v1";
const IMAGE_STUDIO_VERSION = "1.7";
const IMAGE_STUDIO_OUTPUT_SIZE = { width: 2000, height: 3000 } as const;

function productShotViewDirective(mode: ProductShotMode, target?: "front" | "back"): string {
  const view =
    target ?? (mode === "single-back" ? "back" : "front");
  const viewText =
    view === "back"
      ? "Generate a BACK product shot only. The final image must show the garment back side facing the camera, not the front side and not a rotated front product shot. Show back hem shape, back seams, back pockets, back graphics, rear closures, yoke, quilting, hood, collar back, sleeve backs, and any rear construction visible or inferable from the uploaded product reference. If the uploaded reference shows rear artwork or a rear graphic, that artwork is back artwork and must remain on the back of the garment. Do not add a front neckline, front chest layout, front placket, front pockets, or front-facing garment structure unless it is actually visible on the uploaded back reference."
      : "Generate a FRONT product shot only. Show the front-facing side of the garment, including front neckline, placket, front pockets, front graphics, closures, front hem shape, sleeve fronts, waistband, and all front construction visible in the uploaded product reference.";
  const contractText =
    mode === "front-back-contract"
      ? " Use the selected front and back garment references together as one structural SKU contract. The first selected image is the front truth and the second selected image is the back truth. Preserve proportions, high-low hems, sleeve structure, silhouette, fabric behavior, drape, embroidery or graphic placements, pocket placement, trims, and construction consistency from both references."
      : " Use the single uploaded garment reference as the product source of truth. If the requested side is not fully visible, infer the hidden side conservatively from the visible garment construction without changing the product category, length, silhouette, fabric, color, or trims.";
  return ` Product shot side directive: ${viewText}${contractText} Output one clean 2000x3000 vertical product-shot image, not a collage and not a side-by-side layout.`;
}

function buildBackProductPrompt(analyzedPrompt: string): string {
  return [
    "Create a clean ecommerce BACK product shot from the uploaded back-facing garment photo.",
    "Use the uploaded back product image itself as the structural source of truth. Preserve the rear orientation exactly: the back body panel faces the camera, sleeves extend from the back view, rear collar/neck seam stays rear-facing, and rear graphics or sleeve graphics stay in their original back-side positions.",
    "Do not use any front-facing product-shot template, front sweatshirt neckline, front chest composition, front pockets, front placket, front drawstrings, or front-facing garment structure. Do not turn the garment around.",
    "Clean up the photo into a production-ready studio product image: remove phone/photo environment cues, center the garment, straighten the hanger/garment axis if needed, smooth wrinkles lightly, preserve fabric texture and construction, and keep realistic shadows on a clean neutral studio background.",
    "Output one vertical 2000x3000 product image, not a collage and not a side-by-side layout.",
    `Analyzer product context from this upload: ${analyzedPrompt}`,
  ].join(" ");
}

function buildV17Prompt(analyzedPrompt: string): string {
  return [
    "Use the clean studio style reference/base image as the base image and keep the clean studio background, lighting, and camera angle unchanged.",
    "Replace the garment with the exact apparel product from the uploaded product reference image while strictly preserving its original garment category, silhouette, volume, proportions, construction, fabric texture, print, trims, pockets, closures, waistband or neckline, sleeve or leg shape, hems, and material behavior.",
    "Do not convert the uploaded product into pants unless the uploaded product is actually pants. If the uploaded product is a jacket, hoodie, cardigan, top, dress, skirt, set, or outerwear piece, keep that exact product category.",
    "Restyle the garment into a professionally styled Zara-inspired flat lay/product image by centering it precisely, straightening the main garment axis, balancing sleeves, legs, panels, hems, waistbands, necklines, or openings according to the actual garment type, and creating subtle symmetry without changing the product identity.",
    "Apply light tension to smooth wrinkles while keeping natural fabric character, ensure hems and openings are intentionally positioned, and create controlled, realistic folds.",
    "Maintain realistic shadows and crisp edges, output a 4K 2:3 product image.",
    `Analyzer product context from this upload: ${analyzedPrompt}`,
  ].join(" ");
}

interface ImageJob {
  id: string;
  status: "analyzing" | "generating" | "done" | "failed";
  label: string;
  startedAt: number;
  updatedAt: number;
  error?: string;
}

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

function readHistory(): HistoryItem[] {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
  } catch {
    return [];
  }
}

function persistHistoryItem(item: HistoryItem): HistoryItem[] {
  const existing = readHistory().filter((run) => run.id !== item.id);
  const next = [item, ...existing].slice(0, 50);
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  return next;
}

function readImageJobs(): ImageJob[] {
  try {
    const jobs = JSON.parse(localStorage.getItem(IMAGE_JOBS_KEY) || "[]") as ImageJob[];
    return jobs.filter((job) => Date.now() - job.updatedAt < 1000 * 60 * 60 * 6);
  } catch {
    return [];
  }
}

function writeImageJob(job: ImageJob) {
  try {
    const jobs = readImageJobs().filter((item) => item.id !== job.id);
    localStorage.setItem(IMAGE_JOBS_KEY, JSON.stringify([job, ...jobs].slice(0, 20)));
  } catch {
    /* ignore */
  }
}

function updateImageJob(id: string, patch: Partial<ImageJob>) {
  const existing =
    readImageJobs().find((job) => job.id === id) || {
      id,
      status: "generating",
      label: "Image Studio generation",
      startedAt: Date.now(),
      updatedAt: Date.now(),
    };
  writeImageJob({ ...existing, ...patch, updatedAt: Date.now() });
}

function getOrCreateUserId(): string {
  try {
    const existing = localStorage.getItem(USER_ID_KEY);
    if (existing) return existing;
    const id = `user_${(crypto.randomUUID?.() || String(Date.now())).replace(/-/g, "")}`;
    localStorage.setItem(USER_ID_KEY, id);
    return id;
  } catch {
    return "anonymous";
  }
}

export default function StudioPage() {
  // Controls
  const [modelId, setModelId] = useState<ModelId>("nano-banana");
  const [aspect, setAspect] = useState<string>("2:3");
  const [resolution, setResolution] = useState<string>("4K");
  const [format, setFormat] = useState<"png" | "jpeg">("png");
  const [numImages, setNumImages] = useState<number>(1);
  const [productShotMode, setProductShotMode] = useState<ProductShotMode>("single-front");

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
  const [frontIntakeUrl, setFrontIntakeUrl] = useState<string | null>(null);
  const [backIntakeUrl, setBackIntakeUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  // Style reference (image 2). Image Studio presets live under
  // public/product-shots; custom uploads override the selected preset.
  const [selectedProductShotPath, setSelectedProductShotPath] = useState<string>(
    PRODUCT_SHOT_REFERENCES[0]?.path ?? ""
  );
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
  const [backgroundJobs, setBackgroundJobs] = useState<ImageJob[]>([]);
  const [localHistoryHydrated, setLocalHistoryHydrated] = useState(false);
  const [cloudHistoryHydrated, setCloudHistoryHydrated] = useState(false);
  const lastSyncedHistoryRef = useRef("");

  // Batch state — non-null while a batch is in flight so the UI can show a
  // progress bar and disable the single-image actions. Goes back to null
  // once all images have been processed.
  const [batchProgress, setBatchProgress] = useState<BatchProgress | null>(null);

  // Load history on mount
  useEffect(() => {
    try {
      const parsed = readHistory();
      setHistory(parsed);
      const savedCurrent = localStorage.getItem(CURRENT_ID_KEY);
      if (savedCurrent && parsed.some((item) => item.id === savedCurrent)) {
        setCurrentId(savedCurrent);
      } else if (parsed[0]) {
        setCurrentId(parsed[0].id);
      }
    } catch {
      /* ignore */
    } finally {
      setLocalHistoryHydrated(true);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    setCloudHistoryHydrated(false);

    loadCloudHistory("image")
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
  }, []);

  useEffect(() => {
    const refresh = (event?: Event) => {
      const detail = (event as CustomEvent | undefined)?.detail;
      if (detail && detail.historyKey !== HISTORY_KEY) return;
      const parsed = readHistory();
      setHistory(parsed);
      const nextCurrent = detail?.currentId || localStorage.getItem(CURRENT_ID_KEY);
      if (nextCurrent && parsed.some((item) => item.id === nextCurrent)) {
        setCurrentId(nextCurrent);
      }
    };
    window.addEventListener("davidani:history-updated", refresh as EventListener);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("davidani:history-updated", refresh as EventListener);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  useEffect(() => {
    const refresh = () => setBackgroundJobs(readImageJobs());
    refresh();
    const timer = window.setInterval(refresh, 1500);
    window.addEventListener("focus", refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, []);

  useEffect(() => {
    loadFeedbackMemoryFromCloud("image").catch(() => {
      /* local feedback memory still works */
    });
  }, []);

  // Persist history
  useEffect(() => {
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, 50)));
    } catch {
      /* ignore */
    }
  }, [history]);

  useEffect(() => {
    if (!localHistoryHydrated || !cloudHistoryHydrated || history.length === 0) return;
    const syncKey = JSON.stringify(history.slice(0, 50));
    if (syncKey === lastSyncedHistoryRef.current) return;
    const timer = window.setTimeout(() => {
      syncCloudHistory("image", history)
        .then(() => {
          lastSyncedHistoryRef.current = syncKey;
        })
        .catch((err) => {
          console.warn("[cloud-history] sync failed:", err);
        });
    }, 750);
    return () => window.clearTimeout(timer);
  }, [cloudHistoryHydrated, history, localHistoryHydrated]);

  const currentRun = useMemo(
    () => history.find((h) => h.id === currentId) ?? null,
    [history, currentId]
  );
  const activeBackgroundJobCount = backgroundJobs.filter((job) =>
    ["analyzing", "generating"].includes(job.status)
  ).length;

  // URL → original upload filename, so OutputPanel can name downloads
  // after the source product photo (e.g. "blue-pants.jpg" → "blue-pants.png")
  // instead of "davidani-<timestamp>.png". Rebuilt cheaply whenever the
  // uploads list changes.
  const uploadNames = useMemo(() => {
    const map: Record<string, string> = {};
    for (const u of uploads) map[u.url] = u.name;
    return map;
  }, [uploads]);

  function removeUpload(url: string) {
    setUploads((list) => list.filter((u) => u.url !== url));
    setSelected((s) => s.filter((u) => u !== url));
    setFrontIntakeUrl((existing) => (existing === url ? null : existing));
    setBackIntakeUrl((existing) => (existing === url ? null : existing));
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

  function resolveSelectedReferenceUrl(): string | null {
    if (referenceImageUrl) return referenceImageUrl;
    if (!selectedProductShotPath) return null;
    if (typeof window === "undefined") return selectedProductShotPath;
    return new URL(selectedProductShotPath, window.location.origin).toString();
  }

  async function addFiles(files: FileList, preferredSlot?: "front" | "back") {
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
        setSelected((s) => [...s, ...added.map((a) => a.url)]);
        const firstUrl = added[0]?.url ?? null;
        const secondUrl = added[1]?.url ?? null;
        if (preferredSlot === "front") {
          setFrontIntakeUrl(firstUrl);
        } else if (preferredSlot === "back") {
          setBackIntakeUrl(firstUrl);
        } else {
          const frontWasEmpty = !frontIntakeUrl;
          setFrontIntakeUrl((existing) => existing ?? firstUrl);
          setBackIntakeUrl((existing) => existing ?? (frontWasEmpty ? secondUrl : firstUrl));
        }
      }
    } catch (err: any) {
      setError(err.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function analyzeProduct() {
    if (!frontIntakeUrl && !backIntakeUrl) return;
    const selectedUrls =
      productShotMode === "front-back-contract"
        ? [frontIntakeUrl, backIntakeUrl].filter((url): url is string => !!url)
        : [productShotMode === "single-back" ? backIntakeUrl || frontIntakeUrl : frontIntakeUrl || backIntakeUrl].filter(
            (url): url is string => !!url
          );
    setAnalyzing(true);
    setError(null);
    try {
      // One selected image = normal product reference. Two selected images =
      // front/back contract for one SKU, matching Multi Model Studio's intake.
      const data = await fetchJson("Analyze", "/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageUrl: selectedUrls[0],
          imageUrls: selectedUrls,
          backgroundColor,
          twoPiece,
        }),
      });
      const prompted = `${data.prompt}${productShotViewDirective(productShotMode)}`;
      setPrompt(prompted);
      return prompted;
    } catch (err: any) {
      setError(err.message || "Analysis failed");
      return null;
    } finally {
      setAnalyzing(false);
    }
  }

  async function runGeneration() {
    if (!frontIntakeUrl && !backIntakeUrl) return;
    if (productShotMode === "front-back-contract" && (!frontIntakeUrl || !backIntakeUrl)) {
      setError("Front + Back Contract Mode needs both intake slots: front and back.");
      return;
    }
    const jobId = (crypto.randomUUID?.() || String(Date.now())).replace(/-/g, "");
    const selectedUrls =
      productShotMode === "front-back-contract"
        ? [frontIntakeUrl!, backIntakeUrl!]
        : [productShotMode === "single-back" ? backIntakeUrl || frontIntakeUrl : frontIntakeUrl || backIntakeUrl].filter(
            (url): url is string => !!url
          );
    writeImageJob({
      id: jobId,
      status: "analyzing",
      label: "Image Studio generation",
      startedAt: Date.now(),
      updatedAt: Date.now(),
    });
    setBackgroundJobs(readImageJobs());

    setLoading(true);
    setError(null);
    startStudioJob(
      {
        id: jobId,
        kind: "image",
        label: "Image Studio generation",
        historyKey: HISTORY_KEY,
        currentIdKey: CURRENT_ID_KEY,
      },
      async ({ setStatus }) => {
        try {
          // Unified flow: every Generate click re-runs the analyzer so the prompt
          // stays in sync with the current photo + toggle state.
          setStatus("analyzing");
          const analyzeData = await fetchJson("Analyze", "/api/analyze", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              imageUrl: selectedUrls[0],
              imageUrls: selectedUrls,
              backgroundColor,
              twoPiece,
            }),
          });
          const activePrompt = String(analyzeData.prompt || "").trim();
          if (!activePrompt) throw new Error("Analyzer returned empty prompt");

          const studioFeedbackMemory = feedbackMemorySuffix("image");
          const promptWithSideDirective = `${activePrompt}${productShotViewDirective(productShotMode)}`;
          setPrompt(promptWithSideDirective);

          const singleBackMode = productShotMode === "single-back";
          const promptWithMemory = `${promptWithSideDirective}${studioFeedbackMemory}`;
          const v17Prompt = `${
            singleBackMode ? buildBackProductPrompt(activePrompt) : buildV17Prompt(activePrompt)
          }${productShotViewDirective(productShotMode)}${studioFeedbackMemory}`;
          const oldPromptUsed = optimizePromptForModel(modelId, promptWithMemory);
          const newPromptUsed = optimizePromptForModel(modelId, v17Prompt);

          updateImageJob(jobId, { status: "generating" });
          setBackgroundJobs(readImageJobs());
          setStatus("generating");
          const generationBase = {
            modelId,
            imageUrls: selectedUrls,
            referenceImageUrl: singleBackMode ? null : resolveSelectedReferenceUrl(),
            useDefaultReference: !singleBackMode,
            aspectRatio: "2:3",
            resolution: "4K",
            format,
            outputSize: IMAGE_STUDIO_OUTPUT_SIZE,
            numImages: 1,
            overlay: {
              mode: deriveOverlayMode(showName, showNumber),
              placement: overlayPlacement,
              colorName,
              styleNumber,
              fontFamily,
              fontSize,
            },
          };
          const contractMode = productShotMode === "front-back-contract";
          const frontContractPrompt = `${activePrompt}${productShotViewDirective(
            productShotMode,
            "front"
          )}${studioFeedbackMemory}`;
          const backContractPrompt = `${activePrompt}${productShotViewDirective(
            productShotMode,
            "back"
          )}${studioFeedbackMemory}`;
          const leftPrompt = contractMode ? frontContractPrompt : promptWithMemory;
          const rightPrompt = contractMode ? backContractPrompt : v17Prompt;
          const leftPromptUsed = optimizePromptForModel(modelId, leftPrompt);
          const rightPromptUsed = optimizePromptForModel(modelId, rightPrompt);

          const [leftData, rightData] = await Promise.all([
            fetchJson("Generate Image A", "/api/generate", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                ...generationBase,
                prompt: leftPrompt,
              }),
            }),
            fetchJson("Generate Image B", "/api/generate", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                ...generationBase,
                prompt: rightPrompt,
              }),
            }),
          ]);

          const leftUrl = leftData.images?.[0]?.url;
          const rightUrl = rightData.images?.[0]?.url;
          if (!leftUrl || !rightUrl) throw new Error("A/B generator did not return both images.");

          const item: HistoryItem = {
            id: jobId,
            timestamp: Date.now(),
            modelId,
            prompt: contractMode
              ? `Front product shot prompt:\n${leftPromptUsed}\n\nBack product shot prompt:\n${rightPromptUsed}`
              : `Image A / current prompt:\n${oldPromptUsed}\n\nImage B / V1.7 prompt:\n${newPromptUsed}`,
            imageUrls: [leftUrl, rightUrl],
            referenceUrls: [...selectedUrls],
            sourceImageUrls: [...selectedUrls],
            aspect: "2:3",
            resolution: "4K",
            format,
            styleNumber: styleNumber.trim() || undefined,
            prompts: contractMode ? [leftPromptUsed, rightPromptUsed] : [oldPromptUsed, newPromptUsed],
            viewLabels: contractMode
              ? ["Front", "Back"]
              : [productShotMode === "single-back" ? "Back A" : "Front A", productShotMode === "single-back" ? "Back B" : "Front B"],
            abTest: {
              version: "1.7",
            },
          };
          setHistory((existing) => [item, ...existing.filter((run) => run.id !== item.id)].slice(0, 50));
          setCurrentId(jobId);
          localStorage.setItem(CURRENT_ID_KEY, jobId);
          updateImageJob(jobId, { status: "done" });
          setBackgroundJobs(readImageJobs());
          return { historyItem: item };
        } catch (err: any) {
          const message = err.message || "Generation failed";
          setError(message);
          updateImageJob(jobId, { status: "failed", error: message });
          setBackgroundJobs(readImageJobs());
          throw err;
        } finally {
          setLoading(false);
        }
      }
    );
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
    if (!params.sourceUrl || (!params.feedback.trim() && !params.issueKeys?.length)) return;
    const jobId = (crypto.randomUUID?.() || String(Date.now())).replace(/-/g, "");
    const sourceUrl = params.sourceUrl;
    const issueKeys = params.issueKeys ?? [];
    const note = buildFeedbackNote(issueKeys, params.feedback);
    const memoryItem = addFeedbackMemory({
      studio: "image",
      generationId: params.generationId,
      issueKeys,
      note: params.feedback,
      sourceUrl,
      resultUrl: params.resultUrl,
    });
    syncFeedbackMemoryToCloud(memoryItem);
    writeImageJob({
      id: jobId,
      status: "generating",
      label: "Feedback regeneration",
      startedAt: Date.now(),
      updatedAt: Date.now(),
    });
    setBackgroundJobs(readImageJobs());
    setLoading(true);
    setError(null);
    try {
      const markupUrl = params.markupDataUrl
        ? await uploadFeedbackMarkup(params.markupDataUrl)
        : null;
      const feedbackPrompt = [
        params.prompt.trim(),
        "COMPARE AND REGENERATE: use the original uploaded product reference as the source of truth and correct the previous generated result.",
        `Designer feedback: ${note}`,
        markupUrl
          ? "A red-marked feedback image is attached after the product reference. The red marks show problem areas only; do not render red marks, lines, circles, or annotations in the final image."
          : "",
        "Regenerate the product photo with the same clean ecommerce styling, but fix the noted differences. Preserve correct garment identity, silhouette, fabric texture, trims, hardware, proportions, and color accuracy from the uploaded product reference.",
        feedbackMemorySuffix("image"),
      ]
        .filter(Boolean)
        .join(" ");

      const data = await fetchJson("Generate feedback", "/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          modelId,
          prompt: feedbackPrompt,
          imageUrls: [sourceUrl, markupUrl].filter(Boolean),
          referenceImageUrl: resolveSelectedReferenceUrl(),
          aspectRatio: "2:3",
          resolution: "4K",
          format,
          outputSize: IMAGE_STUDIO_OUTPUT_SIZE,
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
      const item: HistoryItem = {
        id: jobId,
        timestamp: Date.now(),
        modelId,
        prompt: optimizePromptForModel(modelId, feedbackPrompt),
        imageUrls: data.images.map((i: any) => i.url),
        referenceUrls: [sourceUrl],
        sourceImageUrls: [sourceUrl],
        aspect: "2:3",
        resolution: "4K",
        format,
        styleNumber: styleNumber.trim() || undefined,
        feedbackNotes: [note],
        feedbackMemory: [
          {
            issueKeys,
            note: params.feedback.trim() || undefined,
            createdAt: Date.now(),
          },
        ],
      };
      const nextHistory = persistHistoryItem(item);
      setHistory(nextHistory);
      setCurrentId(jobId);
      updateImageJob(jobId, { status: "done" });
      setBackgroundJobs(readImageJobs());
    } catch (err: any) {
      setError(err.message || "Feedback regeneration failed");
      updateImageJob(jobId, { status: "failed", error: err.message || "Feedback regeneration failed" });
      setBackgroundJobs(readImageJobs());
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
      aspect: "2:3",
      resolution: "4K",
      format,
      styleNumber: styleNumber.trim() || undefined,
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
        imagePrompt = optimizePromptForModel(modelId, imagePrompt);
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
            referenceImageUrl: resolveSelectedReferenceUrl(),
            aspectRatio: "2:3",
            resolution: "4K",
            format,
            outputSize: IMAGE_STUDIO_OUTPUT_SIZE,
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
    <main className="flex min-h-screen flex-col bg-neutral-50 lg:h-screen">
      <StudioHeader
        active="image"
        title="Image Studio"
        subtitle="Generate clean product photos from uploaded garments."
        badge="V2.1"
        metrics={[
          { label: "Runs", value: history.length },
          {
            label: "Active",
            value: loading ? 1 : 0,
          },
        ]}
      />

      <div className="image-studio-layout min-h-0 flex-1">
        <div className="image-studio-setup min-h-0">
          <Sidebar
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
            frontIntakeUrl={frontIntakeUrl}
            backIntakeUrl={backIntakeUrl}
            onSetFrontIntake={(url) => {
              setFrontIntakeUrl(url);
              setPrompt("");
            }}
            onSetBackIntake={(url) => {
              setBackIntakeUrl(url);
              setPrompt("");
            }}
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
            defaultReferencePreview={selectedProductShotPath || PRODUCT_SHOT_REFERENCES[0]?.path || ""}
            productShotReferences={PRODUCT_SHOT_REFERENCES}
            selectedProductShotPath={selectedProductShotPath}
            onProductShotSelect={(path) => {
              setSelectedProductShotPath(path);
              setReferenceImageUrl(null);
            }}
            onReferenceReplace={replaceReferenceImage}
            onReferenceReset={resetReferenceImage}
            referenceUploading={referenceUploading}
          />
        </div>
        <div className="image-studio-workbench min-h-0">
          <div className="image-studio-brief min-h-0">
          <PromptPanel
            prompt={prompt}
            onPromptChange={setPrompt}
            numImages={2}
            onNumImagesChange={() => setNumImages(2)}
            onGenerate={runGeneration}
            analyzing={analyzing}
            loading={loading || uploading}
            disabled={
              (!frontIntakeUrl && !backIntakeUrl) ||
              (productShotMode === "front-back-contract" && (!frontIntakeUrl || !backIntakeUrl))
            }
            onBatchGenerate={runBatchGeneration}
            canBatch={selected.length >= 2}
            batchProgress={batchProgress}
            twoPiece={twoPiece}
            onTwoPieceChange={setTwoPiece}
            productShotMode={productShotMode}
            onProductShotModeChange={(mode) => {
              setProductShotMode(mode);
              setPrompt("");
            }}
            generateLabel={
              productShotMode === "single-front"
                ? "Generate Single Front"
                : productShotMode === "single-back"
                ? "Generate Single Back"
                : "Generate Front + Back"
            }
          />
          </div>
          <div className="image-studio-output min-h-0">
          <OutputPanel
            current={currentRun}
            history={history}
            onSelectHistory={setCurrentId}
            onFeedbackRegenerate={runFeedbackRegeneration}
            onAbPreferenceSelect={async ({ generationId, selectedImage, promptUsed }) => {
              await fetchJson("Save A/B preference", "/api/ab-events", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  user_id: getOrCreateUserId(),
                  generation_id: generationId,
                  selected_image: selectedImage,
                  prompt_used: promptUsed,
                  version: IMAGE_STUDIO_VERSION,
                }),
              });
              setHistory((existing) =>
                existing.map((item) =>
                  item.id === generationId && item.abTest
                    ? {
                        ...item,
                        abTest: {
                          ...item.abTest,
                          selectedImage,
                        },
                      }
                    : item
                )
              );
            }}
            uploadNames={uploadNames}
            onClearHistory={() => {
              setHistory([]);
              setCurrentId(null);
              localStorage.removeItem(CURRENT_ID_KEY);
              clearCloudHistory("image").catch((err) => {
                console.warn("[cloud-history] clear failed:", err);
              });
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
                setFrontIntakeUrl(sourceUrl);
                setBackIntakeUrl(null);
              }
              // No analyze-gate to clear anymore — unified Generate always
              // re-runs the analyzer itself. If the user clicks Generate after
              // Regenerate, the prompt they just dropped in will be overwritten.
              // That's intentional: the user's tweak survives as long as they
              // don't click Generate, which matches the rest of the flow.
            }}
          />
          </div>
        </div>
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
