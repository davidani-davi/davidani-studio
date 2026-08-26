/**
 * Which ERP frame the Faire square thumbnail is built from.
 *
 * WHAT THE SQUARE THUMBNAIL IS
 * ----------------------------
 * Not an ERP asset. Faire's catalogue tiles are square and centre-crop a
 * portrait hero, so davidani-faire-management generates a 2000x2000 PNG —
 * "<SKU> Square.png" — from one chosen ERP frame, scaling it to fit and
 * filling the empty side bands by mirroring and blurring the edge outward.
 * The original pixels are never repainted.
 *
 * WHY THAT MATTERS HERE
 * ---------------------
 * "Which ERP photo is the square thumbnail" has an answer, and it is this
 * scoring — a direct port of prerender.py::pick_best, weights unchanged, so
 * the studio marks the same frame the Faire tool would square. Getting a
 * different answer from the same style would be worse than no answer at all.
 *
 * The edge-column term is the one that is really about squaring: a shot whose
 * edge columns are flat fills invisibly, while a body part touching the frame
 * edge mirrors outward into a visible ghost.
 */

export interface SquareCandidate {
  /** The style code appears in this frame's filename. */
  hasStyleToken: boolean;
  /** width / height of the frame. */
  aspect: number;
  /** Greater stddev of the two edge column strips, on a 0-255 grey scale. */
  edgeStdDev: number;
  /** Position in the gallery, 0-based. Earlier is usually the hero. */
  position: number;
}

/** Weights are prerender.py's, deliberately unchanged. */
export const SQUARE_WEIGHTS = {
  styleToken: 3,
  portrait: 2,
  cleanEdges: 3,
  busyEdges: -3,
  perPosition: -0.05,
} as const;

export const PORTRAIT_MIN = 0.55;
export const PORTRAIT_MAX = 0.9;
export const EDGE_CLEAN = 12;
export const EDGE_BUSY = 35;

/**
 * Greater stddev of the two edge column strips, over raw greyscale pixels.
 *
 * Computed by hand rather than with sharp's stats(): stats() reads the INPUT
 * image and ignores a preceding .extract(), so an earlier version measured the
 * whole photo instead of its edges — 79 where the true edge value was 2.8.
 * Every frame scored as "busy edges", and the one signal that is really about
 * squaring never fired for anything.
 */
export function edgeStdDev(
  pixels: Uint8Array | Buffer,
  width: number,
  height: number,
  channels = 1,
  strip = 2
): number {
  if (width <= 0 || height <= 0) return Number.POSITIVE_INFINITY;
  const cols = Math.max(1, Math.min(strip, width));
  const side = (xs: number[]) => {
    let sum = 0;
    let sumSq = 0;
    let n = 0;
    for (let y = 0; y < height; y++) {
      for (const x of xs) {
        const v = pixels[(y * width + x) * channels];
        sum += v;
        sumSq += v * v;
        n++;
      }
    }
    if (!n) return Number.POSITIVE_INFINITY;
    const mean = sum / n;
    return Math.sqrt(Math.max(0, sumSq / n - mean * mean));
  };
  const left = Array.from({ length: cols }, (_, i) => i);
  const right = Array.from({ length: cols }, (_, i) => width - 1 - i);
  return Math.max(side(left), side(right));
}

export function scoreSquareCandidate(c: SquareCandidate): number {
  let score = 0;
  if (c.hasStyleToken) score += SQUARE_WEIGHTS.styleToken;
  if (c.aspect >= PORTRAIT_MIN && c.aspect <= PORTRAIT_MAX) score += SQUARE_WEIGHTS.portrait;
  if (c.edgeStdDev < EDGE_CLEAN) score += SQUARE_WEIGHTS.cleanEdges;
  else if (c.edgeStdDev > EDGE_BUSY) score += SQUARE_WEIGHTS.busyEdges;
  score += c.position * SQUARE_WEIGHTS.perPosition;
  return score;
}

/**
 * Why a frame scored what it did, split by sign.
 *
 * Split because the winning frame is often not a clean one — it is only the
 * best of what is filed. Listing "busy edges" among a frame's merits, which an
 * earlier single-list version did on the first real style tried, reads as
 * praise for the exact thing that will make the square look wrong.
 */
export function squareReasons(c: SquareCandidate): { strengths: string[]; warnings: string[] } {
  const strengths: string[] = [];
  const warnings: string[] = [];
  if (c.hasStyleToken) strengths.push("named for this style");
  else warnings.push("not named for this style");
  if (c.aspect >= PORTRAIT_MIN && c.aspect <= PORTRAIT_MAX) strengths.push("portrait crop");
  else warnings.push("not a portrait crop");
  if (c.edgeStdDev < EDGE_CLEAN) strengths.push("clean edges — fills invisibly");
  else if (c.edgeStdDev > EDGE_BUSY) warnings.push("busy edges — the fill will ghost");
  return { strengths, warnings };
}

/**
 * The index of the frame the square thumbnail would be built from, or null.
 *
 * Ties go to the earlier frame, matching pick_best's max() over gallery order.
 */
export function pickSquareHero(scores: number[]): number | null {
  let best: number | null = null;
  for (let i = 0; i < scores.length; i++) {
    if (best === null || scores[i] > scores[best]) best = i;
  }
  return best;
}

/**
 * Plus twin -> regular twin. A P-style has no photos of its own; they live on
 * the D-style. Without this a Plus code returns an empty gallery and looks
 * like the ERP has nothing for it.
 */
export function regularizeStyle(code: string): string {
  const key = code.trim().toUpperCase();
  return key.startsWith("P") ? `D${key.slice(1)}` : key;
}

/** The file the Faire tooling would write for this style. */
export function squareThumbnailName(style: string): string {
  return `${regularizeStyle(style)} Square.png`;
}
