import type { FeedbackIssueKey } from "@/lib/feedback-memory";
import type { CanvasSummary, RoutingPayload } from "@/lib/routing-summary";
import type { BackgroundSnapReport } from "@/lib/background-snap";

export interface UploadedImage {
  url: string;
  name: string;
}

export interface HistoryItem {
  id: string;
  timestamp: number;
  modelId: string;
  prompt: string;
  imageUrls: string[]; // outputs
  referenceUrls: string[];
  // Original garment/product uploads used for this run. This lets the user
  // retry with another image engine from a completed result without needing
  // to re-select or re-upload the source photo.
  sourceImageUrls?: string[];
  aspect: string;
  resolution: string;
  format?: "png" | "jpeg" | string;
  styleNumber?: string;
  styleName?: string;
  // Model Studio metadata. Quality-control retries must use the exact
  // model/pose/view that produced the selected result, even if the user has
  // changed the sidebar selection since then.
  humanModelId?: string;
  poseId?: string;
  view?: string;
  // Batch-only metadata. When a run is produced by Batch generate, we store
  // the per-image prompt used for each output at the same index in
  // `imageUrls`. Single-image runs leave this undefined.
  prompts?: string[];
  // Optional per-output labels for complete photoshoot sets: front, side,
  // back, full. Kept parallel to imageUrls/prompts/referenceUrls.
  viewLabels?: string[];
  // Multi Model Studio stores each of its four views independently so a slow
  // provider timeout can fail one slot without losing the completed slots.
  multiModelViews?: Partial<
    Record<
      "front" | "side" | "back" | "full",
      {
        status: "queued" | "analyzing" | "generating" | "done" | "failed";
        url?: string;
        prompt?: string;
        referenceUrl?: string;
        error?: string;
        updatedAt?: number;
      }
    >
  >;
  // Model Studio QC decisions that should carry into generated side/back/full
  // views after a front shot is approved.
  setCarryForwardPrompt?: string;
  feedbackNotes?: string[];
  feedbackMemory?: Array<{
    issueKeys: FeedbackIssueKey[];
    note?: string;
    createdAt: number;
  }>;
  abTest?: {
    /** "2.2" = the retired buildV17Prompt A/B; "2.3" = same-prompt variants. */
    version: "2.2" | "2.3";
    selectedImage?: "left" | "right" | "no_preference";
  };
  // Multi-option run with per-view trios. Front trio lives at imageUrls[0..2]
  // labeled "front" in viewLabels; once Side / Back / Full views are extended
  // via runTrioPhotoshootSet, each appends another 3 images with its own
  // viewLabel. picksByView tracks the user's favorited slot (0/1/2) per view —
  // each view is an independent decision.
  multiOption?: {
    version: "v1";
    /**
     * Legacy: applies to the first three imageUrls (front trio). Keep around
     * so older HistoryItems persisted in localStorage still render.
     */
    selectedIndex?: 0 | 1 | 2;
    /**
     * Per-view picks. Indexed 0/1/2 within that view's three slots — NOT a
     * global imageUrls index. The picksByView['front'] = 1 means the second
     * front variant is the favorite, regardless of where front sits in the
     * overall imageUrls array.
     */
    picksByView?: Partial<Record<"front" | "side" | "back" | "full", 0 | 1 | 2>>;
  };
  /**
   * How the studio routed this run — category, who decided it, described-from,
   * and the canvas that fell out of it.
   *
   * Every one of these values was already computed on every analyze and then
   * dropped: the rail rendered them live and the next run overwrote it, so
   * looking at a finished image there was no way to tell which canvas it landed
   * on, whether it fell back to the empty sweep, or whether the garment was
   * described from the ERP gallery or from a single photo. Those are different
   * quality tiers, and the difference was invisible the moment the run ended.
   */
  routing?: RoutingPayload | null;
  routingCanvas?: CanvasSummary | null;
  /**
   * Batch routes every queued photo separately, so one run-level answer would
   * be a lie. Parallel to imageUrls, same convention as `prompts`.
   */
  routings?: Array<{ routing: RoutingPayload | null; canvas: CanvasSummary | null } | null>;
  /**
   * What the #edeeee backdrop snap did to each finished image, parallel to
   * imageUrls.
   *
   * Stored per image rather than per run because two variants of one prompt
   * routinely disagree: the run that motivated this had variant 1 land on a
   * clean sweep and variant 2 on a painted cinderblock ledge. A run-level
   * answer would have described one of them wrongly.
   */
  backgroundSnaps?: Array<BackgroundSnapReport | null>;
  // Marks a run as produced by Batch so we can label it distinctly in the UI.
  batch?: boolean;
}
