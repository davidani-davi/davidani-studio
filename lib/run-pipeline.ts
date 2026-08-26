import {
  summarizeBackgroundSnap,
  type BackgroundSnapReport,
  type BackgroundSnapTone,
} from "./background-snap";
import type { CanvasSummary, RoutingPayload } from "./routing-summary";

/**
 * Reduce a finished run to the four words the Split Ledger prints under it.
 *
 * WHY A PURE MODULE
 * -----------------
 * Every run card in the feed, the stage header, and the ledger's filter chip
 * all answer the same two questions — what happened to this run, and is it
 * worth a second look. Three components deriving that independently is three
 * chances to disagree about whether a run is fine, which is exactly the class
 * of bug the rail was built to prevent in the first place. So it derives once,
 * here, and gets tests.
 *
 * The facts are read from what a run already stores. Nothing new is persisted:
 * routingCanvas has carried the canvas and its fallback reason since the
 * routing work, backgroundSnaps has carried the backdrop result since the
 * telemetry work, and viewLabels has always said which side was rendered.
 */

/** The subset of a HistoryItem this module reads. HistoryItem satisfies it. */
export interface RunFacts {
  id: string;
  prompt?: string;
  styleNumber?: string;
  styleName?: string;
  imageUrls: string[];
  viewLabels?: string[];
  routing?: RoutingPayload | null;
  routingCanvas?: CanvasSummary | null;
  backgroundSnaps?: Array<BackgroundSnapReport | null>;
  abTest?: { selectedImage?: "left" | "right" | "no_preference" };
  batch?: boolean;
}

export type StepTone = "ok" | "warn" | "muted";

export interface PipelineStep {
  key: "intake" | "side" | "canvas" | "backdrop";
  /** Short enough for the four-word strip under a run card. */
  label: string;
  tone: StepTone;
  /** Long form for the stage header's tooltip and the run sheet. */
  detail?: string;
}

/**
 * The garment name the analyzer chose, recovered from the prompt it built.
 *
 * A run has no name field — the operator never types one. But every Image
 * Studio prompt opens with the template's own sentence, and the clause after
 * the colon is vision's answer to "what is this". That is a far better card
 * title than a timestamp, and it costs nothing to read back out.
 */
export function garmentNameFromPrompt(prompt: string | undefined | null): string | null {
  if (!prompt) return null;
  const match = prompt.match(/with a different garment:\s*([^.]{3,90})\./i);
  if (!match) return null;
  const name = match[1].trim().replace(/\s+/g, " ");
  if (!name) return null;
  return name.charAt(0).toUpperCase() + name.slice(1);
}

/** Card title: the style name if one was typed, otherwise what vision saw. */
export function runTitle(run: RunFacts): string {
  if (run.styleName?.trim()) return run.styleName.trim();
  return garmentNameFromPrompt(run.prompt) ?? (run.batch ? "Batch run" : "Product shot");
}

/** Second line: where the category could have come from. */
export function runSubtitle(run: RunFacts): string {
  const code = run.styleNumber?.trim();
  return code ? code.toUpperCase() : "No style number";
}

/** "Front", "Back", "Front + back", or null when the run did not record it. */
export function runSide(run: RunFacts): string | null {
  const labels = run.viewLabels ?? [];
  if (labels.length === 0) return null;
  const sides = new Set(
    labels
      .map((label) => label.split("·")[0]?.trim().toLowerCase())
      .filter((side): side is string => side === "front" || side === "back")
  );
  if (sides.size === 0) return null;
  if (sides.size > 1) return "Front + back";
  return sides.has("back") ? "Back" : "Front";
}

/** Shorten a canvas path to the name the rail already prints. */
function canvasLabel(canvas: CanvasSummary): string {
  if (canvas.isFallback) return "Empty sweep";
  const file = canvas.path.split("/").pop() ?? canvas.path;
  return file.replace(/\.png$/i, "").replace(/^canvas-/, "");
}

/**
 * The worst thing the backdrop pass has to say about this run's images.
 *
 * Worst rather than first because a run is two variants and they routinely
 * disagree — the run that motivated the snap telemetry had variant 1 land on a
 * clean sweep and variant 2 on a painted ledge. A card that reported variant 1
 * would be describing half the run.
 */
function worstSnap(
  snaps: Array<BackgroundSnapReport | null> | undefined
): { tone: BackgroundSnapTone; headline: string; detail: string | null } | null {
  const present = (snaps ?? []).filter((s): s is BackgroundSnapReport => Boolean(s));
  if (present.length === 0) return null;
  const rank: Record<BackgroundSnapTone, number> = { clean: 0, snapped: 1, warn: 2 };
  return present
    .map(summarizeBackgroundSnap)
    .reduce((worst, next) => (rank[next.tone] > rank[worst.tone] ? next : worst));
}

/**
 * The four-step strip. Always four entries, always in pipeline order, so the
 * cards line up as a column you can read straight down.
 */
export function runPipeline(run: RunFacts): PipelineStep[] {
  const steps: PipelineStep[] = [
    { key: "intake", label: "Intake", tone: "ok" },
  ];

  const side = runSide(run);
  steps.push(
    side
      ? { key: "side", label: side, tone: "ok" }
      : { key: "side", label: "Side not recorded", tone: "muted" }
  );

  const canvas = run.routingCanvas;
  if (!canvas) {
    steps.push({
      key: "canvas",
      label: "Own canvas",
      tone: "muted",
      detail: "An uploaded canvas outranks routing, so no routed canvas was chosen.",
    });
  } else if (canvas.fallbackReason === "category-inferred") {
    steps.push({
      key: "canvas",
      label: "Empty sweep",
      tone: "warn",
      detail: "Category read from the photo alone — a style number would buy the approved flat lay.",
    });
  } else {
    steps.push({
      key: "canvas",
      label: canvasLabel(canvas),
      tone: canvas.isFallback ? "muted" : "ok",
      detail: canvas.isFallback
        ? "No approved flat lay for this category yet — framing described in words."
        : undefined,
    });
  }

  const snap = worstSnap(run.backgroundSnaps);
  if (!snap) {
    steps.push({ key: "backdrop", label: "Not measured", tone: "muted" });
  } else {
    steps.push({
      key: "backdrop",
      label:
        snap.tone === "warn" ? "Backdrop check" : snap.tone === "snapped" ? "Snapped" : "Clean",
      tone: snap.tone === "warn" ? "warn" : "ok",
      detail: snap.detail ? `${snap.headline}. ${snap.detail}` : snap.headline,
    });
  }

  return steps;
}

export type RunTone = "running" | "kept" | "check" | "clean";

export interface RunVerdict {
  tone: RunTone;
  /** Fits the chip on a run card. */
  label: string;
}

/**
 * Whether this run is worth opening again.
 *
 * Deliberately only two inputs, both of which have already caught a real
 * failure: a canvas chosen from the photo alone (which put a shirt on the
 * bomber canvas), and a backdrop pass that warned. A run can be ugly for
 * reasons neither of these sees — this flags what the studio can actually
 * measure, and says nothing about the rest.
 */
export function wantsSecondLook(run: RunFacts): boolean {
  if (run.routingCanvas?.fallbackReason === "category-inferred") return true;
  return worstSnap(run.backgroundSnaps)?.tone === "warn";
}

export function runVerdict(run: RunFacts, opts: { running?: boolean } = {}): RunVerdict {
  if (opts.running) return { tone: "running", label: "Painting" };
  const picked = run.abTest?.selectedImage;
  if (picked === "left" || picked === "right") {
    return { tone: "kept", label: `Kept · V${picked === "left" ? 1 : 2}` };
  }
  if (wantsSecondLook(run)) return { tone: "check", label: "Check" };
  return { tone: "clean", label: "Clean" };
}

export type LedgerFilter = "all" | "kept" | "check";

export function filterRuns<T extends RunFacts>(runs: T[], filter: LedgerFilter): T[] {
  if (filter === "all") return runs;
  if (filter === "kept") {
    return runs.filter((run) => {
      const picked = run.abTest?.selectedImage;
      return picked === "left" || picked === "right";
    });
  }
  return runs.filter(wantsSecondLook);
}
