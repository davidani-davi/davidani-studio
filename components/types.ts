import type { FeedbackIssueKey } from "@/lib/feedback-memory";

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
    version: "2.2";
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
  // Marks a run as produced by Batch so we can label it distinctly in the UI.
  batch?: boolean;
}
