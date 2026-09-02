"use client";

import { type CSSProperties, useEffect, useMemo, useRef, useState } from "react";
import Sidebar from "@/components/Sidebar";
import { type BatchProgress, type ProductShotMode } from "@/components/PromptPanel";
import type { RoutingControls } from "@/components/RoutingPanel";
import OutputPanel from "@/components/OutputPanel";
import RunLedger from "@/components/ledger/RunLedger";
import StageView from "@/components/ledger/StageView";
import Composer from "@/components/ledger/Composer";
import ErpPicker, { type ErpPhotoOption } from "@/components/ledger/ErpPicker";
import PaneSplitter from "@/components/ledger/PaneSplitter";
import { LEDGER_DEFAULT, clampLedgerWidth, readLedgerWidth } from "@/lib/pane-size";
import StudioDrawer from "@/components/ledger/StudioDrawer";
import { dropStrandedRuns, wantsSecondLook, type LedgerFilter } from "@/lib/run-pipeline";
import StudioHeader from "@/components/StudioHeader";
import type { HistoryItem, UploadedImage } from "@/components/types";
import { MODELS, type ModelId } from "@/lib/models";
import { STUDIO_BACKDROP_PATH } from "@/lib/studio-background";
import { IMAGE_STUDIO_OUTPUT_FORMAT as OUTPUT_FORMAT } from "@/lib/output-sizes";
import { styleNumberSurvives } from "@/lib/style-number-lifetime";
import { batchEligibility } from "@/lib/batch-eligibility";
import { canvasSummaryFrom, type CanvasSummary, type RoutingPayload } from "@/lib/routing-summary";
import {
  parseGarmentView,
  resolveShotMode,
  viewRowState,
  type GarmentView,
} from "@/lib/garment-view";
import type { BackgroundSnapReport } from "@/lib/background-snap";
import { styleNumbersForQueue } from "@/lib/style-from-filename";
import { buildBatchSummary } from "@/lib/batch-summary";
import type { CanvasChoice } from "@/lib/canvas-registry";
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

const HISTORY_KEY = "davidani_history_v1";
const CURRENT_ID_KEY = "davidani_image_current_run_v1";
const LEDGER_WIDTH_KEY = "image-studio:ledger-width";
const IMAGE_JOBS_KEY = "davidani_image_jobs_v1";
const USER_ID_KEY = "davidani_user_id_v1";
const IMAGE_STUDIO_VERSION = "2.3";
// 4:5 portrait — must match aspectRatio "4:5" sent at generation time, the
// server-side lock in lib/output-sizes.ts (the server ignores this client
// value, but keeping them equal avoids confusion), AND the canvas presets in
// public/product-shots/ which are all 2160x2700. A mismatched ratio causes the
// cover-resize in lib/fal.ts to crop the image (clipped sleeve tips).
const IMAGE_STUDIO_OUTPUT_SIZE = { width: 2160, height: 2700 } as const;

/**
 * How long a variant takes, per model, so a run in flight can show elapsed
 * against expected rather than an unbounded spinner. Measured over the 26 Aug
 * test set — GPT Image 2 was 112-136s across eleven runs; Nano Banana is the
 * fast one and is the reason the trade was worth stating.
 */
const EXPECTED_RUN_SECONDS: Partial<Record<ModelId, number>> = {
  "gpt-image": 120,
  "nano-banana": 50,
  "seedream-4": 60,
};

/** What actually ships — see lib/output-sizes.ts. */
const IMAGE_STUDIO_OUTPUT_FORMAT = OUTPUT_FORMAT;

/**
 * Clause appended to the BACK half of a front/back contract run, when that run
 * is chained off an already-rendered front image.
 *
 * The approved front and back canvases come from the same shoot, so framing,
 * scale, and background already match by construction. What they cannot pin is
 * how THIS render interpreted the garment — two independent samples of the same
 * SKU can land on slightly different blacks, sheens, or fabric weights. Handing
 * the finished front render to the back call closes that gap.
 *
 * The wording is deliberately narrow. The front render is a colour and finish
 * reference ONLY; without saying so explicitly the model treats the most
 * garment-like input as a layout source and returns a second front view.
 */
const SIBLING_MATCH_CLAUSE =
  " Colour and finish continuity: the final attached image is the already-approved FRONT render of this exact " +
  "same physical garment, produced in this same session. Match its colour, tone, depth of black or dye, sheen, " +
  "fabric weight, texture rendition, embroidery and print colour, and hardware finish exactly, so the two images " +
  "read as one SKU photographed once. Use it for colour and finish ONLY. It is NOT a layout, view, orientation, " +
  "or composition source: do not copy its front-facing garment structure, do not reproduce a front view, and do " +
  "not turn the garment around. This output must remain a BACK view.";

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
  return ` Product shot side directive: ${viewText}${contractText} Output one clean 2160x2700 vertical product-shot image, not a collage and not a side-by-side layout.`;
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
/**
 * How long the browser waits on one generate call before giving up on it.
 *
 * The route caps itself at 300s, so anything past that is a connection nobody
 * is going to answer — a laptop that slept mid-run, a tab the browser paused.
 * Without this the placeholder card painted forever; with it the call fails
 * through the same path as any other error and the card is dropped.
 */
const GENERATE_TIMEOUT_MS = 330_000;

async function fetchJson(label: string, input: string, init?: RequestInit): Promise<any> {
  let res: Response;
  try {
    res = await fetch(input, init);
  } catch (err: any) {
    if (err?.name === "TimeoutError" || err?.name === "AbortError") {
      throw new Error(`${label}: no answer after ${Math.round(GENERATE_TIMEOUT_MS / 1000)}s. Try again.`);
    }
    throw err;
  }
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
  /**
   * GPT Image 2, not Nano Banana.
   *
   * Measured on six back-mode runs of one SKU, same input, prompt and canvas:
   * Nano Banana put the garment on a masonry ledge copied from the intake
   * photo's wall in 5 of 6; GPT Image 2 was clean 6 of 6, with the correct
   * back view in all six. Seedream rendered the FRONT in all six and burned
   * prompt text into two of them. The cost is speed — roughly 110s a variant
   * against 45s — which is the right trade when the fast one needs a reshoot
   * five times out of six.
   */
  const [modelId, setModelId] = useState<ModelId>("gpt-image");
  // Aspect, resolution, format and variant-count state used to live here and
  // back four sidebar controls. None of them reached a request: every call
  // hardcodes 4:5 / 4K, /api/finalize-image hardcodes JPEG, and both variants
  // are always numImages: 1. The controls are gone; the values below are the
  // Image Studio standard, written once.
  // productShotMode is no longer state. It was three cards above the prompt
  // asking for decisions that are properties of the upload; it is derived
  // below and shown as a correctable row in the routing rail instead. See
  // lib/garment-view.ts.

  // Style number — the ERP routing key, typed in the Style section.
  const [styleNumber, setStyleNumber] = useState<string>("");
  /**
   * Last front photo the style number was entered against.
   *
   * The style number used to outlive its photo: nothing cleared it, so loading
   * the next SKU without retyping sent that garment through the PREVIOUS
   * style's ERP category and — worse — its gallery contact sheet, meaning the
   * garment was described from a different style's photographs. The render
   * came back confident, plausible and wrong, with nothing on screen saying
   * which style it had actually routed as.
   *
   * Cleared only when one front photo REPLACES another. Typing the style
   * before uploading is a normal order of operations and has to survive, so a
   * first upload (no previous photo) leaves the field alone. Emptying the slot
   * is not a SKU change either — this tracks the last non-empty photo, so the
   * Remove-then-Upload loop still counts as a replacement.
   */
  const styleNumberPhoto = useRef<string | null>(null);

  // Upload state
  const [uploads, setUploads] = useState<UploadedImage[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [frontIntakeUrl, setFrontIntakeUrl] = useState<string | null>(null);
  const [backIntakeUrl, setBackIntakeUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  // See styleNumberPhoto above, and lib/style-number-lifetime.ts for the rule
  // and the cases it has to get right.
  useEffect(() => {
    if (!styleNumberSurvives(styleNumberPhoto.current, frontIntakeUrl)) {
      setStyleNumber("");
    }
    if (frontIntakeUrl) styleNumberPhoto.current = frontIntakeUrl;
  }, [frontIntakeUrl]);

  /** Which side the analyzer read off the intake photo. */
  const [detectedView, setDetectedView] = useState<GarmentView>("unknown");
  /**
   * Set only when the operator corrects the rail's Side row.
   *
   * This is the one decision the photo cannot supply: "I gave you a front
   * photo, render me the back" is a supported run — the side directive tells
   * the model to infer the hidden side — so detection alone would remove a
   * real capability.
   */
  const [viewOverride, setViewOverride] = useState<"front" | "back" | null>(null);

  // Style reference (image 2). Image Studio presets live under
  // public/product-shots; custom uploads override the selected preset.
  // How the studio arrived at this render, straight from /api/analyze. Drives
  // the Routing section, which replaced the preset grid.
  // Batch reports are not errors. They can describe a run that mostly worked,
  // or one that worked entirely and merely used a weaker path for some rows —
  // so they get their own neutral toast rather than the red one.
  const [notice, setNotice] = useState<string | null>(null);
  const [routing, setRouting] = useState<RoutingPayload | null>(null);
  /**
   * The analyze response's canvas map, kept whole.
   *
   * Stored rather than reduced on arrival because the Side row can now change
   * after the analyze: reducing early meant toggling Front/Back either showed
   * a stale canvas or forced a second analyze of the same photo.
   */
  const [canvasByView, setCanvasByView] = useState<
    Partial<Record<"front" | "back", CanvasSummary>> | null
  >(null);
  /**
   * True while the pre-flight analyze is in flight. Its own flag rather than
   * `analyzing`, which is written only by analyzeProduct() — a function with no
   * call sites — so the panel's "Working out the category and canvas…" state
   * was unreachable.
   */
  const [routingPending, setRoutingPending] = useState(false);
  const [referenceImageUrl, setReferenceImageUrl] = useState<string | null>(null);
  const [referenceUploading, setReferenceUploading] = useState(false);
  // NOTE: team-saved canvas presets went with the preset grid. /api/user-references
  // and everything already stored behind it are left untouched — nothing is
  // deleted, and restoring the feature is a UI change, not a data recovery.

  // Prompt & generation
  const [prompt, setPrompt] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reference-is-a-two-piece-set toggle. User must set this themselves (the
  // reference photo alone isn't reliably auto-classifiable), and when true we
  // route Analyze through the four-field coordinated-set analyzer in lib/fal.
  const [twoPiece, setTwoPiece] = useState<boolean>(false);

  /**
   * Resolve the plan BEFORE Generate, and show it.
   *
   * This began as a fire-and-forget cache warmer: it called /api/analyze on a
   * debounce and threw the response away, because the server-side vision cache
   * was the only thing it wanted. But the response is the entire routing
   * decision — category, who decided it, described-from, canvas, fallbacks —
   * and discarding it is why the centre pane could tell people to "check the
   * routing" against a panel that was empty until after they had generated.
   * Step two of a three-step instruction could only happen after step three.
   *
   * So the response is kept. The cache still gets warmed; that was never in
   * conflict with reading the body.
   *
   * styleNumber is in the dependency list, which it was not before. The body
   * already sent it, so typing a style number changed what the server would
   * answer while the effect never re-ran — the entry primed into the cache was
   * the style-less one, and that is the entry that decides which extractor
   * runs. The warmer was priming the wrong answer.
   *
   * The plan is deliberately NOT a gate. Generate re-analyzes on click and uses
   * that result; this only decides what the rail shows. A pre-flight that could
   * block Generate would turn a debounce race into an unpressable button.
   */
  const planRequestSeq = useRef(0);
  useEffect(() => {
    // Every uploaded photo, regardless of side. This used to select urls by
    // productShotMode, which is now derived FROM this call's answer — feeding
    // it back in here would re-analyze the same photo the moment a back was
    // detected.
    const planUrls = [frontIntakeUrl, backIntakeUrl].filter(
      (url): url is string => !!url
    );

    if (!planUrls.length) {
      // No photo, no plan. Clear rather than leaving the previous garment's
      // routing on screen next to an empty intake.
      planRequestSeq.current += 1;
      setRouting(null);
      setCanvasByView(null);
      setDetectedView("unknown");
      setViewOverride(null);
      setRoutingPending(false);
      return;
    }

    const timer = setTimeout(() => {
      // Every request claims a sequence number and only the newest may write.
      // The effect re-fires on each keystroke in the style field, so responses
      // can and do land out of order; without this the rail can settle on the
      // answer for a style number the user has already finished editing.
      const seq = ++planRequestSeq.current;
      setRoutingPending(true);
      fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageUrl: planUrls[0],
          imageUrls: planUrls,
          twoPiece,
          // Lets /api/analyze settle the category from the ERP
          // instead of inferring it from the photo (lib/erp-category.ts).
          styleNumber: styleNumber.trim() || undefined,
        }),
      })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (seq !== planRequestSeq.current) return;
          if (!data?.ok) {
            // A failed pre-flight is not a failed run — Generate re-analyzes
            // and reports its own errors. Drop the stale plan and say nothing.
            setRouting(null);
            setCanvasByView(null);
            return;
          }
          setRouting((data.routing as RoutingPayload | undefined) ?? null);
          setCanvasByView(
            (data.canvas as Partial<Record<"front" | "back", CanvasSummary>> | undefined) ?? null
          );
          setDetectedView(parseGarmentView(data.detected?.view));
        })
        .catch(() => {})
        .finally(() => {
          if (seq === planRequestSeq.current) setRoutingPending(false);
        });
    }, 1200);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frontIntakeUrl, backIntakeUrl, twoPiece, styleNumber, referenceImageUrl]);

  /**
   * The mode the run will use, and what the rail's Side row says about it.
   *
   * Derived, not stored: two photos means a contract run and one photo means
   * whichever side the analyzer saw, unless the operator corrected it.
   */
  const shotModeInputs = {
    hasFrontPhoto: Boolean(frontIntakeUrl),
    hasBackPhoto: Boolean(backIntakeUrl),
    detected: detectedView,
    override: viewOverride,
  };
  const productShotMode = resolveShotMode(shotModeInputs);
  const viewRow = viewRowState(shotModeInputs);
  const routingCanvas = useMemo(
    () => canvasSummaryFrom(canvasByView ?? undefined, viewRow.view, Boolean(referenceImageUrl)),
    [canvasByView, viewRow.view, referenceImageUrl]
  );

  // The three-value GarmentMode alias is gone with the pills that rendered it.
  // Image Studio only ever had two of the three (one photo of a coordinated
  // outfit, or one garment), which is the boolean `twoPiece` already is; the
  // rail's Garment row sets it directly.

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

  /**
   * Split Ledger shell state.
   *
   * The rail and the output panel are still mounted — as drawers. Everything
   * they do that the ledger does not (canvas override, output settings,
   * feedback regeneration, batch grids) is real work that would be lost by
   * deleting them, and neither is touched often enough to hold permanent
   * space between the operator and the render.
   */
  const [ledgerFilter, setLedgerFilter] = useState<LedgerFilter>("all");
  /**
   * How wide the operator has dragged the ledger.
   *
   * Starts at the default rather than reading localStorage during render:
   * the server has no localStorage, so seeding from it directly would make
   * the first client render disagree with the markup it is hydrating.
   */
  const [ledgerWidth, setLedgerWidth] = useState(LEDGER_DEFAULT);
  /** Which intake slot the ERP gallery search is open for, if any. */
  const [erpSlot, setErpSlot] = useState<"front" | "back" | null>(null);

  useEffect(() => {
    const saved = readLedgerWidth(localStorage.getItem(LEDGER_WIDTH_KEY));
    if (saved !== null) setLedgerWidth(clampLedgerWidth(saved, window.innerWidth));
  }, []);

  const [setupOpen, setSetupOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);

  // Load history on mount
  useEffect(() => {
    try {
      // Anything still pending in storage has no request behind it: the call
      // died with the previous page. Sweep it rather than restore a card that
      // would paint forever.
      const parsed = dropStrandedRuns(readHistory());
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
      const parsed = dropStrandedRuns(readHistory());
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

  // A tab left open through a sleep never remounts, so the load-time sweep
  // never runs for it. Re-check whenever the tab comes back into focus.
  useEffect(() => {
    const sweep = () => setHistory((existing) => dropStrandedRuns(existing));
    window.addEventListener("focus", sweep);
    return () => window.removeEventListener("focus", sweep);
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

  /** Absolute URL for a canvas path returned by the analyzer's registry. */
  function absoluteCanvasUrl(path: string): string {
    if (typeof window === "undefined") return path;
    return new URL(path, window.location.origin).toString();
  }

  /**
   * The only manual canvas path left. The preset grid used to sit behind this
   * too, offering a canvas choice that outranked the routed one — which stopped
   * making sense once the category came from the ERP and the style code. The
   * useful correction is to the style number, not to the canvas that fell out
   * of it, so an uploaded canvas is now the sole override.
   */
  function resolveSelectedReferenceUrl(): string | null {
    return referenceImageUrl;
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

  /**
   * Take a photo out of the ERP gallery and into an intake slot.
   *
   * The chosen frame is fetched at full resolution server-side and uploaded to
   * fal, so it becomes an ordinary intake URL — the generation path hands image
   * URLs to the model, and an ERP URL behind a session cookie is not one it
   * could fetch.
   *
   * The style number comes along with it. That is half the point: a photo
   * dragged in from the desktop loses the code on the way, and the code is
   * what buys the approved flat lay instead of the empty sweep.
   */
  async function importErpPhoto(slot: "front" | "back", photo: ErpPhotoOption, style: string) {
    const data = await fetchJson("ERP photo", "/api/erp/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ src: photo.full }),
    });
    const added: UploadedImage = { url: data.url, name: data.name };
    setUploads((list) => [...list, added]);
    setSelected((list) => [...list, added.url]);
    if (slot === "front") setFrontIntakeUrl(added.url);
    else setBackIntakeUrl(added.url);
    if (!styleNumber.trim()) setStyleNumber(style);
    setPrompt("");
    setError(null);
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
          twoPiece,
          // Lets /api/analyze settle the category from the ERP
          // instead of inferring it from the photo (lib/erp-category.ts).
          styleNumber: styleNumber.trim() || undefined,
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
          // The analyzer now chooses the canvas: it infers the garment category
          // and returns the approved canvas per view, falling back to the empty
          // #edeeee sweep for a category with no approved flat lay. It returns
          // the prompt assembled BOTH ways, because one run can need both — a
          // contract run on a category with a front canvas but no back one
          // renders front in "preserve" and back in "backdrop".
          const analyzeData = await fetchJson("Analyze", "/api/analyze", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              imageUrl: selectedUrls[0],
              imageUrls: selectedUrls,
                  twoPiece,
          // Lets /api/analyze settle the category from the ERP
          // instead of inferring it from the photo (lib/erp-category.ts).
          styleNumber: styleNumber.trim() || undefined,
            }),
          });

          const singleBackMode = productShotMode === "single-back";
          const contractMode = productShotMode === "front-back-contract";
          const primaryView: "front" | "back" = singleBackMode ? "back" : "front";

          // An uploaded canvas wins over routing; nothing else does.
          const overrideUrl = resolveSelectedReferenceUrl();
          const routed = analyzeData.canvas as
            | { front: CanvasChoice; back: CanvasChoice }
            | undefined;
          const canvasFor = (view: "front" | "back"): CanvasChoice | null =>
            routed ? routed[view] : null;

          // Prompt must describe the canvas actually sent, so mode and canvas
          // are always read from the same CanvasChoice.
          const promptForView = (view: "front" | "back"): string => {
            const choice: CanvasChoice | null = canvasFor(view);
            const byMode = analyzeData.promptByMode as
              | Record<"preserve" | "backdrop", string>
              | undefined;
            if (overrideUrl) {
              // Manual canvases are all real flat lays, so preserve is correct.
              return String(byMode?.preserve || analyzeData.prompt || "").trim();
            }
            if (choice && byMode?.[choice.mode]) return String(byMode[choice.mode]).trim();
            return String(analyzeData.prompt || "").trim();
          };
          const canvasUrlFor = (view: "front" | "back"): string | null => {
            if (overrideUrl) return overrideUrl;
            const choice = canvasFor(view);
            return choice ? absoluteCanvasUrl(choice.path) : resolveSelectedReferenceUrl();
          };

          const activePrompt = promptForView(primaryView);
          if (!activePrompt) throw new Error("Analyzer returned empty prompt");

          // Feed the Routing panel. These five values were already being
          // computed on every analyze and thrown into console.log; the rail is
          // the only place they were ever going to be useful.
          const runRouting = (analyzeData.routing as RoutingPayload | undefined) ?? null;
          const runCanvasSummary = canvasSummaryFrom(
            routed,
            primaryView,
            Boolean(overrideUrl)
          );
          setRouting(runRouting);
          setCanvasByView(
            (analyzeData.canvas as Partial<Record<"front" | "back", CanvasSummary>>) ?? null
          );

          const studioFeedbackMemory = feedbackMemorySuffix("image");
          const promptWithSideDirective = `${activePrompt}${productShotViewDirective(productShotMode)}`;
          setPrompt(promptWithSideDirective);

          // The single locked recipe: analyzer fields folded into
          // buildTwoImagePrompt (lib/fal.ts), plus the side directive and any
          // feedback memory. This used to be one arm of an A/B against the
          // shorter buildV17Prompt template; that test is settled, so both
          // variants below now run this prompt and differ only by sampling.
          const promptWithMemory = `${promptWithSideDirective}${studioFeedbackMemory}`;
          const promptUsed = optimizePromptForModel(modelId, promptWithMemory, "product-shot");

          updateImageJob(jobId, { status: "generating" });
          setBackgroundJobs(readImageJobs());
          setStatus("generating");
          const generationBase = {
            modelId,
            imageUrls: selectedUrls,
            // Never null in practice: the registry falls back to the empty
            // #edeeee sweep rather than returning nothing, because a missing
            // canvas puts the user's phone photo at image_urls[0] and the
            // prompt then preserves the floor it was shot on.
            // Contract mode overrides this per-call below.
            referenceImageUrl: canvasUrlFor(primaryView),
            useDefaultReference: true,
            aspectRatio: "4:5",
            resolution: "4K",
            // Image Studio is a flat-lay product studio. Without this the
            // server falls back to Model Studio's prefix, which explicitly
            // forbids flat lays (see PromptIntent in lib/prompt-strategy).
            intent: "product-shot",
            format: IMAGE_STUDIO_OUTPUT_FORMAT,
            outputSize: IMAGE_STUDIO_OUTPUT_SIZE,
            // Show native model output immediately; the 2160x2700 final is
            // produced by /api/finalize-image in the background below.
            deferResize: true,
            numImages: 1,
          };
          const frontContractPrompt = `${promptForView("front")}${productShotViewDirective(
            productShotMode,
            "front"
          )}${studioFeedbackMemory}`;
          const backContractPrompt = `${promptForView("back")}${productShotViewDirective(
            productShotMode,
            "back"
          )}${studioFeedbackMemory}`;
          // Contract mode genuinely needs two different prompts (front truth vs
          // back truth). Every other mode sends the same prompt twice and
          // relies on the model's own sampling for two takes to pick from.
          const leftPrompt = contractMode ? frontContractPrompt : promptWithMemory;
          const rightPrompt = contractMode ? backContractPrompt : promptWithMemory;
          const leftPromptUsed = contractMode
            ? optimizePromptForModel(modelId, leftPrompt, "product-shot")
            : promptUsed;
          // Contract mode appends SIBLING_MATCH_CLAUSE to the back call below.
          // Record what is actually sent, so the history prompt matches the run.
          const rightPromptUsed = contractMode
            ? optimizePromptForModel(
                modelId,
                `${rightPrompt}${SIBLING_MATCH_CLAUSE}`,
                "product-shot"
              )
            : promptUsed;

          // The run enters history NOW, not when both variants land. See
          // HistoryItem.pending: the ~110 seconds in between used to have
          // nothing to show, and the ledger's newest card was the previous run.
          const pendingItem: HistoryItem = {
            id: jobId,
            timestamp: Date.now(),
            modelId,
            prompt: promptUsed,
            imageUrls: [],
            referenceUrls: [...selectedUrls],
            sourceImageUrls: [...selectedUrls],
            aspect: "4:5",
            resolution: "4K",
            format: IMAGE_STUDIO_OUTPUT_FORMAT,
            styleNumber: styleNumber.trim() || undefined,
            routing: runRouting,
            routingCanvas: runCanvasSummary,
            viewLabels: contractMode
              ? ["Front", "Back"]
              : [
                  singleBackMode ? "Back · Variant 1" : "Front · Variant 1",
                  singleBackMode ? "Back · Variant 2" : "Front · Variant 2",
                ],
            pending: {
              variants: 2,
              startedAt: Date.now(),
              // Contract runs pay for two renders end to end, because the back
              // call waits for the front. One model's worth of budget made the
              // back trip "longer than usual" at roughly the halfway mark.
              expectedSeconds: (EXPECTED_RUN_SECONDS[modelId] ?? 110) * (contractMode ? 2 : 1),
            },
          };
          setHistory((existing) => [
            pendingItem,
            ...existing.filter((run) => run.id !== jobId),
          ].slice(0, 50));
          setCurrentId(jobId);
          localStorage.setItem(CURRENT_ID_KEY, jobId);

          /** Show a variant on the stage the moment it lands, not when its sibling does. */
          const landVariant = (index: number, url: string) =>
            setHistory((existing) =>
              existing.map((run) => {
                if (run.id !== jobId) return run;
                const imageUrls = [...run.imageUrls];
                imageUrls[index] = url;
                return { ...run, imageUrls };
              })
            );

          /**
           * Start a chained slot's clock at the moment its call is issued.
           *
           * Only contract mode needs this. Its back render is queued behind the
           * front, so until this it was counting the front's wait as its own.
           */
          const startSlotClock = (index: number, expectedSeconds: number) =>
            setHistory((existing) =>
              existing.map((run) => {
                if (run.id !== jobId || !run.pending) return run;
                const slots = [...(run.pending.slots ?? [])];
                while (slots.length <= index) slots.push(null);
                slots[index] = { startedAt: Date.now(), expectedSeconds };
                return { ...run, pending: { ...run.pending, slots } };
              })
            );

          const generateVariant = (label: string, body: Record<string, unknown>) =>
            fetchJson(label, "/api/generate", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ ...generationBase, ...body }),
              signal: AbortSignal.timeout(GENERATE_TIMEOUT_MS),
            });

          let leftData: any;
          let rightData: any;
          if (contractMode) {
            // Chained, not parallel. The back render is the SAME SKU as the
            // front, so it waits for the front and then matches its colour and
            // finish. Costs one extra round-trip of latency and buys front/back
            // pairs that read as one shoot instead of two independent samples.
            leftData = await generateVariant("Generate front", { prompt: leftPrompt });
            const frontUrl = leftData.images?.[0]?.url;
            if (frontUrl) landVariant(0, frontUrl);
            // The back call goes out now, so its clock starts now — and from
            // here it is one render, not two.
            startSlotClock(1, EXPECTED_RUN_SECONDS[modelId] ?? 110);
            rightData = await generateVariant("Generate back", {
              // Contract mode's second call is the BACK render, so it needs the
              // back canvas. It was inheriting generationBase's front canvas,
              // which asked the model to match a front-facing composition while
              // rendering a back-facing garment.
              referenceImageUrl: canvasUrlFor("back"),
              // Front render goes last so it stays a trailing reference rather
              // than displacing the user's own garment photos.
              imageUrls: frontUrl ? [...selectedUrls, frontUrl] : selectedUrls,
              prompt: frontUrl ? `${rightPrompt}${SIBLING_MATCH_CLAUSE}` : rightPrompt,
            });
          } else {
            // Two independent takes of one prompt — genuinely parallel.
            [leftData, rightData] = await Promise.all([
              generateVariant("Generate variant 1", { prompt: leftPrompt }).then((d) => {
                const url = d.images?.[0]?.url;
                if (url) landVariant(0, url);
                return d;
              }),
              generateVariant("Generate variant 2", { prompt: rightPrompt }).then((d) => {
                const url = d.images?.[0]?.url;
                if (url) landVariant(1, url);
                return d;
              }),
            ]);
          }

          const leftUrl = leftData.images?.[0]?.url;
          const rightUrl = rightData.images?.[0]?.url;
          if (!leftUrl || !rightUrl) throw new Error("Generator did not return both variants.");

          const item: HistoryItem = {
            id: jobId,
            timestamp: Date.now(),
            modelId,
            prompt: contractMode
              ? `Front product shot prompt:\n${leftPromptUsed}\n\nBack product shot prompt:\n${rightPromptUsed}`
              : promptUsed,
            imageUrls: [leftUrl, rightUrl],
            referenceUrls: [...selectedUrls],
            sourceImageUrls: [...selectedUrls],
            aspect: "4:5",
            resolution: "4K",
            format: IMAGE_STUDIO_OUTPUT_FORMAT,
            styleNumber: styleNumber.trim() || undefined,
            // Provenance. Previously the rail rendered these live and the next
            // run overwrote them, so a finished image carried no record of the
            // canvas it landed on or whether it was described from the ERP
            // gallery. Stored with the run that produced it.
            routing: runRouting,
            routingCanvas: runCanvasSummary,
            prompts: contractMode ? [leftPromptUsed, rightPromptUsed] : [promptUsed, promptUsed],
            viewLabels: contractMode
              ? ["Front", "Back"]
              : [
                  singleBackMode ? "Back · Variant 1" : "Front · Variant 1",
                  singleBackMode ? "Back · Variant 2" : "Front · Variant 2",
                ],
            // Reuses the two-up picker UI. Both variants now come from the
            // same prompt, so this is a "pick your favourite take" chooser
            // rather than a prompt experiment.
            abTest: {
              version: "2.3",
            },
            // Both variants are in hand — the finalize pass below only swaps
            // the URLs for locked-size ones.
            pending: undefined,
          };
          // Native images render right away; the locked-size finals swap in
          // silently once /api/finalize-image returns (fallback: keep native).
          setHistory((existing) => [item, ...existing.filter((run) => run.id !== item.id)].slice(0, 50));
          setCurrentId(jobId);
          localStorage.setItem(CURRENT_ID_KEY, jobId);
          // Finalize now also carries back what the #edeeee snap did. The
          // report is produced during this pass and nowhere else, so it has to
          // ride along here or it stays in the server log.
          const finalize = (url: string): Promise<{ url: string; snap: BackgroundSnapReport | null }> =>
            fetchJson("Finalize image", "/api/finalize-image", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ imageUrl: url }),
            })
              .then((d) => ({
                url: typeof d.url === "string" && d.url ? d.url : url,
                snap: (d.snap as BackgroundSnapReport | null) ?? null,
              }))
              // Finalize failing is already handled by keeping the native
              // image; a null snap says "not measured" rather than "fine".
              .catch(() => ({ url, snap: null }));
          const [finalLeft, finalRight] = await Promise.all([
            finalize(leftUrl),
            finalize(rightUrl),
          ]);
          const finalItem: HistoryItem = {
            ...item,
            imageUrls: [finalLeft.url, finalRight.url],
            backgroundSnaps: [finalLeft.snap, finalRight.snap],
            // The run is no longer in flight; drop the placeholder marker so
            // the ledger stops badging it and the stage stops dithering.
            pending: undefined,
          };
          setHistory((existing) =>
            existing.map((run) => (run.id === jobId ? finalItem : run))
          );
          updateImageJob(jobId, { status: "done" });
          setBackgroundJobs(readImageJobs());
          return { historyItem: finalItem };
        } catch (err: any) {
          const message = err.message || "Generation failed";
          setError(message);
          // Drop the placeholder. A run that never produced an image is not a
          // run worth keeping in the ledger, and leaving it would strand a card
          // painting forever.
          setHistory((existing) =>
            existing.filter((run) => !(run.id === jobId && run.pending))
          );
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
          aspectRatio: "4:5",
          resolution: "4K",
          intent: "product-shot",
          format: IMAGE_STUDIO_OUTPUT_FORMAT,
          outputSize: IMAGE_STUDIO_OUTPUT_SIZE,
          numImages: 1,
        }),
      });
      const item: HistoryItem = {
        id: jobId,
        timestamp: Date.now(),
        modelId,
        prompt: optimizePromptForModel(modelId, feedbackPrompt, "product-shot"),
        imageUrls: data.images.map((i: any) => i.url),
        referenceUrls: [sourceUrl],
        sourceImageUrls: [sourceUrl],
        aspect: "4:5",
        resolution: "4K",
        format: IMAGE_STUDIO_OUTPUT_FORMAT,
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
    // Checked here as well as on the button. The button is the only way in
    // today, but batch produces silently-wrong output in the modes it blocks
    // (front shots for a back run), and that is not a failure mode worth
    // leaving one prop-wiring mistake away from happening.
    const eligibility = batchEligibility(productShotMode, selected.length);
    if (!eligibility.enabled) {
      if (eligibility.reason) setError(eligibility.reason);
      return;
    }

    // Per-item style numbers, read from each upload's original filename. One
    // shared style field is why batch ran on the pre-ERP path: stamping every
    // queued image with the same style would hand back a confidently wrong
    // category for all but the first. A filename is per-item and already on
    // disk. It is INFERRED rather than asserted — see lib/style-from-filename.
    const queue = styleNumbersForQueue([...selected], uploadNames);
    const failures: { url: string; error: string }[] = [];
    /** Rows where the filename's code disagreed with the ERP and lost. */
    const conflicts: { filename: string; wanted: string; kept: string }[] = [];
    let matched = 0;
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
      aspect: "4:5",
      resolution: "4K",
      format: IMAGE_STUDIO_OUTPUT_FORMAT,
      styleNumber: styleNumber.trim() || undefined,
      prompts: [],
      batch: true,
      // Batch already created its row up front; this is what makes the row
      // say so. One slot per queued photo, so the card fills in as the queue
      // drains rather than staying empty until the last one lands.
      pending: {
        variants: queue.length,
        startedAt: Date.now(),
        expectedSeconds: (EXPECTED_RUN_SECONDS[modelId] ?? 110) * queue.length,
      },
    };
    setHistory((h) => [batchItem, ...h]);
    setCurrentId(batchId);

    for (let i = 0; i < queue.length; i++) {
      const { url: sourceUrl, style: itemStyle, filename } = queue[i];
      if (itemStyle) matched++;

      // --- Analyze this specific image ---
      setBatchProgress((p) => (p ? { ...p, stage: "analyzing" } : p));
      let imagePrompt: string;
      let promptForDisplay = "";
      // Routed per image, not once for the batch: a batch can mix a bomber, a
      // dress and a skirt, and each needs its own canvas.
      let imageCanvasUrl: string | null = null;
      let itemRouting: RoutingPayload | null = null;
      let itemCanvasSummary: CanvasSummary | null = null;
      try {
        const analyzeData = await fetchJson("Analyze", "/api/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          // This image's own style number, not the shared field. Absent when
          // the filename carries no code, which lands exactly where batch used
          // to sit for every row.
          body: JSON.stringify({
            imageUrl: sourceUrl,
              twoPiece,
            styleNumber: itemStyle ?? undefined,
            styleNumberTrust: "inferred",
          }),
        });
        const demoted = (analyzeData.routing as RoutingPayload & {
          demoted?: { prefix: string; wanted: string; kept: string } | null;
        })?.demoted;
        if (demoted) {
          conflicts.push({ filename, wanted: demoted.wanted, kept: demoted.kept });
        }
        // Batch routes every photo separately, so the provenance is per photo.
        itemRouting = (analyzeData.routing as RoutingPayload | undefined) ?? null;
        itemCanvasSummary = canvasSummaryFrom(
          analyzeData.canvas as Partial<Record<"front" | "back", CanvasSummary>> | undefined,
          "front",
          Boolean(resolveSelectedReferenceUrl())
        );
        const batchFront = (analyzeData.canvas as { front?: CanvasChoice } | undefined)?.front;
        const batchByMode = analyzeData.promptByMode as
          | Record<"preserve" | "backdrop", string>
          | undefined;
        if (resolveSelectedReferenceUrl()) {
          imageCanvasUrl = resolveSelectedReferenceUrl();
          imagePrompt = String(batchByMode?.preserve || analyzeData.prompt || "").trim();
        } else if (batchFront) {
          imageCanvasUrl = absoluteCanvasUrl(batchFront.path);
          imagePrompt = String(
            batchByMode?.[batchFront.mode] || analyzeData.prompt || ""
          ).trim();
        } else {
          imageCanvasUrl = resolveSelectedReferenceUrl();
          imagePrompt = String(analyzeData.prompt || "").trim();
        }
        if (!imagePrompt) throw new Error("Analyzer returned empty prompt");
        // Do NOT overwrite imagePrompt with the optimized version. /api/generate
        // runs optimizePromptForModel server-side on whatever it receives, so
        // prefixing client-side too stacked the whole prefix twice in batch
        // mode (single-run mode has always sent the raw prompt and let the
        // server do it once). The optimized string is display-only, matching
        // what single-run mode records in history.
        // Batch is gated to single-front, so the directive is the front one —
        // but it is derived from the mode rather than hardcoded, so that if
        // batch ever unlocks another mode this line does not quietly stay
        // wrong. Feedback memory was missing entirely: single runs append it
        // and batch did not, so batch reproduced corrections the studio had
        // already been taught. That is why an operator ends up back on
        // one-at-a-time runs after any correction.
        imagePrompt = `${imagePrompt}${productShotViewDirective(productShotMode)}${feedbackMemorySuffix(
          "image"
        )}`;
        promptForDisplay = optimizePromptForModel(modelId, imagePrompt, "product-shot");
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
            referenceImageUrl: imageCanvasUrl,
            aspectRatio: "4:5",
            resolution: "4K",
            // Image Studio is a flat-lay product studio. Without this the
            // server falls back to Model Studio's prefix, which explicitly
            // forbids flat lays (see PromptIntent in lib/prompt-strategy).
            intent: "product-shot",
            format: IMAGE_STUDIO_OUTPUT_FORMAT,
            outputSize: IMAGE_STUDIO_OUTPUT_SIZE,
            // Batch skips /api/finalize-image (it resizes inline), so ask for
            // the #edeeee snap here to match single-run output.
            normalizeBackground: true,
            // Always 1 variant per input in batch mode (see design decisions).
            numImages: 1,
          }),
        });

        const outputUrls: string[] = data.images.map((x: any) => x.url);
        // Batch resizes inside /api/generate, so its reports come back on the
        // generate response rather than from finalize. Padded to the image
        // count so the array stays index-aligned even if the server sends
        // fewer (a non-normalized model would send none at all).
        const outputSnaps: Array<BackgroundSnapReport | null> = outputUrls.map(
          (_, i) => (data.backgroundSnaps as BackgroundSnapReport[] | undefined)?.[i] ?? null
        );
        // Append the new output(s) to the shared batch run. Using the
        // functional setHistory form ensures we don't clobber earlier
        // appends from this same loop.
        setHistory((h) =>
          h.map((item) =>
            item.id === batchId
              ? {
                  ...item,
                  prompt: item.prompt || promptForDisplay,
                  imageUrls: [...item.imageUrls, ...outputUrls],
                  referenceUrls: [...item.referenceUrls, sourceUrl],
                  prompts: [...(item.prompts ?? []), promptForDisplay],
                  // Kept parallel to imageUrls, like prompts. A batch can mix a
                  // bomber, a dress and a skirt, so a run-level answer would be
                  // wrong for most rows.
                  routings: [
                    ...(item.routings ?? []),
                    { routing: itemRouting, canvas: itemCanvasSummary },
                  ],
                  backgroundSnaps: [...(item.backgroundSnaps ?? []), ...outputSnaps],
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
      // The queue has drained; the row is a finished run now.
      return h.map((item) => (item.id === batchId ? { ...item, pending: undefined } : item));
    });

    // Clear the progress strip, then say anything worth saying. Failures are
    // no longer the only thing worth saying: a filename whose style code lost
    // to the ERP, and a file with no style code at all, both change how that
    // row was rendered without failing.
    setBatchProgress(null);
    const summary = buildBatchSummary({
      total: queue.length,
      failures,
      matched,
      conflicts,
    });
    if (summary) setNotice(summary);
  }

  /**
   * ⌘↵ generates from anywhere, including the composer's style-number field —
   * typing a style code and firing the run is one gesture, and that field is
   * the fix for the warning printed directly above it.
   */
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Enter" || !(e.metaKey || e.ctrlKey)) return;
      if (loading || uploading || analyzing) return;
      if ((!frontIntakeUrl && !backIntakeUrl)) return;
      e.preventDefault();
      void runGeneration();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  /**
   * The controls the rail and the composer both drive. One object because two
   * copies of this drifting would let the composer and the Setup drawer
   * disagree about which side is about to render.
   */
  const routingControls: RoutingControls = {
    mode: productShotMode,
    view: viewRow.view,
    viewSource: viewRow.source,
    viewEditable: viewRow.editable,
    onViewChange: (view) => {
      setViewOverride(view);
      // The prompt carries the side directive, so a side change invalidates
      // it. Generate re-analyzes and rebuilds.
      setPrompt("");
    },
    isSet: twoPiece,
    onSetChange: (isSet) => {
      setTwoPiece(isSet);
      setPrompt("");
    },
    disabled: loading || uploading,
  };

  const generateLabel =
    productShotMode === "single-front"
      ? "Generate front"
      : productShotMode === "single-back"
      ? "Generate back"
      : "Generate front + back";

  const generateDisabled =
    (!frontIntakeUrl && !backIntakeUrl) ||
    (productShotMode === "front-back-contract" && (!frontIntakeUrl || !backIntakeUrl));

  /** Records which take the operator kept. Used by the stage and the details drawer. */
  async function recordPick({
    generationId,
    selectedImage,
    promptUsed,
  }: {
    generationId: string;
    selectedImage: "left" | "right" | "no_preference";
    promptUsed?: string;
  }) {
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
          ? { ...item, abTest: { ...item.abTest, selectedImage } }
          : item
      )
    );
  }

  /**
   * Back to an empty composer with nothing on the stage.
   *
   * Also the manual way out of a stuck card: any run still marked pending is
   * abandoned. If its call is in fact still running it lands in history on
   * its own when it finishes, so nothing real is lost.
   */
  function startNewRun() {
    setHistory((existing) => existing.filter((run) => !run.pending));
    setCurrentId(null);
    localStorage.removeItem(CURRENT_ID_KEY);
    setUploads([]);
    setSelected([]);
    setFrontIntakeUrl(null);
    setBackIntakeUrl(null);
    setStyleNumber("");
    setPrompt("");
    setDetectedView("unknown");
    setViewOverride(null);
    setRouting(null);
    setReferenceImageUrl(null);
    setError(null);
    setNotice(null);
  }

  function clearHistory() {
    setHistory([]);
    setCurrentId(null);
    localStorage.removeItem(CURRENT_ID_KEY);
    clearCloudHistory("image").catch((err) => {
      console.warn("[cloud-history] clear failed:", err);
    });
  }

  /**
   * Stage export. Same filename convention the details drawer uses.
   *
   * Routed through /api/download rather than pointed straight at the render.
   * The renders live on fal's CDN, and `<a download>` is ignored for a
   * cross-origin href — the old version opened the image in a new tab and left
   * the operator to right-click-save it. Same-origin, with the server setting
   * Content-Disposition, it is an actual download with the studio's own name.
   */
  function downloadOutput(url: string, index: number) {
    const stem = [styleNumber.trim() || "davidani", currentRun?.id.slice(0, 4)]
      .filter(Boolean)
      .join("-");
    // OUTPUT_FORMAT is the locked Image Studio export format, currently jpeg.
    const name = `${stem}-${index + 1}.${OUTPUT_FORMAT === "jpeg" ? "jpg" : OUTPUT_FORMAT}`;
    const a = document.createElement("a");
    a.href = `/api/download?url=${encodeURIComponent(url)}&name=${encodeURIComponent(name)}`;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  return (
    <main className="flex min-h-screen flex-col bg-neutral-50 lg:h-screen">
      <StudioHeader
        active="image"
        title="Image Studio"
        subtitle="Generate clean product photos from uploaded garments."
        badge="V2.3"
        metrics={[
          { label: "Runs", value: history.length },
          {
            label: "Active",
            value: loading ? 1 : 0,
          },
        ]}
      />

      <div
        className="image-studio-layout min-h-0 flex-1"
        style={{ "--ledger-w": `${ledgerWidth}px` } as CSSProperties}
      >
        <RunLedger
          runs={history}
          currentId={currentId}
          runningId={history.find((run) => run.pending)?.id ?? null}
          filter={ledgerFilter}
          onFilterChange={setLedgerFilter}
          onSelect={(id) => {
            setCurrentId(id);
            localStorage.setItem(CURRENT_ID_KEY, id);
          }}
          onClearHistory={clearHistory}
          onNewRun={startNewRun}
          composer={
            <>
              {batchProgress && (
                <div className="shrink-0 border-t border-neutral-200 bg-brand-50/60 px-3 py-2">
                  <div className="mb-1 flex items-center justify-between text-[9.5px] font-semibold text-brand-800">
                    <span>
                      Batch · {batchProgress.done}/{batchProgress.total}
                      {batchProgress.failed > 0 ? ` · ${batchProgress.failed} failed` : ""}
                    </span>
                    <span className="capitalize text-brand-600">{batchProgress.stage}</span>
                  </div>
                  <div className="h-1 overflow-hidden rounded-full bg-brand-100">
                    <div
                      className="h-full rounded-full bg-brand-500 transition-all"
                      style={{
                        width: `${Math.round(
                          (batchProgress.done / Math.max(1, batchProgress.total)) * 100
                        )}%`,
                      }}
                    />
                  </div>
                </div>
              )}
              <Composer
                frontIntakeUrl={frontIntakeUrl}
                backIntakeUrl={backIntakeUrl}
                onAddFiles={addFiles}
                onClearIntake={removeUpload}
                styleNumber={styleNumber}
                onStyleNumberChange={setStyleNumber}
                controls={routingControls}
                modelLabel={`${MODELS[modelId].label} · ${IMAGE_STUDIO_OUTPUT_SIZE.width}×${IMAGE_STUDIO_OUTPUT_SIZE.height}`}
                onGenerate={runGeneration}
                generateLabel={generateLabel}
                generateDisabled={generateDisabled}
                busy={loading || uploading}
                analyzing={analyzing}
                onBatch={runBatchGeneration}
                canBatch={batchEligibility(productShotMode, selected.length).enabled}
                batchDisabledReason={
                  batchEligibility(productShotMode, selected.length).reason ?? undefined
                }
                onOpenSetup={() => setSetupOpen(true)}
              onSearchErp={setErpSlot}
                canvasNeedsStyleNumber={routingCanvas?.fallbackReason === "category-inferred"}
              />
            </>
          }
        />
        <PaneSplitter
          width={ledgerWidth}
          onWidth={setLedgerWidth}
          onCommit={(width) => localStorage.setItem(LEDGER_WIDTH_KEY, String(width))}
        />

        <StageView
          run={currentRun ?? null}
          running={loading}
          onKeep={
            currentRun?.abTest
              ? (slot) =>
                  recordPick({
                    generationId: currentRun.id,
                    selectedImage: slot,
                    promptUsed: currentRun.prompt,
                  })
              : undefined
          }
          onDownload={downloadOutput}
          onOpenDetails={() => setDetailsOpen(true)}
        />
      </div>

      <StudioDrawer
        open={erpSlot !== null}
        title={`ERP photos · ${erpSlot === "back" ? "Back" : "Front"}`}
        subtitle="Every photo the ERP holds for a style, grouped as the ERP files them."
        wide
        onClose={() => setErpSlot(null)}
      >
        {erpSlot && (
          <ErpPicker
            slot={erpSlot}
            initialStyle={styleNumber}
            onPick={async (photo, style) => {
              await importErpPhoto(erpSlot, photo, style);
              setErpSlot(null);
            }}
            onClose={() => setErpSlot(null)}
          />
        )}
      </StudioDrawer>

      <StudioDrawer
        open={setupOpen}
        title="Setup"
        subtitle="Canvas, model and export — the controls a run does not usually need."
        onClose={() => setSetupOpen(false)}
      >
          <Sidebar
            modelId={modelId}
            // Used to also force format back to PNG for Nano Banana. The
            // format is no longer a choice, so the model is just the model.
            onModelChange={setModelId}
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
            styleNumber={styleNumber}
            onStyleNumberChange={setStyleNumber}
            referenceImageUrl={referenceImageUrl}
            defaultReferencePreview={routingCanvas?.path || STUDIO_BACKDROP_PATH}
            routing={routing}
            routingCanvas={routingCanvas}
            routingPending={routingPending}
            routingControls={routingControls}
            onReferenceReplace={replaceReferenceImage}
            onReferenceReset={resetReferenceImage}
            referenceUploading={referenceUploading}
          />
      </StudioDrawer>

      <StudioDrawer
        open={detailsOpen}
        title="Run details"
        subtitle="Feedback, batch grids and the full routing trail for this run."
        wide
        onClose={() => setDetailsOpen(false)}
      >
          <OutputPanel
            current={currentRun}
            history={history}
            onSelectHistory={setCurrentId}
            onFeedbackRegenerate={runFeedbackRegeneration}
            onAbPreferenceSelect={recordPick}
            uploadNames={uploadNames}
            onClearHistory={clearHistory}
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
      </StudioDrawer>

      {/* Batch report — informational, so it is not styled as a failure.
          whitespace-pre-line so the multi-line summary renders correctly. */}
      {notice && (
        <div className="fixed bottom-6 right-6 max-w-md rounded-lg border border-neutral-200 bg-white px-4 py-3 text-sm text-neutral-800 shadow-lg">
          <div className="flex items-start gap-2">
            <span className="font-semibold">Batch report:</span>
            <span className="flex-1 whitespace-pre-line">{notice}</span>
            <button
              onClick={() => setNotice(null)}
              aria-label="Dismiss batch report"
              className="text-neutral-400 transition hover:text-neutral-700"
            >
              ×
            </button>
          </div>
        </div>
      )}

      {/* Error toast — whitespace-pre-line so multi-line messages render. */}
      {error && (
        <div
          className={`fixed right-6 max-w-md rounded-lg bg-red-600 px-4 py-3 text-sm text-white shadow-lg ${
            notice ? "bottom-28" : "bottom-6"
          }`}
        >
          <div className="flex items-start gap-2">
            <span className="font-semibold">Error:</span>
            <span className="flex-1 whitespace-pre-line">{error}</span>
            <button
              onClick={() => setError(null)}
              aria-label="Dismiss error"
              className="opacity-70 transition hover:opacity-100"
            >
              ×
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
