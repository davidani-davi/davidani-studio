import sharp from "sharp";
import { STUDIO_BACKGROUND_RGB } from "./studio-background";

/**
 * Snap a finished Image Studio render's backdrop to exactly
 * STUDIO_BACKGROUND_HEX (#edeeee).
 *
 * Why this exists: the canvas presets in public/product-shots/ measure
 * #edeeee to the pixel, and the prompt names that hex four times over, but
 * the model still lands a few levels off — a measured render came back at
 * #dfe2e9, roughly 15 levels dark with a cool cast (B-R = +10). Prompting
 * harder does not fix a decode-time drift, so the last step is deterministic
 * instead of probabilistic.
 *
 * The recolor is flood-filled inward from the frame edge rather than applied
 * to every near-neutral pixel in the image. A global color test would eat
 * light garment detail — white scalloped pocket trim, ivory florals, a whole
 * white garment. Only the connected region touching the border is treated as
 * backdrop, so an enclosed white detail is never reached.
 */

export interface NormalizeBackgroundOptions {
  /** Max Euclidean RGB distance from the sampled border color to count as backdrop. */
  tolerance?: number;
  /** Gaussian sigma used to soften the mask edge, in pixels. 0 disables feathering. */
  featherSigma?: number;
  /** Sampled border color must be at least this bright on every channel. */
  minBrightness?: number;
  /** Sampled border color's max-min channel spread must not exceed this. */
  maxChannelSpread?: number;
  /** Abort if the fill would swallow more than this fraction of the frame. */
  maxCoverage?: number;
  /**
   * Absorb a stranded island into the backdrop when it is smaller than this
   * fraction of the frame. See absorbStrandedIslands().
   */
  maxIslandArea?: number;
  /**
   * ...and when its whole bounding box sits within this fraction of the frame
   * edge on BOTH axes — i.e. in a corner, where watermarks live.
   */
  islandMarginBand?: number;
}

const DEFAULTS = {
  tolerance: 34,
  featherSigma: 1.4,
  minBrightness: 185,
  maxChannelSpread: 32,
  maxCoverage: 0.995,
  // A watermark is a few tenths of a percent of the frame; the smallest real
  // garment detail that could ever strand (a tie end, a loose fringe strand)
  // still sits well under this, but those are never confined to the margin.
  maxIslandArea: 0.01,
  // 0.35, not 0.2: a corner watermark's text runs inward well past a fifth of
  // the frame. Measured on a real render, the badge sat inside 20% but the
  // lettering reached x=1489 of 2160 (31%) and survived. A centred garment can
  // never satisfy the corner test regardless of band width — its bounding box
  // spans the middle — so widening only reaches further into the corners.
  islandMarginBand: 0.35,
} satisfies Required<NormalizeBackgroundOptions>;

export interface BackgroundMaskResult {
  /** 255 where the pixel is backdrop, 0 elsewhere. Empty when skipped. */
  mask: Uint8Array;
  /** False when the guards declined to touch the image. */
  applied: boolean;
  /** Median border color, or null when sampling was skipped. */
  sampled: { r: number; g: number; b: number } | null;
  /** Fraction of the frame classified as backdrop. */
  coverage: number;
  /** Populated when applied is false. */
  skipReason?: string;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

/**
 * Classify which pixels belong to the backdrop.
 *
 * Exported separately from the sharp round-trip so the guards and the
 * flood-fill containment can be tested on small hand-built fixtures.
 */
export function computeBackgroundMask(
  data: Uint8Array | Buffer,
  width: number,
  height: number,
  channels: number,
  options: NormalizeBackgroundOptions = {}
): BackgroundMaskResult {
  const opts = { ...DEFAULTS, ...options };
  const pixelCount = width * height;
  const empty = new Uint8Array(0);

  if (width < 3 || height < 3) {
    return { mask: empty, applied: false, sampled: null, coverage: 0, skipReason: "image too small" };
  }

  // --- Sample the border ring (inset 1px to dodge encoder edge artifacts) ---
  const rs: number[] = [];
  const gs: number[] = [];
  const bs: number[] = [];
  const sample = (x: number, y: number) => {
    const i = (y * width + x) * channels;
    rs.push(data[i]);
    gs.push(data[i + 1]);
    bs.push(data[i + 2]);
  };
  const step = Math.max(1, Math.floor(Math.min(width, height) / 128));
  for (let x = 1; x < width - 1; x += step) {
    sample(x, 1);
    sample(x, height - 2);
  }
  for (let y = 1; y < height - 1; y += step) {
    sample(1, y);
    sample(width - 2, y);
  }

  const sampled = { r: median(rs), g: median(gs), b: median(bs) };

  // --- Guards: only touch images that actually look like a studio sweep ---
  // A model-studio scene, a lifestyle shot, or a deliberately colored
  // backdrop must pass through untouched.
  const minChannel = Math.min(sampled.r, sampled.g, sampled.b);
  const spread = Math.max(sampled.r, sampled.g, sampled.b) - minChannel;
  if (minChannel < opts.minBrightness) {
    return {
      mask: empty,
      applied: false,
      sampled,
      coverage: 0,
      skipReason: `border too dark (min channel ${minChannel} < ${opts.minBrightness})`,
    };
  }
  if (spread > opts.maxChannelSpread) {
    return {
      mask: empty,
      applied: false,
      sampled,
      coverage: 0,
      skipReason: `border not neutral (channel spread ${spread} > ${opts.maxChannelSpread})`,
    };
  }

  // --- Flood fill inward from every border pixel within tolerance ---
  // Iterative with an explicit stack: at 2160x2700 a recursive fill would
  // blow the call stack.
  const mask = new Uint8Array(pixelCount);
  const stack = new Int32Array(pixelCount);
  let top = 0;
  const toleranceSq = opts.tolerance * opts.tolerance;

  const withinTolerance = (index: number): boolean => {
    const i = index * channels;
    const dr = data[i] - sampled.r;
    const dg = data[i + 1] - sampled.g;
    const db = data[i + 2] - sampled.b;
    return dr * dr + dg * dg + db * db <= toleranceSq;
  };

  const push = (index: number) => {
    if (mask[index]) return;
    if (!withinTolerance(index)) return;
    mask[index] = 255;
    stack[top++] = index;
  };

  for (let x = 0; x < width; x++) {
    push(x);
    push((height - 1) * width + x);
  }
  for (let y = 0; y < height; y++) {
    push(y * width);
    push(y * width + width - 1);
  }

  let filled = top;
  while (top > 0) {
    const index = stack[--top];
    const x = index % width;
    const y = (index - x) / width;
    if (x > 0 && !mask[index - 1] && withinTolerance(index - 1)) {
      mask[index - 1] = 255;
      stack[top++] = index - 1;
      filled++;
    }
    if (x < width - 1 && !mask[index + 1] && withinTolerance(index + 1)) {
      mask[index + 1] = 255;
      stack[top++] = index + 1;
      filled++;
    }
    if (y > 0 && !mask[index - width] && withinTolerance(index - width)) {
      mask[index - width] = 255;
      stack[top++] = index - width;
      filled++;
    }
    if (y < height - 1 && !mask[index + width] && withinTolerance(index + width)) {
      mask[index + width] = 255;
      stack[top++] = index + width;
      filled++;
    }
  }

  filled += absorbStrandedIslands(mask, width, height, opts);

  const coverage = filled / pixelCount;
  if (coverage === 0) {
    return { mask: empty, applied: false, sampled, coverage, skipReason: "no border-connected background" };
  }
  if (coverage > opts.maxCoverage) {
    return {
      mask: empty,
      applied: false,
      sampled,
      coverage,
      skipReason: `fill swallowed the frame (coverage ${coverage.toFixed(4)})`,
    };
  }

  return { mask, applied: true, sampled, coverage };
}

/**
 * Paint over anything the flood fill stranded in the margin.
 *
 * The fill stops at any pixel outside tolerance, so a mark sitting ON the
 * backdrop survives as an island of "not background" — it is never reached
 * from the border because the mark itself blocks the way. Nano Banana
 * hallucinates a "HIGGSFIELD AI" watermark into the bottom-right corner (three
 * times across six live runs), and it came through every prompt-level attempt
 * to forbid it, including one that explicitly named watermarks. Prompting
 * cannot reliably suppress a decode-time artifact, so this is deterministic.
 *
 * Two conditions, both required, so real garment detail is never eaten:
 *   1. the island is tiny — under maxIslandArea of the frame, and
 *   2. its whole bounding box sits in a CORNER, inside the margin band on both
 *      axes. A single-axis band is too loose: the second half of a two-piece
 *      set sits low but horizontally centred and would be eaten by it.
 * A garment is centred by the composition standard, so no part of it can
 * satisfy both conditions.
 *
 * Known limit: a watermark stamped at bottom-CENTRE would survive. Corner-only
 * is the conservative choice — eating real garment detail is far worse than
 * leaving a mark for the operator to catch.
 *
 * Returns how many pixels were absorbed, so coverage stays accurate.
 */
export function absorbStrandedIslands(
  mask: Uint8Array,
  width: number,
  height: number,
  opts: { maxIslandArea: number; islandMarginBand: number }
): number {
  const pixelCount = width * height;
  const maxArea = opts.maxIslandArea * pixelCount;
  const bandX = opts.islandMarginBand * width;
  const bandY = opts.islandMarginBand * height;
  const seen = new Uint8Array(pixelCount);
  const stack = new Int32Array(pixelCount);
  let absorbed = 0;

  for (let start = 0; start < pixelCount; start++) {
    if (mask[start] || seen[start]) continue;

    // Flood the connected not-background component containing `start`.
    let top = 0;
    stack[top++] = start;
    seen[start] = 1;
    const members: number[] = [];
    let minX = width, maxX = -1, minY = height, maxY = -1;

    while (top > 0) {
      const index = stack[--top];
      members.push(index);
      const x = index % width;
      const y = (index - x) / width;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;

      if (x > 0 && !mask[index - 1] && !seen[index - 1]) { seen[index - 1] = 1; stack[top++] = index - 1; }
      if (x < width - 1 && !mask[index + 1] && !seen[index + 1]) { seen[index + 1] = 1; stack[top++] = index + 1; }
      if (y > 0 && !mask[index - width] && !seen[index - width]) { seen[index - width] = 1; stack[top++] = index - width; }
      if (y < height - 1 && !mask[index + width] && !seen[index + width]) { seen[index + width] = 1; stack[top++] = index + width; }
    }

    if (members.length > maxArea) continue; // too big to be an artifact
    // Corner test: margin on BOTH axes. A band on one axis alone is too loose —
    // the second half of a two-piece set sits low in the frame but horizontally
    // centred, and would be eaten by a vertical-only test.
    const marginX = maxX < bandX || minX > width - bandX;
    const marginY = maxY < bandY || minY > height - bandY;
    if (!(marginX && marginY)) continue; // not cornered: treat as garment

    for (const index of members) mask[index] = 255;
    absorbed += members.length;
  }

  return absorbed;
}

export interface NormalizeBackgroundResult {
  /** Normalized image, or the original bytes when the guards declined. */
  buffer: Buffer;
  applied: boolean;
  coverage: number;
  sampled: { r: number; g: number; b: number } | null;
  skipReason?: string;
}

/**
 * Decode, normalize, and re-encode. Returns the input untouched (same format,
 * no recompression) whenever the guards decline, so non-studio images and
 * failures both degrade to a no-op.
 */
export async function normalizeStudioBackground(
  input: Buffer,
  format: "png" | "jpeg" = "jpeg",
  options: NormalizeBackgroundOptions = {}
): Promise<NormalizeBackgroundResult> {
  const opts = { ...DEFAULTS, ...options };
  const { data, info } = await sharp(input).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;

  const result = computeBackgroundMask(data, width, height, channels, opts);
  if (!result.applied) {
    return {
      buffer: input,
      applied: false,
      coverage: result.coverage,
      sampled: result.sampled,
      skipReason: result.skipReason,
    };
  }

  // Feather the mask so the garment edge doesn't get a hard halo where
  // anti-aliased pixels sit between fabric and backdrop.
  //
  // NOTE: sharp expands a raw 1-channel input to 3 channels through blur(),
  // so the result must be strided by its reported channel count rather than
  // indexed per pixel. Indexing it directly reads interleaved RGB and
  // misaligns the mask against the image.
  let alpha: Uint8Array | Buffer = result.mask;
  let alphaStride = 1;
  if (opts.featherSigma > 0) {
    const blurred = await sharp(Buffer.from(result.mask), { raw: { width, height, channels: 1 } })
      .blur(opts.featherSigma)
      .raw()
      .toBuffer({ resolveWithObject: true });
    alpha = blurred.data;
    alphaStride = blurred.info.channels;
  }

  const out = Buffer.from(data);
  const { r, g, b } = STUDIO_BACKGROUND_RGB;
  for (let p = 0; p < width * height; p++) {
    const a = alpha[p * alphaStride];
    if (a === 0) continue;
    const i = p * channels;
    if (a === 255) {
      out[i] = r;
      out[i + 1] = g;
      out[i + 2] = b;
      continue;
    }
    const w = a / 255;
    out[i] = Math.round(out[i] * (1 - w) + r * w);
    out[i + 1] = Math.round(out[i + 1] * (1 - w) + g * w);
    out[i + 2] = Math.round(out[i + 2] * (1 - w) + b * w);
  }

  const pipeline = sharp(out, { raw: { width, height, channels } });
  const buffer =
    format === "png"
      ? await pipeline.png({ compressionLevel: 8 }).toBuffer()
      : await pipeline.jpeg({ quality: 92, mozjpeg: true }).toBuffer();

  return { buffer, applied: true, coverage: result.coverage, sampled: result.sampled };
}
