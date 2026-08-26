// Type-only import, erased at compile time — no client component is pulled
// into this module at runtime.
import type { ProductShotMode } from "@/components/PromptPanel";

/**
 * When Batch is allowed to run, and what to say when it is not.
 *
 * WHY BATCH IS RESTRICTED
 * -----------------------
 * Batch iterates ONE image at a time and, for each, takes `canvas.front` and
 * sends the analyzer's prompt with no view directive. That is a front shot. It
 * was offered in every mode anyway, so:
 *
 *  - In "single-back" it silently produced FRONT shots on FRONT canvases. The
 *    button said Batch, the workflow card said Generate Single Back, and forty
 *    images came back as the wrong side with nothing reporting it.
 *  - In "front-back-contract" the request is structurally impossible, not just
 *    unimplemented: a contract run needs a front and a back of the SAME SKU,
 *    and a flat queue of images carries no pairing. Nothing in the UI says
 *    which two of forty photos are one garment.
 *
 * So Batch is restricted to the one mode whose output matches its behaviour.
 * "single-back" is the cheap one to unlock later — the analyzer already returns
 * `canvas.back` and `promptByMode.backdrop` alongside the front pair, so it is
 * a canvas swap plus a view directive. "front-back-contract" needs a queue that
 * can express pairs, which is a UI change, not a prompt change.
 *
 * WHY THIS RETURNS A REASON
 * -------------------------
 * The old disabled tooltip read "Select 2 or more images to enable" in a UI
 * that has no image selection — the uploads list is not rendered anywhere. A
 * disabled control that names an action the user cannot perform is worse than
 * one that says nothing, because it sends them looking for a screen that does
 * not exist.
 */
export interface BatchEligibility {
  enabled: boolean;
  /** Why not, phrased as something the operator can act on. Null when enabled. */
  reason: string | null;
}

/** Batch needs at least this many queued images to be worth its own path. */
export const BATCH_MIN_IMAGES = 2;

export function batchEligibility(
  mode: ProductShotMode,
  queuedImageCount: number
): BatchEligibility {
  if (mode === "single-back") {
    return {
      enabled: false,
      reason:
        "Batch produces front shots only, so it would return front images for a " +
        "back run. Switch to Generate Single Front to batch, or run backs one at a time.",
    };
  }
  if (mode === "front-back-contract") {
    return {
      enabled: false,
      reason:
        "Batch runs one image at a time and cannot tell which photos are the " +
        "front and back of the same style. Run front + back pairs one at a time.",
    };
  }
  if (queuedImageCount < BATCH_MIN_IMAGES) {
    return {
      enabled: false,
      reason: `Upload ${BATCH_MIN_IMAGES} or more photos to batch. Every photo you upload joins the queue.`,
    };
  }
  return { enabled: true, reason: null };
}
