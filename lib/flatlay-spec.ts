/**
 * The approved flat-lay framing standard, measured rather than described.
 *
 * WHERE THESE NUMBERS COME FROM
 * -----------------------------
 * davi-flatlay.psd, the hand-built comp. Its `Reference` layer is a 2160x2700
 * RGB flat in which every pixel outside a ~20px edge halo is byte-identical
 * #edeeee — corners, top centre, bottom centre, and directly beneath the hem
 * all measure rgb(237,238,238). No photograph does that. The approved standard
 * is a cutout composited onto a flat fill, which is why the numbers below are
 * exact integers instead of tolerances.
 *
 * Measured on that layer (a crew-neck cardigan):
 *
 *   canvas            2160 x 2700
 *   garment bbox      x 189-1970, y 623-2060  (1782 x 1438)
 *   side margins      L = R = 189, exactly
 *   horizontal centre 1079.5 against a canvas centre of 1080
 *   vertical centre   1341.5 against a canvas centre of 1350
 *   occupancy         82.5% width, 53.3% height
 *
 * 189 * 2 + 1782 = 2160 exactly: the garment is fitted to WIDTH and its height
 * falls out of the aspect ratio. That 53.3% is the "53% canvas" the tuning
 * notes in lib/fal.ts refer to — this is that cardigan.
 *
 * WHY A SAFE AREA RATHER THAN A FIXED WIDTH
 * -----------------------------------------
 * "Span 82.5% of the frame width" is the wrong lesson to draw from one comp.
 * It is correct for a wide garment because width is what binds; applied to a
 * dress or trousers it would drive them past the frame. Fit-to-width with no
 * cap is the existing failure — trousers frame at 89-92% against the norm.
 *
 * WHY THE TWO AXES DIFFER
 * -----------------------
 * The safe area is NOT square, and assuming it was is a mistake this file made
 * first. The vertical clearance was inferred by symmetry from the horizontal
 * 8.75%, which the comp cannot confirm: on that cardigan width binds, so its
 * vertical margins (623 top, 639 bottom) are just what fell out of the aspect
 * ratio. The approved canvases in public/product-shots/ settle it, measured
 * against the same #edeeee at threshold 8:
 *
 *   canvas-top-front        83.0% W   side margins 8.5% / 8.5%   width binds
 *   style-reference-9       82.5% W   side margins 8.8% / 8.8%   width binds
 *   canvas-outerwear-front  77.4% W   side margins 11.9% / 10.8% width binds
 *   canvas-dress-front      76.1% H   top/bottom 12.4% / 11.5%   height binds
 *   canvas-set-front        70.1% H   top/bottom 15.4% / 14.4%   height binds
 *   canvas-skirt-front      69.2% H   top/bottom 15.9% / 14.9%   height binds
 *
 * style-reference-9 IS the PSD's Reference layer — same 82.5 x 53.3 and the
 * same margins — so the comp and the canvas library agree on the horizontal
 * figure. They disagree with a square safe area on the vertical one: every
 * height-bound canvas clears 11.5-15.9%, never 8.75%. A square safe area would
 * enlarge canvas-dress-front from 76.1% to 82.5%, i.e. break the tightest
 * approved tall-garment framing in the library.
 *
 * So the two limits are set independently: 82.5% of width from the comp, 76%
 * of height from the tightest height-bound canvas. Both are CAPS. The library
 * spreads 69-83% on the binding axis, so a rule that forced the garment to
 * touch the safe area would contradict skirt-front and set-front; a rule that
 * forbids exceeding it is consistent with all six.
 *
 * KNOWN DEFECT, left as-is deliberately: canvas-outerwear-front and -back are
 * off-centre by about a percent of frame width (11.9 vs 10.8), roughly 22px.
 * That is the canvas the outerwear category routes to. Fixing it means
 * re-rendering the asset, not changing this file.
 */

/** Output canvas, matching both the PSD and the generator's 2160x2700 render. */
export const FLATLAY_CANVAS = { width: 2160, height: 2700 } as const;

/**
 * Horizontal clearance, as a fraction of canvas width. 189 / 2160 = 0.0875
 * exactly, measured on the comp and corroborated by canvas-top-front (8.5%)
 * and style-reference-9 (8.8%).
 */
export const FLATLAY_MARGIN_RATIO = 0.0875;

/** Measured side margin in pixels at the canonical canvas width. */
export const FLATLAY_SIDE_MARGIN_PX = 189;

/**
 * Vertical clearance, as a fraction of canvas height. Taken from
 * canvas-dress-front, the tightest height-bound canvas in the library at 76.1%
 * — anything looser would re-frame it. Not derivable from the comp; see the
 * two-axes note above.
 */
export const FLATLAY_VERTICAL_MARGIN_RATIO = 0.12;

/** Largest share of the frame the garment may span, per axis. */
export const FLATLAY_MAX_WIDTH_RATIO = 1 - FLATLAY_MARGIN_RATIO * 2;
export const FLATLAY_MAX_HEIGHT_RATIO = 1 - FLATLAY_VERTICAL_MARGIN_RATIO * 2;

export interface FlatlaySafeArea {
  /** Left edge of the safe area, in pixels. */
  x: number;
  /** Top edge of the safe area, in pixels. */
  y: number;
  width: number;
  height: number;
}

/**
 * The box the garment's bounding box must fit inside, centered on the canvas.
 * The garment is scaled to CONTAIN — it touches the safe area on whichever
 * axis binds first and clears it on the other.
 */
export function flatlaySafeArea(
  canvas: { width: number; height: number } = FLATLAY_CANVAS
): FlatlaySafeArea {
  const x = canvas.width * FLATLAY_MARGIN_RATIO;
  const y = canvas.height * FLATLAY_VERTICAL_MARGIN_RATIO;
  return {
    x,
    y,
    width: canvas.width - x * 2,
    height: canvas.height - y * 2,
  };
}

/**
 * Occupancy the garment ends up at once contain-fitted, given its natural
 * aspect ratio. Returned as fractions of the canvas, which is how the
 * composition clause states them and how the tuning notes measure drift.
 */
export function flatlayOccupancy(
  garment: { width: number; height: number },
  canvas: { width: number; height: number } = FLATLAY_CANVAS
): { width: number; height: number } {
  const safe = flatlaySafeArea(canvas);
  const scale = Math.min(safe.width / garment.width, safe.height / garment.height);
  return {
    width: (garment.width * scale) / canvas.width,
    height: (garment.height * scale) / canvas.height,
  };
}

const pct = (n: number): string => `${(n * 100).toFixed(2).replace(/\.?0+$/, "")}%`;

/**
 * The measured framing rule as prompt text.
 *
 * Replaces the prose it supersedes ("comfortable, even margins on all four
 * sides") in STUDIO COMPOSITION STANDARD. Vague margins are exactly what let
 * scale drift between rows, and the drift is only visible against a number.
 *
 * Deliberately states the clearance and the contain-fit rather than a target
 * occupancy: a fixed width figure is right for one garment shape and wrong for
 * every other. See the safe-area rationale above.
 */
export function flatlayFramingClause(): string {
  const w = pct(FLATLAY_MAX_WIDTH_RATIO);
  const h = pct(FLATLAY_MAX_HEIGHT_RATIO);
  const sideM = pct(FLATLAY_MARGIN_RATIO);
  const vertM = pct(FLATLAY_VERTICAL_MARGIN_RATIO);
  return (
    `FRAMING (measured from the approved comps, not approximate): the garment's full extent — sleeves, hem, and ` +
    `whatever reaches furthest out — must fit inside a centred safe area that leaves ${sideM} of the frame clear ` +
    `on the left and right and ${vertM} clear on the top and bottom. Scale the garment to fill that safe area as ` +
    `far as its own proportions allow, touching it on the axis that binds first and clearing it on the other. It ` +
    `may span at most ${w} of the frame's width and at most ${h} of its height; a broad garment reaches the ${w} ` +
    `width limit and stays well short of the height limit, while a long narrow garment reaches the ${h} height ` +
    `limit and stays well short of the width limit. Never exceed either limit. The garment is centred ` +
    `horizontally with equal left and right margins, and sits at the vertical centre of the frame.`
  );
}
