import { STUDIO_BACKGROUND_HEX, STUDIO_BACKGROUND_RGB } from "./studio-background";

/**
 * What the backdrop snap did to a finished render, in a shape the client can
 * hold.
 *
 * WHY THIS EXISTS
 * ---------------
 * normalizeStudioBackground() has always returned applied/coverage/sampled/
 * skipReason, and lib/fal.ts has always console.logged them. That put the one
 * signal that says "this render's background is not a studio sweep" in a
 * server log nobody reads, while the operator looked at the image and had to
 * decide by eye.
 *
 * The skip reasons are not plumbing noise. "border not neutral" is exactly
 * what a render sitting on a painted cinderblock ledge produces: the flood
 * fill samples a warm textured border, the chroma gate rejects it, and the
 * pass correctly declines. The image then ships un-normalized and looks, at a
 * glance, like every other output. Surfacing the skip turns an invisible
 * failure into a labelled one.
 *
 * KEPT SEPARATE FROM NormalizeBackgroundResult on purpose: that type carries a
 * Buffer and lives next to sharp. This module imports nothing but constants,
 * so components/ can hold it and it can be persisted to localStorage with the
 * rest of a history item.
 */
export interface BackgroundSnapReport {
  /** True when the render's backdrop was actually recolored. */
  applied: boolean;
  /** Fraction of the frame classified as backdrop. */
  coverage: number;
  /** Median border color as measured BEFORE the snap. Null when not sampled. */
  sampled: { r: number; g: number; b: number } | null;
  /** Why the pass declined. Only set when applied is false. */
  skipReason?: string;
  /** Set when the pass threw. The render still shipped, un-normalized. */
  failed?: boolean;
}

/**
 * Largest per-channel distance between what the model produced and the locked
 * studio hex — how far off #edeeee the render landed.
 *
 * Max-channel rather than Euclidean because the drift that prompted this whole
 * pass was directional: a measured render came back #dfe2e9, which is 14 on R
 * and 5 on B. The channel that moved most is the number that describes it.
 */
export function backgroundDrift(
  sampled: { r: number; g: number; b: number } | null
): number | null {
  if (!sampled) return null;
  const { r, g, b } = STUDIO_BACKGROUND_RGB;
  return Math.max(
    Math.abs(sampled.r - r),
    Math.abs(sampled.g - g),
    Math.abs(sampled.b - b)
  );
}

/** Format a sampled color the way the rest of the studio writes hex. */
export function sampledHex(sampled: { r: number; g: number; b: number } | null): string | null {
  if (!sampled) return null;
  const hex = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
  return `#${hex(sampled.r)}${hex(sampled.g)}${hex(sampled.b)}`;
}

/**
 * How much drift is worth pointing at.
 *
 * 8 because the pass exists for drift an operator cannot see and would not
 * think to check: the reference failure was 14. Below 8 the model effectively
 * hit the hex and saying so adds noise to every single run.
 */
export const BACKGROUND_DRIFT_NOTABLE = 8;

/**
 * Below this fraction the fill found a backdrop but barely any of it, which
 * means the frame is mostly not-sweep — a garment shot far too large, or a
 * scene the fill could only nibble at the edge of. 0.25 is well under the
 * ~45% a conforming flat lay leaves (the spec caps the garment at 82.5% x
 * 76%, and real ones sit lower), so it fires on genuinely wrong frames only.
 */
export const BACKGROUND_COVERAGE_LOW = 0.25;

export type BackgroundSnapTone = "clean" | "snapped" | "warn";

export interface BackgroundSnapSummary {
  tone: BackgroundSnapTone;
  /** One line, operator-facing. */
  headline: string;
  /** The measurement behind the headline, or null when there is nothing to add. */
  detail: string | null;
}

/**
 * Turn a report into something worth reading.
 *
 * The tones are a triage, not a severity ladder: "warn" means look at this
 * image, "snapped" and "clean" both mean it is fine and say only what changed.
 */
export function summarizeBackgroundSnap(report: BackgroundSnapReport): BackgroundSnapSummary {
  const drift = backgroundDrift(report.sampled);
  const hex = sampledHex(report.sampled);

  if (report.failed) {
    return {
      tone: "warn",
      headline: "Backdrop snap failed — shipped un-normalized",
      detail: report.skipReason ?? null,
    };
  }

  if (!report.applied) {
    return {
      tone: "warn",
      // Named as a consequence, not a status. "skipped" reads as a step that
      // was not needed; the truth is the image kept whatever background it
      // came back with.
      headline: "Backdrop left as generated",
      detail: report.skipReason
        ? `${report.skipReason}. The render is not sitting on a clean studio sweep — check it before it ships.`
        : "The render is not sitting on a clean studio sweep — check it before it ships.",
    };
  }

  if (report.coverage < BACKGROUND_COVERAGE_LOW) {
    return {
      tone: "warn",
      headline: `Snapped, but only ${(report.coverage * 100).toFixed(1)}% of the frame read as backdrop`,
      detail:
        "Most of the frame is something other than sweep. Either the garment is far oversized or the model invented a surface.",
    };
  }

  if (drift !== null && drift >= BACKGROUND_DRIFT_NOTABLE) {
    return {
      tone: "snapped",
      headline: `Backdrop snapped to ${STUDIO_BACKGROUND_HEX} from ${hex}`,
      detail: `${drift} levels off on its widest channel, across ${(report.coverage * 100).toFixed(1)}% of the frame.`,
    };
  }

  return {
    tone: "clean",
    headline: `Backdrop was already ${STUDIO_BACKGROUND_HEX}`,
    detail:
      hex && drift !== null && drift > 0
        ? `Measured ${hex}, within ${drift} level${drift === 1 ? "" : "s"}.`
        : null,
  };
}
