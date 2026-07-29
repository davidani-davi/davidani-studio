import { fal } from "@fal-ai/client";
import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";
import { MODELS, type ModelId } from "./models";
import { optimizePromptForModel } from "./prompt-strategy";
import type { CadSpec } from "./cad-prompts";
import { CAD_SPEC_SYSTEM_PROMPT, CAD_SPEC_USER_PROMPT } from "./cad-prompts";
import {
  canPassThroughKieUpload,
  hasKieSupportedImageExtension,
  isTrustedKieNormalizationHost,
  KIE_SUPPORTED_IMAGE_MIME_TYPES,
} from "./kie-image-compat";

let configured = false;
function ensureConfigured() {
  if (configured) return;
  const key = process.env.FAL_KEY;
  if (!key) throw new Error("FAL_KEY environment variable is missing.");
  fal.config({ credentials: key });
  configured = true;
}

/**
 * Vision model used by every analyzer pass (garment fields, model photo,
 * inspiration analysis, design-studio concept extraction). Centralized so a
 * single swap propagates everywhere.
 *
 * Claude Haiku 4.5 — chosen over Sonnet 3.7 because the analyzer task is
 * constrained-format extraction (GARMENT / FEATURES / POSE / SCENE noun
 * phrases), where Haiku's accuracy is comparable but ~2x faster (saves
 * ~3s per generation).
 */
const VISION_MODEL = "anthropic/claude-haiku-4.5";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableVisionError(err: unknown): boolean {
  const message = String(
    (err as any)?.message ||
      (err as any)?.body?.detail ||
      (err as any)?.body?.error ||
      err ||
      ""
  ).toLowerCase();
  return (
    /bad gateway|gateway|502|upstream|overloaded|temporarily unavailable|service unavailable|rate.?limit|529|overloaded/.test(
      message
    )
  );
}

async function subscribeVisionWithRetry(
  input: Record<string, unknown>,
  label: string
): Promise<any> {
  ensureConfigured();
  const delays = [0, 700, 1600];
  let lastErr: unknown;

  for (let attempt = 0; attempt < delays.length; attempt++) {
    if (delays[attempt] > 0) await sleep(delays[attempt]);
    try {
      return await fal.subscribe("fal-ai/any-llm/vision", {
        input,
        logs: false,
      });
    } catch (err) {
      lastErr = err;
      if (!isRetryableVisionError(err) || attempt === delays.length - 1) break;
      console.warn(`[${label}] transient vision error on attempt ${attempt + 1}, retrying:`, err);
    }
  }

  const finalMessage =
    (lastErr as any)?.message ||
    (lastErr as any)?.body?.detail ||
    (lastErr as any)?.body?.error ||
    String(lastErr) ||
    "unknown error";
  throw new Error(`${label} failed: ${finalMessage}`);
}

/**
 * Reads a product-shot style-reference image from public/product-shots/ and uploads it to fal.ai once,
 * caching the resulting URL in memory per "kind". Returns null if no file exists.
 *
 * Routing:
 *   - kind === "pants" → matches public/product-shots/style-reference-2.{png,jpg,jpeg,webp}
 *   - kind === "other" → matches public/product-shots/style-reference.{png,jpg,jpeg,webp}
 *                        (explicitly EXCLUDES style-reference-2.*)
 *
 * The style reference is appended as the LAST image_url on every generation,
 * giving Nano Banana a visual anchor for composition, lighting, and background.
 */
type StyleReferenceKind = "pants" | "other";

const cachedStyleReferenceUrls: Partial<Record<StyleReferenceKind, string>> = {};
const styleReferenceUploadsInFlight: Partial<
  Record<StyleReferenceKind, Promise<string | null>>
> = {};
const cachedPublicAssetUrls: Record<string, string> = {};
const publicAssetUploadsInFlight: Partial<Record<string, Promise<string>>> = {};

function localPublicPathFromUrl(input: string): string | null {
  const raw = String(input || "").trim();
  if (!raw || raw.startsWith("data:") || raw.startsWith("blob:")) return null;

  let pathname = raw;
  try {
    const parsed = new URL(raw);
    const host = parsed.hostname.toLowerCase();
    const isLocalHost =
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "::1" ||
      host.endsWith(".local");
    if (!isLocalHost) return null;
    pathname = parsed.pathname;
  } catch {
    if (!raw.startsWith("/")) return null;
  }

  const decoded = decodeURIComponent(pathname.split("?")[0] || "");
  if (!decoded.startsWith("/")) return null;
  return decoded;
}

async function uploadLocalPublicImageUrl(input: string): Promise<string> {
  const publicPath = localPublicPathFromUrl(input);
  if (!publicPath) return input;

  const relative = publicPath.replace(/^\/+/, "");
  const publicRoot = path.join(process.cwd(), "public");
  const fullPath = path.normalize(path.join(publicRoot, relative));
  if (!fullPath.startsWith(publicRoot + path.sep)) {
    throw new Error(`Refusing to read image outside public/: ${publicPath}`);
  }
  if (!fs.existsSync(fullPath)) {
    throw new Error(`Local reference image not found in public/: ${publicPath}`);
  }

  if (cachedPublicAssetUrls[fullPath]) return cachedPublicAssetUrls[fullPath];
  if (publicAssetUploadsInFlight[fullPath]) return publicAssetUploadsInFlight[fullPath];

  const upload = (async () => {
    const filename = path.basename(fullPath);
    const ext = path.extname(filename).slice(1).toLowerCase();
    const mimeType =
      ext === "jpg" || ext === "jpeg"
        ? "image/jpeg"
        : ext === "webp"
        ? "image/webp"
        : ext === "gif"
        ? "image/gif"
        : "image/png";
    const buffer = fs.readFileSync(fullPath);
    const url = await uploadToFal(new Blob([buffer], { type: mimeType }), filename);
    cachedPublicAssetUrls[fullPath] = url;
    console.log(`[public-image] uploaded ${publicPath} → ${url}`);
    return url;
  })().finally(() => {
    delete publicAssetUploadsInFlight[fullPath];
  });

  publicAssetUploadsInFlight[fullPath] = upload;
  return upload;
}

async function prepareGeneratorImageUrls(urls: string[]): Promise<string[]> {
  return Promise.all(urls.map((url) => uploadLocalPublicImageUrl(url)));
}

export async function getStyleReferenceUrl(
  kind: StyleReferenceKind = "other"
): Promise<string | null> {
  if (cachedStyleReferenceUrls[kind]) return cachedStyleReferenceUrls[kind]!;

  const targetStem = kind === "pants" ? "style-reference-2" : "style-reference";
  const publicDir = path.join(process.cwd(), "public", "product-shots");
  const imageExts = new Set(["png", "jpg", "jpeg", "webp"]);

  const findFile = (): string | null => {
    if (!fs.existsSync(publicDir)) return null;
    const entries = fs.readdirSync(publicDir);
    return (
      entries.find((name) => {
        const lower = name.toLowerCase();
        const parts = lower.split(".");
        const last = parts[parts.length - 1];
        if (!imageExts.has(last)) return false;
        return parts[0] === targetStem;
      }) ?? null
    );
  };

  // On Vercel, public/product-shots/ files are served from the CDN at a stable
  // URL. Return that directly instead of uploading to fal.ai on every cold start.
  const vercelHost =
    process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
  if (vercelHost) {
    const found = findFile();
    if (!found) {
      console.warn(
        `[style-reference] no file matching ${targetStem}.* found in public/product-shots/ (kind=${kind})`
      );
      return null;
    }
    const url = `https://${vercelHost}/product-shots/${found}`;
    cachedStyleReferenceUrls[kind] = url;
    console.log(`[style-reference] CDN URL: ${url} (kind=${kind})`);
    return url;
  }

  // Local dev fallback: upload to fal.ai once and cache in memory.
  if (styleReferenceUploadsInFlight[kind]) return styleReferenceUploadsInFlight[kind]!;

  const upload = (async () => {
    const found = findFile();
    if (!found) {
      console.warn(
        `[style-reference] no file matching ${targetStem}.* found in public/product-shots/ (kind=${kind})`
      );
      return null;
    }

    ensureConfigured();
    const fullPath = path.join(publicDir, found);
    const buffer = fs.readFileSync(fullPath);
    const ext = path.extname(found).slice(1).toLowerCase();
    const mimeType = ext === "jpg" || ext === "jpeg" ? "image/jpeg" : `image/${ext}`;
    const blob = new Blob([buffer], { type: mimeType });
    const url = await uploadToFal(blob, found);
    console.log(`[style-reference] uploaded ${found} → ${url} (kind=${kind})`);
    cachedStyleReferenceUrls[kind] = url;
    return url;
  })().finally(() => {
    styleReferenceUploadsInFlight[kind] = undefined;
  });

  styleReferenceUploadsInFlight[kind] = upload;
  return upload;
}

/**
 * Infer a garment category from the prompt text so we can pick the right
 * style-reference image. Falls back to "other" when no pants keyword matches.
 */
function inferGarmentCategory(prompt: string): StyleReferenceKind {
  // Unambiguous bottoms-only terms. We deliberately exclude words like
  // "short" (matches "short sleeve"), "cargo" (matches "cargo pocket"),
  // "denim" (matches "denim jacket"), and "pant" singular — too false-positive
  // on upper-body garments.
  const pantsWords = [
    "pants",
    "trousers",
    "jeans",
    "shorts",
    "chinos",
    "joggers",
    "sweatpants",
    "slacks",
    "leggings",
    "khakis",
    "corduroys",
  ];
  for (const w of pantsWords) {
    if (new RegExp(`\\b${w}\\b`, "i").test(prompt)) return "pants";
  }
  return "other";
}

/* ===========================================================================
 * DESCRIPTOR DISCIPLINE — derived from one-word-at-a-time prompt tests.
 * ---------------------------------------------------------------------------
 * Two findings drive this:
 *
 *   1. Duplicates kill.  When the same descriptor token appears twice in the
 *      final assembled prompt (e.g. "soft sweater handfeel" in FEATURES and
 *      "soft folds" in the template), the edit model's attention on that
 *      slot diffuses and the output reliably degrades — sometimes to a
 *      no-edit pass-through.
 *
 *   2. Non-physical descriptors dilute the slot they occupy.  Words like
 *      "easy", "medium", "moderate", "basic", "nice", "standard" don't
 *      name a visible/renderable property, so the image model treats the
 *      whole clause as low-signal.
 *
 * We enforce both at assembly time: the analyzer output (GARMENT, FEATURES,
 * or the five Model Studio fields) is scanned, forbidden descriptors are
 * removed, and any descriptor-token that already appears in the static
 * template text is stripped from the analyzer output so the final prompt
 * contains each descriptor at most once.
 * ======================================================================== */

/**
 * Descriptor tokens that function as load-bearing adjective-slot words in
 * garment prompts. Test evidence shows duplicating any of these across the
 * final prompt degrades edit quality. Nouns and pattern names (e.g. "ribbed",
 * "quilted", "knit", "denim") are intentionally omitted because those bind
 * to concrete garment parts and repeating them is descriptive, not diluting.
 */
const DESCRIPTOR_TOKENS = new Set<string>([
  // drape / fit / silhouette character
  "soft", "gentle", "natural", "relaxed", "loose", "light", "subtle",
  "tailored", "crisp", "smooth", "clean", "fresh", "defined", "balanced",
  "delicate", "cozy", "rich", "fine", "even",
  "structured", "fluid", "fitted", "cropped", "oversized", "slim", "boxy",
  // manner / quality adverbs
  "perfect", "perfectly", "neat", "neatly", "freshly",
  // color intensity / temperature
  "bright", "vivid", "saturated", "deep", "pale", "warm", "cool",
]);

/**
 * Tokens that name quantifiers, category labels, or colloquial qualities
 * rather than visible/renderable physical properties. The edit model cannot
 * render any of these, so whichever descriptor slot they occupy becomes a
 * dead clause. We strip them from analyzer output before assembly.
 */
const NON_PHYSICAL_DESCRIPTORS = new Set<string>([
  "easy", "medium", "moderate", "nice", "great",
  "beautiful", "basic", "standard", "regular", "normal",
]);

/**
 * Scan a static template string for descriptor tokens it already contains.
 * Used to pre-seed the "already used" set before sanitizing dynamic analyzer
 * output, so analyzer words that collide with the template are stripped.
 */
function descriptorsInTemplate(text: string): Set<string> {
  const used = new Set<string>();
  const matches = text.toLowerCase().match(/\b[a-z][a-z-]*\b/g) || [];
  for (const w of matches) {
    if (DESCRIPTOR_TOKENS.has(w)) used.add(w);
  }
  return used;
}

/**
 * Clean analyzer output according to the descriptor-discipline rules:
 *
 *   - Drop any NON_PHYSICAL_DESCRIPTORS token.
 *   - Drop any DESCRIPTOR_TOKENS token whose lowercase form is already in
 *     `alreadyUsed` (i.e. already present in the template or earlier analyzer
 *     output that was sanitized before this call).
 *   - Mutates `alreadyUsed` by adding descriptor tokens this call kept.
 *
 * Punctuation and spacing are cleaned up after token removal so the output
 * reads naturally (no double commas, no stranded spaces).
 */
function sanitizeAnalyzerText(text: string, alreadyUsed: Set<string>): string {
  if (!text) return text;
  // Split so word tokens and non-word segments interleave; we rewrite word
  // tokens in place and keep punctuation/whitespace intact.
  const parts = text.split(/(\b[A-Za-z][A-Za-z-]*\b)/);
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (!/^[A-Za-z]/.test(part)) continue;
    const w = part.toLowerCase();
    if (NON_PHYSICAL_DESCRIPTORS.has(w)) {
      parts[i] = "";
      continue;
    }
    if (DESCRIPTOR_TOKENS.has(w)) {
      if (alreadyUsed.has(w)) {
        parts[i] = "";
      } else {
        alreadyUsed.add(w);
      }
    }
  }
  return parts
    .join("")
    // collapse runs of whitespace introduced by dropped tokens
    .replace(/[ \t]+/g, " ")
    // clean up stranded punctuation left behind by dropped tokens
    .replace(/\s+([,.;:!?)])/g, "$1")
    .replace(/\(\s+/g, "(")
    .replace(/,\s*,/g, ",")
    .replace(/^\s*,\s*/, "")
    .replace(/,\s*$/, "")
    .trim();
}

/**
 * Analyzer system prompt. Output is parsed into GARMENT + FEATURES and folded
 * into the deterministic garment-swap prompt built by buildTwoImagePrompt,
 * which instructs the image model to preserve the primary studio scene while
 * rendering the user's garment (described here) fresh on top of it.
 */
const ANALYSIS_SYSTEM_PROMPT = `You are a product catalog analyzer. You see a single garment photograph and must output exactly two lines, in this exact format, with no preamble, no markdown, and no extra lines:

GARMENT: <a short noun phrase describing the garment — include primary color, fabric/texture, an EXPLICIT SILHOUETTE / CUT / FIT descriptor (e.g. barrel-fit, wide-leg, straight-leg, slim, skinny, tapered, flared, bootcut, boxy, oversized, cropped, fitted, relaxed, A-line, bodycon), and the garment type. Examples: "soft fuzzy knit baby blue oversized cardigan", "barrel-fit dark indigo denim jeans", "cropped white ribbed cotton tank top", "boxy black cotton hoodie", "wide-leg hot pink leopard print sweatpants">
FEATURES: <comma-separated noun phrases enumerating clearly visible structural details. ALWAYS begin with a silhouette clause that restates the cut/fit/leg-shape/body-shape in concrete visual terms (e.g. "a rounded barrel-shaped leg that curves outward through the thigh and knee then tapers to a narrow ankle cuff", "a straight leg of even width from hip to ankle", "a boxy torso that hangs loose from shoulder to hip without tapering", "a fitted torso that follows the body closely through the waist"). Then enumerate the remaining details. Examples: "a rounded barrel-shaped leg that curves outward through the thigh and knee then tapers to a narrow ankle cuff, a drawstring waistband, two side pockets, a back patch pocket" or "a boxy torso that hangs loose from shoulder to hip, a crew neckline, ribbed collar, cuffs, and hem, five small round white buttons aligned vertically down the center placket, long sleeves">

SHAPE DISAMBIGUATION — check the overall silhouette BEFORE writing anything:

- TWO PARALLEL TUBES extending downward from a waistband, with elastic or cuffs at the bottom and NO neckline = BOTTOM (pants, trousers, jeans, shorts, leggings, sweatpants, joggers, chinos, slacks, corduroys). The GARMENT line MUST end with a bottom word like "sweatpants", "joggers", "pants", "jeans", or "shorts". Never call these a "shirt" or "top".
- A clear NECKLINE at the top + TWO SLEEVES extending horizontally from the sides of the torso = TOP (shirt, t-shirt, hoodie, sweatshirt, jacket, blazer, cardigan, blouse, tank top). The GARMENT line must end with a top word.
- NEVER identify a garment as a "shirt", "top", or "hoodie" if you can see two parallel leg-shaped tubes extending downward — those are pant legs, not sleeves.
- NEVER identify a garment as "pants" if you see a clear neckline or if the two extensions spread horizontally from a central torso.
- A drawstring waistband + two long parallel tubes + elastic/tapered ankles = pants/sweatpants/joggers, regardless of color or pattern.
- If the garment is laid flat and wider than it is tall, it is almost always a top. If it is taller than it is wide with two parallel tubes, it is almost always a bottom.

ANTI-HALLUCINATION RULES — violating any of these produces bad outputs:

- NEVER invent text, letters, numbers, logos, brand names, or made-up words. If a logo or text is not clearly, unambiguously legible, OMIT it.
- NEVER describe individual motifs inside a print/pattern. If the garment has a print, name only the PATTERN TYPE inline in GARMENT (e.g. "leopard print silk blouse", "plaid flannel shirt", "floral print midi dress", "hot pink leopard print sweatpants") and do NOT mention the print again in FEATURES.
- NEVER write speculative multi-clause sentences. If you are unsure about a detail, OMIT it.
- Use only real, common English words. No invented or archaic vocabulary.
- Describe only the garment itself. Ignore the photo's background, hanger, mannequin, lighting, and shadows.
- Do NOT state a count unless you can count with certainty.
- FEATURES must match the garment's true category. Do NOT list "sleeve straps", "neckline", or "cuffs at the wrist" for a BOTTOM. Do NOT list "waistband", "legs", or "ankle cuffs" for a TOP.
- NEVER guess a hardware material. If a button, zipper pull, rivet, eyelet, or buckle's material cannot be identified with certainty from the photograph, describe ONLY its color and shape (e.g. "round cream buttons", "flat tan buttons", "small silver-colored zipper"). Do NOT write speculative material qualifiers like "pearl", "pearl-like", "horn", "horn-look", "bone", "faux-bone", "wooden", "wood-look", "metallic", "brass-looking", "leather-like", or "tortoiseshell". These get rendered literally by the image model and change the hardware's appearance.
- NEVER use the word "trim" or "trimmed" unless the trim is clearly a DIFFERENT color from the rest of the garment body. A ruffle, frill, or ruffled edge in the SAME color as the body is self-fabric and must be described as "self-fabric ruffle", "ruffled edge in the same color as the body", or simply by the shape alone (e.g. "ruffled collar") — the catalog word "trim" implies contrast color to the image model and will introduce a contrasting band that isn't in the source.
- NEVER use hedge qualifiers such as "-like", "-looking", "-style", "-ish", "sort of", "kind of", or "appears to be". If you cannot identify a detail with certainty, OMIT it entirely. Hedges get flattened into the assertive detail they were hedging.

DESCRIPTOR DISCIPLINE — these rules come from controlled prompt tests and are not optional:

- Use only words that name a visible, renderable physical property: color, shape, texture, material, fit, hardware, construction. The image model cannot render abstract or quantifier words.
- NEVER use abstract or quantifier words such as: "easy", "medium", "moderate", "nice", "great", "beautiful", "basic", "standard", "regular", "normal". These weaken the descriptor slot they occupy.
- NEVER repeat the same descriptor word across your GARMENT and FEATURES lines. Each descriptor token (e.g. "soft", "relaxed", "tailored") must appear at most ONCE across both lines. If a word is used in GARMENT, pick a different word in FEATURES.
- Pick fabric-consistent adjectives. Do NOT describe a knit as "crisp", a denim as "drapey", a silk as "stiff" — cross-domain words contradict the material and degrade the output.

OUTPUT FORMAT RULES:
- Output exactly two lines: one starting with "GARMENT:", one starting with "FEATURES:".
- No preamble, no markdown, no code fences, no extra commentary.`;

export interface AnalyzeOptions {
  /** Kept for backwards compatibility; no longer used. */
  backgroundColor?: string;
}

export interface AnalyzedGarment {
  /** Final assembled prompt, ready to hand to the image generator. */
  prompt: string;
  /** Parsed noun phrase describing the garment (used in the template). */
  garment: string;
  /** Parsed comma-separated noun phrases enumerating features. */
  features: string;
}

function parseGarmentAnalysisOutput(output: string, label: string): { garment: string; features: string } {
  const garmentMatch = output.match(/GARMENT:\s*(.+?)\s*(?:\r?\n|$)/i);
  const featuresMatch = output.match(/FEATURES:\s*([\s\S]+?)\s*(?:\r?\n(?=[A-Z ]+:)|$)/i);
  const garment = (garmentMatch?.[1] || "").trim().replace(/\.$/, "");
  const features = (featuresMatch?.[1] || "").trim().replace(/\.$/, "");

  if (!garment) {
    console.error(`[${label}] could not parse GARMENT from output:`, output.slice(0, 400));
    throw new Error("Analyzer did not return a GARMENT line.");
  }

  return { garment, features };
}

async function extractCatalogGarmentFields(imageUrl: string, label = "analyze") {
  const result: any = await subscribeVisionWithRetry(
    {
      model: VISION_MODEL,
      system_prompt: ANALYSIS_SYSTEM_PROMPT,
      prompt:
        "Analyze the garment in this photograph using the two-line GARMENT / FEATURES format defined in your system prompt. Output exactly those two lines, nothing else.",
      image_url: imageUrl,
    },
    "garment analysis"
  );

  const data = result?.data ?? result;
  console.log(`[${label}] raw response keys:`, Object.keys(data || {}));
  console.log(`[${label}] usage:`, data?.usage);

  const output: string = (data?.output ?? data?.response ?? data?.text ?? "").trim();
  if (!output) {
    console.error(`[${label}] full response:`, JSON.stringify(data).slice(0, 1000));
    throw new Error("Vision analysis returned no text output.");
  }

  const fields = parseGarmentAnalysisOutput(output, label);
  console.log(`[${label}] garment:`, fields.garment);
  console.log(`[${label}] features:`, fields.features);
  return fields;
}

function buildFrontBackContractPrompt(front: { garment: string; features: string }, back: { garment: string; features: string }) {
  const contractFeatures = [
    front.features ? `Front-facing source of truth: ${front.features}` : "",
    back.features ? `Back-facing source of truth: ${back.features}` : "",
    "The first uploaded product image supplies the front truth and the second uploaded product image supplies the back truth for the same physical SKU.",
    "Merge both product references into one complete garment identity, not two garments and not two design options.",
    "Preserve front and back construction consistently: body length, hem geometry, sleeve or leg length, silhouette, fabric, wash, color, pockets, seams, cuffs, waistband, neckline, closures, trims, graphics, artwork placement, and hardware.",
    "When the final product-shot angle exposes any back-facing details, use the second uploaded image as the back source of truth. When the angle exposes front-facing details, use the first uploaded image as the front source of truth.",
  ]
    .filter(Boolean)
    .join(", ");
  const garment = front.garment || back.garment || "uploaded apparel product";
  return buildTwoImagePrompt(garment, contractFeatures);
}

/**
 * Assemble the final garment-swap prompt from the parsed GARMENT + FEATURES.
 *
 * IMPORTANT — no "image 1" / "image 2" numerical labels. Gemini-based edit
 * models (Nano Banana) don't reliably map those labels back to image_urls[0]
 * vs image_urls[1]; the labels can swap interpretations run-to-run. We use
 * content-descriptive language instead ("the primary studio scene" / "the
 * attached reference photograph"). The API array order still does the real
 * semantic work: image_urls[0] is the canvas, later images are references.
 */
export function buildTwoImagePrompt(garment: string, features: string): string {
  // Inner renderer — called once to introspect the static template, then
  // again with sanitized analyzer output.
  const render = (g: string, f: string): string => {
    const featureClause = f
      ? ` The replacement garment has these visible properties (match exactly): ${f}.`
      : "";
    return (
      `Catalog garment-swap edit. Replace the garment currently shown in the primary studio ` +
      `photograph with a different garment: a ${g}.${featureClause} ` +
      `The exact appearance of the replacement garment — its color, pattern, fabric texture, ` +
      `hardware, SILHOUETTE, CUT, FIT, leg shape, body shape, volume, length, and every visible ` +
      `detail — is given by the attached reference photograph of that garment; use the reference ` +
      `photograph strictly as the visual source of truth for how the replacement garment should ` +
      `look. ` +
      // Silhouette-authority clause. Without this, Nano Banana tends to
      // inherit the overall garment shape from image_urls[0] (the studio
      // canvas), which defeats uploads where the user's garment has a
      // distinctive cut — e.g. a barrel-fit jean rendered onto a straight-leg
      // flat-lay canvas kept coming out straight. We explicitly split the two
      // sources: canvas provides the scene, reference provides the shape.
      `SILHOUETTE AUTHORITY: the overall silhouette, cut, fit, and shape of the replacement ${g} ` +
      `(including leg width and curvature for bottoms, torso fit and length for tops, hem shape ` +
      `for dresses/skirts) MUST be taken from the attached reference photograph of the garment, ` +
      `NOT from the garment currently shown in the primary studio photograph. If the reference ` +
      `garment is a barrel-fit, the rendered garment must be barrel-fit. If the reference is ` +
      `wide-leg, render wide-leg. If the reference is oversized or boxy, render oversized or boxy. ` +
      `Do not normalize, slim down, straighten, or otherwise alter the reference silhouette to ` +
      `match whatever garment was originally on the canvas. ` +
      `PRESERVE from the primary studio photograph (do not alter any of these): the clean solid ` +
      `studio background — the background must be rendered as a flat, solid, seamless color that ` +
      `exactly matches hex #edeeee (a soft neutral cool-gray) — do not shift warmer, cooler, ` +
      `brighter, or darker than #edeeee), soft diffused lighting, shadow character, camera angle, ` +
      `camera distance, framing, and centered composition. Do NOT inherit garment-shape cues ` +
      `(silhouette, cut, fit, leg width, torso fit, length) from the primary studio photograph — ` +
      `those come exclusively from the reference photograph. ` +
      `BACKGROUND UNIFORMITY: the studio background must be rendered as one perfectly flat, ` +
      `seamless solid color — hex #edeeee — across the ENTIRE frame, from the top edge to the ` +
      `bottom edge and from the left edge to the right edge. There must be no color patches, ` +
      `rectangular blocks, banding, tiling artifacts, gradient shifts, lighter or darker zones, ` +
      `or mismatched regions anywhere in the background. Every pixel of the background must ` +
      `match #edeeee; the background reads as a single continuous flat surface with no visible ` +
      `seams or transitions. ` +
      `STUDIO COMPOSITION STANDARD: this is a locked visual requirement — every output must match ` +
      `the primary studio photograph's composition exactly. Do not zoom in tighter or pull back ` +
      `wider than the canvas. The garment must occupy the same proportional area of the frame as ` +
      `it does in the primary studio photograph — do not scale up or scale down the subject. The ` +
      `full garment must be visible from the top (collar, hang point, or shoulder line) to the ` +
      `bottom hem — nothing cropped, nothing cut off at the edges. The garment is centered ` +
      `horizontally with equal left and right margins, and positioned at the same vertical height ` +
      `as the canvas. Camera is straight-on, perpendicular to the canvas plane — no tilt, no ` +
      `perspective shift, no barrel distortion, no lens compression change. Every output must ` +
      `feel as though it was photographed in the same studio session, at the same camera ` +
      `position and focal length, as the primary studio photograph. ` +
      `RENDER THE REPLACEMENT GARMENT FRESH — do not copy the wrinkles, folds, creases, twists, ` +
      `asymmetries, or specific placement of whatever garment was originally in the primary ` +
      `photograph. The new ${g} must be perfectly symmetrical along the vertical centerline, ` +
      `neatly laid flat with smooth, freshly-steamed fabric, no wrinkles, no creases, no bunched ` +
      `or twisted sections, and in the canonical catalog layout for its garment type (tops: ` +
      `sleeves angled slightly downward and symmetric; pants: waistband centered at top with the ` +
      `two legs laid parallel and symmetric about the vertical centerline WHILE RETAINING the ` +
      `reference garment's true leg-shape and leg-width (a barrel leg stays barrel, a flare stays ` +
      `flared, a wide leg stays wide); dresses and skirts: hem fanning gently and symmetrically ` +
      `per the reference silhouette). Symmetry and flat-lay cleanliness must NOT override the ` +
      `reference silhouette. ` +
      `The result must look like a brand-new, professionally styled catalog photograph taken in ` +
      `the same studio session as the primary photograph — same lighting, same camera, same ` +
      `background — but with a freshly arranged, crisp, symmetric ${g} whose SILHOUETTE matches ` +
      `the attached reference photograph. ` +
      `REMOVE ALL NECK LABELS, BRAND TAGS, SIZE TAGS, CARE LABELS, AND SEWN-IN WOVEN TAGS from the ` +
      `rendered garment — the inside of the neckline, collar band, and any other typical label ` +
      `location must be clean and empty with no tag, label, patch, or printed text of any kind ` +
      `showing. Hyper-realistic 4K e-commerce product photography, Zara-style catalog quality.`
    );
  };

  // Descriptor-discipline pass: scan the template's own fixed text for
  // descriptor tokens, then strip analyzer output that would duplicate them
  // (or introduce forbidden non-physical words). Garment is sanitized first
  // — it's more load-bearing than the features list.
  const used = descriptorsInTemplate(render("", ""));
  const cleanGarment = sanitizeAnalyzerText(garment, used);
  const cleanFeatures = sanitizeAnalyzerText(features, used);
  return render(cleanGarment, cleanFeatures);
}

export async function analyzeGarmentToPrompt(
  imageUrl: string,
  _opts: AnalyzeOptions = {}
): Promise<string> {
  const { garment, features } = await extractCatalogGarmentFields(imageUrl);
  const finalPrompt = buildTwoImagePrompt(garment, features);
  console.log("[analyze] final prompt preview:", finalPrompt.slice(0, 240));
  return finalPrompt;
}

export async function analyzeFrontBackGarmentToPrompt(
  frontImageUrl: string,
  backImageUrl: string,
  _opts: AnalyzeOptions = {}
): Promise<string> {
  const [front, back] = await Promise.all([
    extractCatalogGarmentFields(frontImageUrl, "analyze-front"),
    extractCatalogGarmentFields(backImageUrl, "analyze-back"),
  ]);
  const finalPrompt = buildFrontBackContractPrompt(front, back);
  console.log("[analyze-front-back] final prompt preview:", finalPrompt.slice(0, 240));
  return finalPrompt;
}

const RECOLORING_PROMPT_SYSTEM_PROMPT = `You are a senior fashion image-prompt writer for ChatGPT Image 2.0. You inspect one uploaded fashion image and write recoloring prompts for that exact garment only.

First analyze the image internally for: garment type, silhouette, fabric texture, construction details, trims, stitching, hardware, folds, lighting, background, camera angle, setup, environment, and whether a model is present.

Then output exactly 10 separate prompts, each on its own line.

Each prompt must:
- Preserve the garment silhouette, seams, stitching, fabric texture, folds, construction details, trims, buttons, drawstrings, hardware, and material behavior.
- Preserve any model, pose, body proportions, face, hair, background, lighting direction, shadows, camera angle, hanger setup, flat-lay setup, and environment.
- Only change the garment colorway.
- Use trend-forward, Gen Z-appealing, soft pastel, boutique-friendly color palettes inspired by Aritzia, Free People, Urban Outfitters, and young contemporary fashion.
- Maintain photorealistic fashion photography quality.
- Be tailored to the analyzed garment style. Knits should use soft marled gradients and cozy pastel tones. Denim should use washed indigo, grey, cream, cocoa, or muted color washes. Dresses should use feminine wearable solids or prints. Jackets should use elevated boutique-friendly color blocking. Use the best applicable logic for other garment types.

Output rules:
- Plain text only.
- Exactly 10 lines.
- No numbering, bullets, labels, markdown, quotes, intro, outro, or extra explanation.
- Each line must be a complete prompt for ChatGPT Image 2.0.
- Do not mention that you analyzed the image.`;

function normalizeRecoloringPrompts(raw: string): string {
  const lines = raw
    .split(/\r?\n/)
    .map((line) =>
      line
        .trim()
        .replace(/^["'`]+|["'`]+$/g, "")
        .replace(/^\s*(?:[-*•]|\d+[\.)]|Prompt\s*\d+\s*[:.)-])\s*/i, "")
        .trim()
    )
    .filter(Boolean);

  return lines.slice(0, 10).join("\n");
}

function parseRequestedColors(input: unknown): string[] {
  const raw = Array.isArray(input) ? input.join(", ") : typeof input === "string" ? input : "";
  return raw
    .split(/[\n,;]+|\band\b/i)
    .map((color) => color.trim().replace(/^["'`]+|["'`]+$/g, ""))
    .filter(Boolean)
    .slice(0, 10);
}

function buildRequestedColorInstruction(colors: string[]): string {
  if (colors.length === 0) {
    return "No user-requested colors were provided. Create all 10 colorways automatically based on the garment style.";
  }

  const aiChosenCount = 10 - colors.length;
  return (
    `User-requested colors: ${colors.join(", ")}.\n` +
    `There are ${colors.length} user-requested color${colors.length === 1 ? "" : "s"}. ` +
    `Exactly ${colors.length} of the 10 output lines must use the user-requested colors, with one prompt dedicated to each requested color. ` +
    `Use each requested color as the main garment colorway direction for its line, adapting it into a tasteful boutique-friendly palette when needed. ` +
    (aiChosenCount > 0
      ? `The remaining ${aiChosenCount} line${aiChosenCount === 1 ? "" : "s"} must use automatically chosen trend-forward colorways that do not simply repeat the requested-color directions.`
      : `All 10 lines must use the requested colors; do not add extra automatically chosen colorways.`)
  );
}

export async function generateRecoloringPrompts(
  imageUrl: string,
  requestedColorInput?: unknown
): Promise<string> {
  const requestedColors = parseRequestedColors(requestedColorInput);
  const result: any = await subscribeVisionWithRetry(
    {
      model: VISION_MODEL,
      system_prompt: RECOLORING_PROMPT_SYSTEM_PROMPT,
      prompt:
        "Create exactly 10 plain-text recoloring prompts for ChatGPT Image 2.0 from this garment image. Follow the system output rules exactly.\n\n" +
        buildRequestedColorInstruction(requestedColors),
      image_url: imageUrl,
    },
    "recoloring prompt generation"
  );

  const data = result?.data ?? result;
  const output: string = (data?.output ?? data?.response ?? data?.text ?? "").trim();
  if (!output) {
    console.error("[prompt-studio/recoloring] full response:", JSON.stringify(data).slice(0, 1000));
    throw new Error("Recoloring prompt generator returned no text output.");
  }

  const prompts = normalizeRecoloringPrompts(output);
  const count = prompts ? prompts.split(/\r?\n/).filter(Boolean).length : 0;
  if (count !== 10) {
    console.error("[prompt-studio/recoloring] expected 10 prompts, got:", count);
    console.error("[prompt-studio/recoloring] raw output:", output.slice(0, 1000));
    throw new Error("Recoloring prompt generator did not return exactly 10 prompts.");
  }

  return prompts;
}

const BESTSELLER_REMIX_PROMPT_SYSTEM_PROMPT = `You are a senior head designer, wholesale sales strategist, boutique buyer, ecommerce manager, and production-aware apparel developer for Davi & Dani.

You inspect one uploaded apparel product image. First analyze the product internally for Product DNA: garment category, body type, fit, silhouette, fabric appearance, color, wash, texture, construction details, trims, closures, pockets, ribbing, waistband, hem, graphics, embroidery, patches, print technique, styling vibe, seasonality, price perception, wholesale buyer appeal, and boutique merchandising potential.

Your job is not to describe the uploaded image. Your job is to turn its commercial formula into exactly 10 new sellable apparel product mockup prompts that feel realistic, boutique-ready, production-aware, line-sheet-ready, and commercially grounded.

Output exactly 10 prompts. Each prompt must be one full paragraph. Separate each paragraph with one blank line.

Every prompt must follow this structure:
Ultra-realistic 4K studio image of [garment body] in [specific color + fabric], displayed in a clean side-by-side composition showing front view on the left and back view on the right, same model, same pose alignment, neutral beige background, soft diffused lighting. [Main design detail with exact placement, text, artwork, embroidery/print/applique technique, and color contrast]. [Front detail with exact placement]. [Secondary details such as sleeves, pockets, ribbing, waistband, hem, zipper, patches, stitching, trims]. [Fit, silhouette, styling purpose, boutique appeal, and highly detailed fabric texture].

Mandatory visual requirements:
- Every prompt must generate a side-by-side front and back view in one image.
- Front view must be on the left.
- Back view must be on the right.
- Both views must use the same model.
- Both views must have the same pose alignment.
- Both views must use the same lighting, background, scale, and camera angle.
- The image must feel like a clean ecommerce or wholesale line sheet mockup.
- The back view should clearly show the strongest selling graphic or hero detail.
- The front view should clearly show fit, silhouette, and front details.

Category distribution rule:
- Do not over-concentrate the 10 outputs into one garment category unless the user explicitly asks for one single category. The uploaded image alone is not a request to repeat that category.
- Build a full collection ecosystem from the source Product DNA, not 10 versions of the same garment body.
- Default mix must include 2 to 3 outerwear pieces such as jackets, bombers, puffers, shackets, anoraks, or vests.
- Default mix must include 2 to 3 tops such as hoodies, crewnecks, zip-ups, sweaters, knit tops, cardigans, or layering tops.
- Default mix must include exactly 2 bottoms such as cargo pants, sweatpants, skirts, denim, barrel pants, wide-leg pants, joggers, or utility pants.
- Default mix must include 2 to 3 expansion pieces such as vests, dresses, matching sets, cardigans, shackets, anoraks, puffers, skirts, or other outfit-building items.
- No single garment category may appear more than 3 times unless directly requested.
- Preserve the original product's design DNA, styling world, icon language, trim logic, fabric attitude, and commercial reason to buy, but translate that DNA across different garment bodies.
- If the uploaded image is a bottom, do not make the set mostly bottoms. Generate complementary tops, outerwear, sets, and outfit builders around the bottom's DNA.
- If the uploaded image is outerwear, do not make the set mostly outerwear. Generate tops, bottoms, sets, and outfit builders that extend the outerwear's DNA.
- If the uploaded image is a top, do not make the set mostly tops. Generate bottoms, outerwear, sets, and outfit builders that complete the product world.
- If the uploaded image is a dress, cardigan, vest, set, or hybrid piece, keep only 2 to 3 prompts close to that source body and use the remaining prompts to build adjacent commercial categories.
- The goal is a balanced sellable mini collection with multiple reasons to buy, not a single-category repetition or colorway pack.

Each prompt must include exact garment type, exact fit and silhouette, specific fabric, specific color direction, side-by-side front and back composition, main back design or hero detail, front design detail, secondary design details, placement details, technique details such as chenille, embroidery, applique, puff print, screen print, patchwork, tonal stitching, contrast stitching, quilting, distressing, wash, or hardware, color contrast details, styling purpose, wholesale/boutique appeal, high realism, and texture detail.

Design rules:
- Every idea must feel like a real SKU that could be added to a Davi & Dani wholesale line sheet.
- Every idea must be sellable, not abstract.
- Every idea must have a clear reason to exist.
- Every idea must feel boutique-friendly, young contemporary, trend-aware, realistic, and production-aware.
- Every idea must be visually clear at thumbnail size.
- Every idea must have strong front and back product value.
- Increase perceived value through details, trims, placement, graphics, texture, wash, or construction.
- Avoid vague words like cool, cute, stylish, nice, trendy, or unique unless supported by specific visual details.

Graphic-driven products:
- Prioritize large readable back graphics.
- Use emotional phrases, club names, destination names, lifestyle names, or identity-based slogans.
- Use strong icon systems such as horse, rose, bow, star, horseshoe, sunburst, motel key, eagle, wildflower, racing flag, crest, ribbon, or postcard stamp when relevant.
- Make sure the graphic feels like a world, not just decoration.
- The graphic should feel like something a customer wants to belong to.

Non-graphic products:
- Focus on fabric, silhouette, wash, texture, trim, proportion, construction, styling, and merchandising.
- Create details that increase perceived value without forcing random graphics.

Output rules:
- Only output the 10 prompts.
- No intro.
- No explanation.
- No markdown.
- No numbering.
- No titles.
- No dividers.
- No extra commentary.
- Each prompt must be separated by one blank line.`;

function normalizeBestsellerRemixPrompts(raw: string): string {
  const cleaned = raw
    .trim()
    .replace(/^```(?:text)?/i, "")
    .replace(/```$/i, "")
    .trim();

  let paragraphs = cleaned
    .split(/\n\s*\n+/)
    .map((paragraph) =>
      paragraph
        .replace(/\s*\n\s*/g, " ")
        .replace(/^["'`]+|["'`]+$/g, "")
        .replace(/^\s*(?:[-*•]|\d+[\.)]|Prompt\s*\d+\s*[:.)-])\s*/i, "")
        .trim()
    )
    .filter(Boolean);

  if (paragraphs.length < 10) {
    paragraphs = cleaned
      .split(/\r?\n/)
      .map((line) =>
        line
          .replace(/^["'`]+|["'`]+$/g, "")
          .replace(/^\s*(?:[-*•]|\d+[\.)]|Prompt\s*\d+\s*[:.)-])\s*/i, "")
          .trim()
      )
      .filter(Boolean);
  }

  return paragraphs.slice(0, 10).join("\n\n");
}

export async function generateBestsellerRemixPrompts(imageUrl: string): Promise<string> {
  const result: any = await subscribeVisionWithRetry(
    {
      model: VISION_MODEL,
      system_prompt: BESTSELLER_REMIX_PROMPT_SYSTEM_PROMPT,
      prompt:
        "Analyze this uploaded apparel product image for commercial Product DNA, then output exactly 10 line-sheet-ready AI image prompts for new sellable product mockups. Follow every output rule exactly. Each prompt must be one full paragraph separated by one blank line.",
      image_url: imageUrl,
    },
    "bestseller remix prompt generation"
  );

  const data = result?.data ?? result;
  const output: string = (data?.output ?? data?.response ?? data?.text ?? "").trim();
  if (!output) {
    console.error("[prompt-studio/bestseller-remix] full response:", JSON.stringify(data).slice(0, 1000));
    throw new Error("Bestseller remix prompt generator returned no text output.");
  }

  const prompts = normalizeBestsellerRemixPrompts(output);
  const count = prompts ? prompts.split(/\n\s*\n/).filter(Boolean).length : 0;
  if (count !== 10) {
    console.error("[prompt-studio/bestseller-remix] expected 10 prompts, got:", count);
    console.error("[prompt-studio/bestseller-remix] raw output:", output.slice(0, 1000));
    throw new Error("Bestseller remix prompt generator did not return exactly 10 prompts.");
  }

  return prompts;
}

export interface InspirationTagResult {
  title: string;
  category: string;
  tags: string[];
  note: string;
}

function extractJsonObject(raw: string): string {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  if (fenced) return fenced.trim();
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start >= 0 && end > start) return raw.slice(start, end + 1);
  return raw.trim();
}

function parseInspirationTagResult(raw: string): InspirationTagResult | null {
  try {
    const parsed = JSON.parse(extractJsonObject(raw));
    const tags = Array.isArray(parsed.tags)
      ? parsed.tags.map((item: unknown) => String(item || "").trim()).filter(Boolean)
      : [];
    return {
      title: String(parsed.title || "").trim(),
      category: String(parsed.category || "").trim(),
      tags: tags.slice(0, 14),
      note: String(parsed.note || "").trim(),
    };
  } catch {
    return null;
  }
}

export async function generateInspirationTags(
  imageUrl: string,
  context = ""
): Promise<InspirationTagResult> {
  const result: any = await subscribeVisionWithRetry(
    {
      model: VISION_MODEL,
      system_prompt:
        "You are a fashion inspiration librarian for a boutique apparel design team. Analyze the image and create concise, searchable trend tags that a head designer would actually use later. Prioritize garment type, silhouette, fabric, print/motif, occasion, seasonality, mood, customer world, and commercial trend signals. Avoid generic filler.",
      prompt: `Create useful metadata for saving this image into a shared fashion inspiration library.

${context ? `Extra page/source context:\n${context.slice(0, 2500)}\n\n` : ""}

Return strict JSON only:
{
  "title": "short human-friendly inspiration title, not SEO copy",
  "category": "primary garment/category phrase",
  "tags": ["8-14 lowercase tags such as western, barrel jeans, 4th of july, varsity, crochet, coastal, utility, fw26"],
  "note": "one short sentence explaining why this is worth saving as design inspiration"
}`,
      image_url: imageUrl,
    },
    "inspiration tag generation"
  );

  const data = result?.data ?? result;
  const output: string = (data?.output ?? data?.response ?? data?.text ?? "").trim();
  const parsed = output ? parseInspirationTagResult(output) : null;
  if (!parsed || !parsed.tags.length) {
    console.error("[inspiration-tags] raw output:", output.slice(0, 1000));
    throw new Error("Inspiration tag generator returned no usable tags.");
  }
  return parsed;
}

/**
 * Textile CAD spec analysis. Inspects a garment photograph and returns the
 * production spec of the UNDERLYING flat print (repeat type, color count,
 * palette, motifs, technique). Uses the shared vision model. Analyzes the
 * primary (first) image; the array signature keeps room for future
 * multi-image merge.
 */
export async function analyzeTextileSpec(imageUrls: string[]): Promise<CadSpec> {
  const primary = imageUrls.find((url) => !!url);
  if (!primary) throw new Error("At least one image is required for spec analysis.");

  const result: any = await subscribeVisionWithRetry(
    {
      model: VISION_MODEL,
      system_prompt: CAD_SPEC_SYSTEM_PROMPT,
      prompt: CAD_SPEC_USER_PROMPT,
      image_url: primary,
    },
    "textile spec analysis"
  );

  const data = result?.data ?? result;
  const output: string = (data?.output ?? data?.response ?? data?.text ?? "").trim();
  if (!output) {
    console.error("[cad-spec] full response:", JSON.stringify(data).slice(0, 1000));
    throw new Error("Spec analyzer returned no text output.");
  }

  let parsed: any;
  try {
    parsed = JSON.parse(extractJsonObject(output));
  } catch {
    console.error("[cad-spec] raw output:", output.slice(0, 1000));
    throw new Error("Spec analyzer returned unparseable JSON.");
  }

  const palette = Array.isArray(parsed.palette)
    ? parsed.palette
        .map((c: any) => ({
          hex: String(c?.hex || "").trim(),
          name: String(c?.name || "").trim(),
        }))
        .filter((c: any) => c.hex)
        .slice(0, 12)
    : [];
  const motifs = Array.isArray(parsed.motifs)
    ? parsed.motifs
        .map((m: any) => ({
          name: String(m?.name || "").trim(),
          count: String(m?.count || "").trim(),
        }))
        .filter((m: any) => m.name)
        .slice(0, 24)
    : [];
  const technique = Array.isArray(parsed.technique)
    ? parsed.technique.map((t: any) => String(t || "").trim()).filter(Boolean).slice(0, 12)
    : [];

  return {
    repeatType: String(parsed.repeatType || "unknown").trim(),
    directional: String(parsed.directional || "unknown").trim(),
    colorCount: Number.isFinite(Number(parsed.colorCount)) ? Number(parsed.colorCount) : palette.length,
    palette,
    motifs,
    repeatDimensions: String(parsed.repeatDimensions || "unknown").trim(),
    technique,
    notes: String(parsed.notes || "").trim(),
  };
}

export interface TechpackTable {
  columns: string[];
  rows: string[][];
}

export interface TechpackSection {
  heading: string;
  body?: string;
  bullets?: string[];
  table?: TechpackTable;
}

export interface TechpackPage {
  pageNumber: number;
  title: string;
  summary?: string;
  sections: TechpackSection[];
}

export interface TechpackResult {
  styleName: string;
  styleNumber: string;
  season: string;
  category: string;
  baseSize: string;
  sizeRange: string;
  dateCreated: string;
  pages: TechpackPage[];
}

export interface TechpackInput {
  imageUrl: string;
  supportImageUrls?: string[];
  styleName?: string;
  styleNumber?: string;
  season?: string;
  category?: string;
  baseSize?: string;
  sizeRange?: string;
  designerName?: string;
  contact?: string;
  seamAllowance?: string;
  colorwayCount?: string;
  notes?: string;
}

const TECHPACK_SYSTEM_PROMPT = `You are a senior apparel technical designer and production manager. You create factory-ready technical packs from uploaded garment flats, sketches, renders, or clear garment images.

Use the uploaded image as the primary source of truth. Do not invent unnecessary garment features. If construction information is not visible, infer logically using industry-standard garment construction and mark the value with "proposed". If information is missing, use a professional placeholder such as "[TBC supplier]", "[TBC Pantone]", "[TBC artwork file]", or "[TBC measurement]".

Brand name is always Davi&Dani.

Return strict JSON only. No markdown. No prose outside JSON.

The JSON shape must be:
{
  "styleName": "string",
  "styleNumber": "string",
  "season": "string",
  "category": "string",
  "baseSize": "string",
  "sizeRange": "string",
  "dateCreated": "string",
  "pages": [
    {
      "pageNumber": 1,
      "title": "PAGE 1 — COVER PAGE / STYLE SUMMARY",
      "summary": "short page summary",
      "sections": [
        {
          "heading": "section heading",
          "body": "optional paragraph",
          "bullets": ["optional bullets"],
          "table": { "columns": ["col"], "rows": [["value"]] }
        }
      ]
    }
  ]
}

Create exactly 7 pages:
PAGE 1 — COVER PAGE / STYLE SUMMARY
PAGE 2 — CONSTRUCTION & DETAIL CALLOUTS
PAGE 3 — BILL OF MATERIALS / BOM
PAGE 4 — COLORWAYS & ARTWORK PLACEMENT
PAGE 5 — MEASUREMENT SPECIFICATIONS / BASE SIZE SPEC SHEET
PAGE 6 — SIZE GRADING
PAGE 7 — LABELS & PACKAGING

Content requirements:
- Page 1 must include brand, logo placeholder, contact, style name, style number, season, gender/category, base sample size, date created, designer, revision history table, front/back flat description, and garment summary.
- Page 2 must include construction callouts, detail views, seam types, stitching SPI/thread instructions, hardware placement, edge finishing, reinforcement points, and seam allowance standard.
- Page 3 must include a BOM table with columns Item number, Component category, Component description, Placement / usage, Fiber content / composition, Fabric weight or trim size, Color, Supplier / supplier code, Consumption per garment, Notes. Include only components required or logically proposed.
- Page 4 must include colorway chart, artwork reference table, placement measurements, application technique, artwork size, color specification, and no-artwork layout if no artwork is visible.
- Page 5 must include POM diagram notes and a base-size POM table with POM code, Point of Measure name, Measurement description, Base size measurement, Tolerance, How to measure, Notes.
- Page 6 must include size range, base size, grading table with grade rules and tolerances.
- Page 7 must include label placements, label dimensions, care label placeholder, care symbols placeholder, fiber content matching BOM, hangtag, folding, polybag, barcode sticker, size/color sticker, and carton notes where relevant.

Keep all pages internally consistent. Use metric measurements. Use professional factory terminology. The output is a technical document, not a moodboard or ecommerce page.`;

const TECHPACK_PAGE_TITLES = [
  "PAGE 1 — COVER PAGE / STYLE SUMMARY",
  "PAGE 2 — CONSTRUCTION & DETAIL CALLOUTS",
  "PAGE 3 — BILL OF MATERIALS / BOM",
  "PAGE 4 — COLORWAYS & ARTWORK PLACEMENT",
  "PAGE 5 — MEASUREMENT SPECIFICATIONS / BASE SIZE SPEC SHEET",
  "PAGE 6 — SIZE GRADING",
  "PAGE 7 — LABELS & PACKAGING",
];

function techpackMetaFromInput(input?: TechpackInput) {
  return {
    styleName: String(input?.styleName || "Davi&Dani Garment").trim(),
    styleNumber: String(input?.styleNumber || "[TBC style number]").trim(),
    season: String(input?.season || "[TBC season]").trim(),
    category: String(input?.category || "[TBC category]").trim(),
    baseSize: String(input?.baseSize || "[TBC base size]").trim(),
    sizeRange: String(input?.sizeRange || "[TBC size range]").trim(),
    dateCreated: new Date().toISOString().slice(0, 10),
    designerName: String(input?.designerName || "[TBC designer]").trim(),
    contact: String(input?.contact || "[TBC email / website / contact]").trim(),
    seamAllowance: String(input?.seamAllowance || "1 cm seam allowance unless otherwise stated").trim(),
    colorwayCount: Math.max(1, Number(input?.colorwayCount || 3) || 3),
  };
}

function fallbackTechpackPage(pageNumber: number, input?: TechpackInput): TechpackPage {
  const meta = techpackMetaFromInput(input);
  const title = TECHPACK_PAGE_TITLES[pageNumber - 1] || `PAGE ${pageNumber}`;

  if (pageNumber === 1) {
    return {
      pageNumber,
      title,
      summary: "Factory-facing style summary created from visible image information and user-entered metadata.",
      sections: [
        {
          heading: "Style Identification",
          table: {
            columns: ["Field", "Value"],
            rows: [
              ["Brand", "Davi&Dani"],
              ["Logo placement", "[TBC logo placement]"],
              ["Contact", meta.contact],
              ["Style name", meta.styleName],
              ["Style number", meta.styleNumber],
              ["Target season", meta.season],
              ["Gender/category", meta.category],
              ["Base sample size", meta.baseSize],
              ["Date created", meta.dateCreated],
              ["Designer", meta.designerName],
            ],
          },
        },
        {
          heading: "Garment Summary",
          body:
            "Use uploaded garment image as primary source of truth. Front/back technical flats should be created from visible silhouette, closures, trims, pockets, ribbing, artwork, and construction details. Any non-visible information is proposed and must be confirmed before bulk production.",
        },
        {
          heading: "Revision History",
          table: {
            columns: ["Revision number", "Date", "Description of change", "Approved by"],
            rows: [["0", meta.dateCreated, "Initial AI-generated tech pack draft", "[TBC approver]"]],
          },
        },
      ],
    };
  }

  if (pageNumber === 2) {
    return {
      pageNumber,
      title,
      summary: "Construction standards and callouts for factory sampling.",
      sections: [
        {
          heading: "Construction Callouts",
          bullets: [
            "Create numbered front and back flat callouts from visible seams, closures, pockets, collar/neckline, cuffs, hem, waistband, artwork, trims, and hardware.",
            "Use lockstitch for visible topstitching unless a specialized seam is visible or specified.",
            "Use 5-thread overlock or safety stitch for main joining seams where appropriate, proposed.",
            "Apply bartacks at pocket openings, zipper stress points, drawcord exits, side seam openings, and other stress points, proposed.",
            `Seam allowance standard: ${meta.seamAllowance}.`,
          ],
        },
        {
          heading: "Stitching Standards",
          table: {
            columns: ["Area", "Stitch type", "SPI", "Thread", "Notes"],
            rows: [
              ["Main joining seams", "5-thread overlock / safety stitch, proposed", "10-12 SPI", "[TBC thread ticket]", "Confirm with factory based on fabric weight"],
              ["Visible topstitching", "Single-needle lockstitch, proposed", "8-10 SPI", "Color match unless contrast is visible", "Keep stitch lines straight and even"],
              ["Hem / cuff / edge finish", "Coverstitch, binding, or clean-finished lockstitch, proposed", "10-12 SPI", "[TBC thread ticket]", "Match visible reference construction"],
            ],
          },
        },
      ],
    };
  }

  if (pageNumber === 3) {
    return {
      pageNumber,
      title,
      summary: "Bill of materials draft for one garment.",
      sections: [
        {
          heading: "Bill Of Materials",
          table: {
            columns: [
              "Item number",
              "Component category",
              "Component description",
              "Placement / usage",
              "Fiber content / composition",
              "Fabric weight or trim size",
              "Color",
              "Supplier / supplier code",
              "Consumption per garment",
              "Notes",
            ],
            rows: [
              ["1", "Main fabric", "Primary shell fabric based on uploaded image", "Body and major panels", "[TBC fiber content]", "[TBC GSM/weight]", "[TBC Pantone]", "[TBC supplier]", "[TBC consumption]", "Proposed based on image; confirm with physical sample"],
              ["2", "Thread", "Sewing thread", "All seams and topstitching", "Polyester, proposed", "[TBC ticket size]", "Color match shell unless contrast visible", "[TBC supplier]", "[TBC consumption]", "Confirm after lab dip"],
              ["3", "Labels", "Main label, size label, care/content label", "Inside neck/waist or side seam", "Woven/satin, proposed", "[TBC dimensions]", "Davi&Dani brand standard", "[TBC supplier]", "1 set", "Placement to be confirmed"],
              ["4", "Packaging", "Polybag, barcode sticker, size/color sticker", "Packed garment", "LDPE/polybag, proposed", "[TBC polybag size]", "Clear", "[TBC supplier]", "1 set", "Factory to confirm carton pack method"],
            ],
          },
        },
      ],
    };
  }

  if (pageNumber === 4) {
    const count = meta.colorwayCount;
    return {
      pageNumber,
      title,
      summary: "Colorway and artwork placement controls.",
      sections: [
        {
          heading: "Colorway Chart",
          table: {
            columns: ["Colorway name", "Main fabric Pantone/TCX", "Secondary fabric color", "Rib/trim color", "Thread color", "Hardware color", "Artwork color"],
            rows: Array.from({ length: count }, (_, index) => [
              index === 0 ? "Original / uploaded reference" : `Proposed colorway ${index + 1}`,
              "[TBC Pantone]",
              "[TBC secondary color]",
              "[TBC trim color]",
              "Color match unless contrast specified",
              "[TBC hardware finish]",
              "[TBC artwork color / no artwork required]",
            ]),
          },
        },
        {
          heading: "Artwork Placement",
          table: {
            columns: ["Artwork name", "File name", "File format", "Placement", "Scale", "Application method"],
            rows: [["Visible or proposed artwork", "[TBC artwork file]", "[TBC format]", "Match uploaded image placement; measure from fixed seams", "[TBC size]", "Embroidery / print / patch method to be confirmed"]],
          },
        },
      ],
    };
  }

  if (pageNumber === 5) {
    return {
      pageNumber,
      title,
      summary: `Base-size measurement specification for ${meta.baseSize}.`,
      sections: [
        {
          heading: "POM Diagram Notes",
          body:
            "Add front and back measurement diagrams with numbered measurement lines. Use visible garment proportions as the visual guide and confirm final measurements against approved sample.",
        },
        {
          heading: "Base Size POM Table",
          table: {
            columns: ["POM code", "Point of Measure name", "Measurement description", "Base size measurement", "Tolerance", "How to measure", "Notes"],
            rows: [
              ["A", "Body length", "Highest shoulder point to bottom hem", "[TBC measurement]", "+/- 1.0 cm", "Measure straight from HPS to hem", "Confirm from approved sample"],
              ["B", "Chest width", "Across chest 2.5 cm below armhole", "[TBC measurement]", "+/- 1.0 cm", "Lay flat, measure edge to edge", "Double for circumference if needed"],
              ["C", "Hem width", "Across bottom opening", "[TBC measurement]", "+/- 1.0 cm", "Lay flat, measure edge to edge", "Must match intended fit"],
              ["D", "Shoulder width", "Shoulder point to shoulder point", "[TBC measurement]", "+/- 0.8 cm", "Measure straight across back", "Use only when applicable"],
              ["E", "Sleeve length", "Shoulder point to sleeve opening", "[TBC measurement]", "+/- 1.0 cm", "Measure along outer sleeve", "Use for tops/jackets/dresses with sleeves"],
            ],
          },
        },
      ],
    };
  }

  if (pageNumber === 6) {
    const sizes = meta.sizeRange.split(",").map((item) => item.trim()).filter(Boolean);
    const normalizedSizes = sizes.length ? sizes : ["XS", "S", "M", "L", "XL"];
    return {
      pageNumber,
      title,
      summary: "Size grading draft using standard apparel grade logic.",
      sections: [
        {
          heading: "Grade Rule Table",
          table: {
            columns: ["POM code", "POM name", ...normalizedSizes, "Grade rule between sizes", "Tolerance"],
            rows: [
              ["A", "Body length", ...normalizedSizes.map((size) => (size === meta.baseSize ? "[TBC base]" : "[TBC]")), "0.5-1.0 cm per size, proposed", "+/- 1.0 cm"],
              ["B", "Chest width", ...normalizedSizes.map((size) => (size === meta.baseSize ? "[TBC base]" : "[TBC]")), "2.0-2.5 cm circumference per size, proposed", "+/- 1.0 cm"],
              ["C", "Hem width", ...normalizedSizes.map((size) => (size === meta.baseSize ? "[TBC base]" : "[TBC]")), "2.0-2.5 cm circumference per size, proposed", "+/- 1.0 cm"],
            ],
          },
        },
        {
          heading: "Grading Notes",
          body:
            "Grade rules are proposed until approved fit sample measurements are confirmed. Maintain intended relaxed, fitted, cropped, oversized, or regular fit proportions consistently across the size range.",
        },
      ],
    };
  }

  return {
    pageNumber,
    title,
    summary: "Labels, hangtags, folding, and packaging controls.",
    sections: [
      {
        heading: "Labels And Packaging",
        table: {
          columns: ["Item", "Placement", "Dimensions", "Material", "Notes"],
          rows: [
            ["Main brand label", "Inside back neck / waistband, proposed", "[TBC dimensions]", "Woven label, proposed", "Davi&Dani brand label"],
            ["Size label", "Next to main label, proposed", "[TBC dimensions]", "Woven or printed, proposed", "Must match size range"],
            ["Care/content label", "Side seam / inner facing, proposed", "[TBC dimensions]", "Satin care label, proposed", "Include fiber content, care symbols, RN, country of origin placeholder"],
            ["Hangtag", "Attached at neck label, zipper pull, or main opening, proposed", "[TBC size]", "Card stock, proposed", "Include barcode/SKU if required"],
            ["Polybag", "One garment per bag", "[TBC dimensions]", "Clear LDPE, proposed", "Include suffocation warning, barcode sticker, size/color sticker"],
          ],
        },
      },
      {
        heading: "Folding Instructions",
        bullets: [
          "Fold garment flat with front facing up unless factory pack standard requires otherwise.",
          "Fold sleeves/body cleanly to fit approved polybag dimension, proposed.",
          "Do not crush trims, artwork, hardware, raised embroidery, or padded/lofty fabric.",
        ],
      },
    ],
  };
}

function completeTechpackPages(pages: TechpackPage[], input?: TechpackInput): TechpackPage[] {
  const byNumber = new Map<number, TechpackPage>();

  pages.forEach((page, index) => {
    const pageNumber = Number.isFinite(page.pageNumber) && page.pageNumber >= 1 && page.pageNumber <= 7
      ? Math.trunc(page.pageNumber)
      : index + 1;
    if (!byNumber.has(pageNumber)) {
      byNumber.set(pageNumber, {
        ...page,
        pageNumber,
        title: TECHPACK_PAGE_TITLES[pageNumber - 1] || page.title || `PAGE ${pageNumber}`,
        sections: page.sections.length ? page.sections : fallbackTechpackPage(pageNumber, input).sections,
      });
    }
  });

  return TECHPACK_PAGE_TITLES.map((_, index) => {
    const pageNumber = index + 1;
    return byNumber.get(pageNumber) ?? fallbackTechpackPage(pageNumber, input);
  });
}

function normalizeTechpackTable(value: any): TechpackTable | undefined {
  if (!value || typeof value !== "object") return undefined;
  const columns = Array.isArray(value.columns)
    ? value.columns.map((item: unknown) => String(item || "").trim()).filter(Boolean)
    : [];
  const rows = Array.isArray(value.rows)
    ? value.rows
        .map((row: unknown) =>
          Array.isArray(row)
            ? row.map((cell: unknown) => String(cell ?? "").trim())
            : []
        )
        .filter((row: string[]) => row.length)
    : [];
  if (!columns.length || !rows.length) return undefined;
  return { columns, rows };
}

function normalizeTechpackResult(raw: string, input?: TechpackInput): TechpackResult | null {
  try {
    const parsed = JSON.parse(extractJsonObject(raw));
    const pages = Array.isArray(parsed.pages)
      ? parsed.pages
          .map((page: any, index: number) => {
            const sections = Array.isArray(page.sections)
              ? page.sections
                  .map((section: any) => {
                    const bullets = Array.isArray(section.bullets)
                      ? section.bullets
                          .map((item: unknown) => String(item || "").trim())
                          .filter(Boolean)
                      : [];
                    const normalized: TechpackSection = {
                      heading: String(section.heading || "Section").trim(),
                    };
                    const body = String(section.body || "").trim();
                    if (body) normalized.body = body;
                    if (bullets.length) normalized.bullets = bullets;
                    const table = normalizeTechpackTable(section.table);
                    if (table) normalized.table = table;
                    return normalized;
                  })
                  .filter((section: TechpackSection) => section.heading)
              : [];
            return {
              pageNumber: Number(page.pageNumber || index + 1),
              title: String(page.title || `PAGE ${index + 1}`).trim(),
              summary: String(page.summary || "").trim(),
              sections,
            } as TechpackPage;
          })
          .filter((page: TechpackPage) => page.sections.length)
      : [];
    if (!pages.length) return input ? buildFallbackTechpack(input) : null;
    const fallbackMeta = techpackMetaFromInput(input);
    return {
      styleName: String(parsed.styleName || fallbackMeta.styleName).trim(),
      styleNumber: String(parsed.styleNumber || fallbackMeta.styleNumber).trim(),
      season: String(parsed.season || fallbackMeta.season).trim(),
      category: String(parsed.category || fallbackMeta.category).trim(),
      baseSize: String(parsed.baseSize || fallbackMeta.baseSize).trim(),
      sizeRange: String(parsed.sizeRange || fallbackMeta.sizeRange).trim(),
      dateCreated: String(parsed.dateCreated || fallbackMeta.dateCreated).trim(),
      pages: completeTechpackPages(pages, input),
    };
  } catch {
    return input ? buildFallbackTechpack(input) : null;
  }
}

function buildFallbackTechpack(input: TechpackInput): TechpackResult {
  const meta = techpackMetaFromInput(input);
  return {
    styleName: meta.styleName,
    styleNumber: meta.styleNumber,
    season: meta.season,
    category: meta.category,
    baseSize: meta.baseSize,
    sizeRange: meta.sizeRange,
    dateCreated: meta.dateCreated,
    pages: completeTechpackPages([], input),
  };
}

export async function generateTechpack(input: TechpackInput): Promise<TechpackResult> {
  const context = [
    `Brand name: Davi&Dani`,
    `Style name: ${input.styleName || "[TBC style name]"}`,
    `Style number: ${input.styleNumber || "[TBC style number]"}`,
    `Target season: ${input.season || "[TBC season]"}`,
    `Gender/category: ${input.category || "[TBC category]"}`,
    `Base sample size: ${input.baseSize || "[TBC base size]"}`,
    `Size range: ${input.sizeRange || "[TBC size range]"}`,
    `Designer name: ${input.designerName || "[TBC designer]"}`,
    `Brand contact details: ${input.contact || "[TBC email / website / contact]"}`,
    `Seam allowance standard: ${input.seamAllowance || "1 cm seam allowance unless otherwise stated"}`,
    `Requested colorway count: ${input.colorwayCount || "3"}`,
    input.supportImageUrls?.length
      ? `Supporting uploaded asset URLs for written reference: ${input.supportImageUrls.join(", ")}`
      : "",
    input.notes ? `Additional supporting notes:\n${input.notes.slice(0, 6000)}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const result: any = await subscribeVisionWithRetry(
    {
      model: VISION_MODEL,
      system_prompt: TECHPACK_SYSTEM_PROMPT,
      prompt: `Create a complete, believable, internally consistent 7-page manufacturing tech pack from this uploaded garment image.\n\n${context}`,
      image_url: input.imageUrl,
    },
    "techpack generation"
  );

  const data = result?.data ?? result;
  const output: string = (data?.output ?? data?.response ?? data?.text ?? "").trim();
  const parsed = output ? normalizeTechpackResult(output, input) : buildFallbackTechpack(input);
  if (!parsed) {
    console.error("[techpack] raw output:", output.slice(0, 2000));
    return buildFallbackTechpack(input);
  }
  return parsed;
}

/* ===========================================================================
 * TWO-PIECE SETS
 * ---------------------------------------------------------------------------
 * When the user flags the reference photo as a coordinated two-piece set (e.g.
 * a matching top + mini skirt, or a coord jacket + pants), we swap in a
 * different analyzer + assembler pair. The analyzer output has four slots
 * instead of two (TOP / TOP_FEATURES / BOTTOM / BOTTOM_FEATURES) and the
 * assembler renders the prompt in the shape that tested best in controlled
 * 6-prompt batches — explicitly naming both pieces as a coordinated set.
 * ======================================================================== */

/**
 * Analyzer system prompt for a two-piece coordinated set. Outputs four lines
 * so each piece can be described in its own descriptor slot without the
 * details of one piece bleeding into the other.
 */
const TWO_PIECE_ANALYSIS_SYSTEM_PROMPT = `You are a product catalog analyzer for coordinated two-piece fashion sets. You see a single photograph that shows TWO matching garments — a top piece and a bottom piece — designed to be worn together as a coordinated set (e.g. a crop top + mini skirt, jacket + pants, shirt + shorts). Output exactly four lines in this exact format, with no preamble, no markdown, and no extra lines:

TOP: <short noun phrase describing ONLY the top piece — include primary color, fabric/texture, an EXPLICIT SILHOUETTE / CUT / FIT descriptor (cropped, boxy, oversized, fitted, relaxed, bodycon, A-line, etc.), and the top type. Example: "bright aqua blue fitted sleeveless zip-front athletic top", "cream ribbed knit cropped boxy cardigan", "white cotton oversized short-sleeve tee">
TOP_FEATURES: <comma-separated noun phrases enumerating visible structural details of the TOP piece only. ALWAYS begin with a silhouette clause that restates the top's cut/fit/length in concrete visual terms (e.g. "a cropped torso that ends above the natural waist", "a boxy torso that hangs loose from shoulder to hip without tapering", "a fitted torso that follows the body closely through the waist"). Example: "a fitted torso that follows the body closely, quarter-zip front closure, stand collar, two side zip chest pockets, sleeveless armholes, hip-length hem">
BOTTOM: <short noun phrase describing ONLY the bottom piece — include primary color, fabric/texture, an EXPLICIT SILHOUETTE / CUT / FIT descriptor (barrel-fit, wide-leg, straight-leg, slim, skinny, tapered, flared, bootcut, A-line, mini, midi, maxi, etc.), and the bottom type. Example: "aqua blue A-line athletic mini skirt", "cream ribbed knit wide-leg pull-on shorts", "white cotton pleated midi skirt". Do NOT prefix with "matching" — the assembler adds coordination language itself.>
BOTTOM_FEATURES: <comma-separated noun phrases enumerating visible structural details of the BOTTOM piece only. ALWAYS begin with a silhouette clause that restates the bottom's cut/leg-shape/length in concrete visual terms (e.g. "a rounded barrel-shaped leg that curves outward through the thigh and knee then tapers to the ankle", "a straight leg of even width from hip to ankle", "an A-line flare from waistband to above-knee hem"). Example: "an A-line flare from waistband to above-knee hem, elastic drawcord waistband, neon yellow waistband contrast panel, two side zip pockets">

SHAPE DISAMBIGUATION:
- TOP must be a torso garment with a neckline + sleeves or sleeveless armholes.
- BOTTOM must cover the lower body — pants, shorts, skirt, leggings, joggers.
- NEVER put bottom-only details (waistband, leg, hem, drawcord) in TOP_FEATURES.
- NEVER put top-only details (neckline, sleeve, collar, armhole) in BOTTOM_FEATURES.

ANTI-HALLUCINATION RULES — violating any of these produces bad outputs:

- NEVER invent text, letters, numbers, logos, brand names, or made-up words. If a logo or text is not clearly, unambiguously legible, OMIT it.
- NEVER describe individual motifs inside a print/pattern. Name only the PATTERN TYPE inline in TOP or BOTTOM (e.g. "leopard print", "plaid", "floral") and do NOT mention the print again in features.
- Describe only the two garments themselves. Ignore the photo's background, hanger, mannequin, lighting, and shadows.
- Do NOT state a count unless you can count with certainty.
- NEVER guess a hardware material. If a button, zipper pull, rivet, eyelet, or buckle's material cannot be identified with certainty, describe ONLY its color and shape. Do NOT write speculative material qualifiers like "pearl", "pearl-like", "horn", "bone", "wooden", "metallic", "brass-looking", "leather-like", or "tortoiseshell".
- NEVER use the word "trim" or "trimmed" unless the trim is clearly a DIFFERENT color from the garment body. A ruffle or ruffled edge in the same color as the body is self-fabric and must be described without "trim".
- NEVER use hedge qualifiers such as "-like", "-looking", "-style", "-ish", "sort of", "kind of", or "appears to be". If you cannot identify a detail with certainty, OMIT it entirely.

DESCRIPTOR DISCIPLINE — these rules come from controlled prompt tests and are not optional:

- Use only words that name a visible, renderable physical property: color, shape, texture, material, fit, hardware, construction. The image model cannot render abstract or quantifier words.
- NEVER use abstract or quantifier words such as: "easy", "medium", "moderate", "nice", "great", "beautiful", "basic", "standard", "regular", "normal".
- NEVER repeat the same descriptor word across the four output lines. Each descriptor token (e.g. "soft", "relaxed", "tailored", "sporty") must appear at most ONCE across all four lines. If a word is used in TOP, pick a different one in BOTTOM.
- Pick fabric-consistent adjectives. Do NOT describe a knit as "crisp", a denim as "drapey", a silk as "stiff" — cross-domain words contradict the material and degrade the output.

OUTPUT FORMAT RULES:
- Output exactly four lines: TOP, TOP_FEATURES, BOTTOM, BOTTOM_FEATURES.
- No preamble, no markdown, no code fences, no extra commentary.`;

/**
 * Parsed four-field analyzer output for a two-piece coordinated set.
 */
export interface TwoPieceFields {
  top: string;
  topFeatures: string;
  bottom: string;
  bottomFeatures: string;
}

/**
 * Extract the four TOP / TOP_FEATURES / BOTTOM / BOTTOM_FEATURES fields from
 * a coordinated-set photograph. Used by Image Studio (which then assembles
 * via buildTwoPiecePrompt) and Model Studio (which then assembles via
 * buildModelSwapTwoPiecePrompt).
 */
export async function extractTwoPieceFields(imageUrl: string): Promise<TwoPieceFields> {
  const result: any = await subscribeVisionWithRetry(
    {
      model: VISION_MODEL,
      system_prompt: TWO_PIECE_ANALYSIS_SYSTEM_PROMPT,
      prompt:
        "Analyze the two-piece coordinated set in this photograph using the four-line TOP / TOP_FEATURES / BOTTOM / BOTTOM_FEATURES format defined in your system prompt. Output exactly those four lines, nothing else.",
      image_url: imageUrl,
    },
    "two-piece analysis"
  );
  const data = result?.data ?? result;
  const output: string = (data?.output ?? data?.response ?? data?.text ?? "").trim();
  if (!output) {
    console.error("[analyze-twopiece] full response:", JSON.stringify(data).slice(0, 1000));
    throw new Error("Two-piece vision analysis returned no text output.");
  }

  const grab = (label: string): string => {
    const re = new RegExp(`${label}:\\s*([\\s\\S]+?)\\s*(?:\\r?\\n(?=[A-Z_ ]+:)|$)`, "i");
    const m = output.match(re);
    return (m?.[1] || "").trim().replace(/\.$/, "");
  };
  const top = grab("TOP").replace(/^matching\s+/i, "");
  const topFeatures = grab("TOP_FEATURES");
  // Strip a leading "matching " the analyzer sometimes adds despite the rule
  // in the system prompt — the assembler already says "worn together with a
  // matching X", so keeping it here would render "a matching matching X".
  const bottom = grab("BOTTOM").replace(/^matching\s+/i, "");
  const bottomFeatures = grab("BOTTOM_FEATURES");

  if (!top || !bottom) {
    console.error("[analyze-twopiece] parse failed, raw output:", output.slice(0, 500));
    throw new Error("Two-piece analyzer returned an unparseable response.");
  }
  console.log("[analyze-twopiece] top:", top);
  console.log("[analyze-twopiece] top features:", topFeatures);
  console.log("[analyze-twopiece] bottom:", bottom);
  console.log("[analyze-twopiece] bottom features:", bottomFeatures);
  return { top, topFeatures, bottom, bottomFeatures };
}

/**
 * Assemble the Image Studio prompt for a coordinated two-piece set. The shape
 * mirrors the winning prompt from David's 6-prompt controlled test (the one
 * labelled #4): explicitly frame the replacement as a "coordinated set",
 * name both pieces inline, list each piece's properties separately, then
 * share the same preservation + FRESH-RENDER clauses as the single-garment
 * template.
 */
export function buildTwoPiecePrompt(fields: TwoPieceFields): string {
  const render = (t: string, tf: string, b: string, bf: string): string => {
    const topClause = tf
      ? ` The top has these visible properties (match exactly): ${tf}.`
      : "";
    const bottomClause = bf
      ? ` The bottom has these visible properties (match exactly): ${bf}.`
      : "";
    return (
      `Catalog garment-swap edit. Replace the garment currently shown in the primary studio ` +
      `photograph with a coordinated two-piece set: a ${t} worn together with a matching ${b}.` +
      `${topClause}${bottomClause} ` +
      `Render both pieces as a single unified coordinated outfit — they share the same color ` +
      `family, fabric family, and trim language; they must look like two pieces of the same ` +
      `designed set, not two unrelated garments. ` +
      `The exact appearance of both pieces — color, pattern, fabric texture, hardware, SILHOUETTE, ` +
      `CUT, FIT, leg shape, torso shape, length, volume, and every visible detail — is given by ` +
      `the attached reference photograph of that set; use the reference photograph strictly as the ` +
      `visual source of truth for how the set should look. ` +
      // Silhouette-authority clause (same rationale as the single-garment template).
      `SILHOUETTE AUTHORITY: the overall silhouette, cut, and fit of both the ${t} and the ${b} ` +
      `(leg width/curvature on the bottom, torso fit/length on the top) MUST be taken from the ` +
      `attached reference photograph, NOT from the garment currently shown in the primary studio ` +
      `photograph. If the reference bottom is wide-leg or barrel-fit, render wide-leg or barrel. ` +
      `If the reference top is oversized or cropped, render oversized or cropped. Do not normalize ` +
      `the reference silhouette to match whatever garment was originally on the canvas. ` +
      `PRESERVE from the primary studio photograph (do not alter any of these): the clean solid ` +
      `studio background — the background must be rendered as a flat, solid, seamless color that ` +
      `exactly matches hex #edeeee (a soft neutral cool-gray) — do not shift warmer, cooler, ` +
      `brighter, or darker than #edeeee), soft diffused lighting, shadow character, camera angle, ` +
      `camera distance, framing, and centered composition. Do NOT inherit garment-shape cues ` +
      `(silhouette, cut, fit, length) from the primary studio photograph. ` +
      `BACKGROUND UNIFORMITY: the studio background must be rendered as one perfectly flat, ` +
      `seamless solid color — hex #edeeee — across the ENTIRE frame, from the top edge to the ` +
      `bottom edge and from the left edge to the right edge. There must be no color patches, ` +
      `rectangular blocks, banding, tiling artifacts, gradient shifts, lighter or darker zones, ` +
      `or mismatched regions anywhere in the background. Every pixel of the background must ` +
      `match #edeeee; the background reads as a single continuous flat surface with no visible ` +
      `seams or transitions. ` +
      `STUDIO COMPOSITION STANDARD: this is a locked visual requirement — every output must match ` +
      `the primary studio photograph's composition exactly. Do not zoom in tighter or pull back ` +
      `wider than the canvas. Both the top and bottom pieces must occupy the same proportional ` +
      `area of the frame as in the primary studio photograph — do not scale up or scale down. The ` +
      `full set must be visible from the top (collar or shoulder line of the top piece) to the ` +
      `bottom hem of the bottom piece — nothing cropped, nothing cut off. The set is centered ` +
      `horizontally with equal left and right margins, and positioned at the same vertical height ` +
      `as the canvas. Camera is straight-on, perpendicular to the canvas plane — no tilt, no ` +
      `perspective shift, no barrel distortion, no lens compression change. Every output must ` +
      `feel as though it was photographed in the same studio session, at the same camera ` +
      `position and focal length, as the primary studio photograph. ` +
      `COLOR AUTHORITY: match the exact hues and saturation visible in the attached reference ` +
      `photograph for both pieces. Do not desaturate, mute, dust, or shift colors toward ` +
      `catalog-neutral, sage, mauve, dusty, or earth-tone palettes. If a color reads as vivid lime ` +
      `green or coral pink in the reference, render it as vivid lime green or coral pink — do not ` +
      `approximate to a darker, browner, or grayer version. Preserve color temperature and chroma. ` +
      `PATTERN CONTINUITY: if the top and bottom share a gradient, stripe, ombré, tie-dye, dip-dye, ` +
      `print, or all-over pattern in the reference, render them as a single continuous design — ` +
      `not as two independent patterns. Preserve the exact number, order, position, and proportional ` +
      `thickness of every color band or stripe. If the gradient has three bands (e.g. ` +
      `green→pink→green), render three bands — do not collapse to a two-band ombré. ` +
      `EMBELLISHMENT FIDELITY: any rhinestones, sequins, beads, studs, crystals, paillettes, glitter, ` +
      `foil, embroidery, appliqué, or applied surface decoration visible in the reference must be ` +
      `rendered explicitly — same density, same scatter pattern, same scale, same sparkle/reflectivity, ` +
      `same placement across both pieces. Do not omit, smooth over, flatten, or fabric-substitute ` +
      `these embellishments. Do not convert a rhinestone-studded knit into a plain knit, velvet, or ` +
      `velour surface; preserve the original fabric body AND the surface embellishment. ` +
      `RENDER THE REPLACEMENT SET FRESH — do not copy the wrinkles, folds, creases, twists, ` +
      `asymmetries, or specific placement of whatever garment was originally in the primary ` +
      `photograph. Display both pieces in the canonical catalog layout for a coordinated set: the ` +
      `${t} positioned above and slightly overlapping the ${b}, both centered on the vertical ` +
      `axis, symmetric along the vertical centerline, neatly laid flat with smooth, ` +
      `freshly-steamed fabric, no wrinkles, no creases, no bunched or twisted sections — WHILE ` +
      `RETAINING each piece's true silhouette from the reference. Sleeves on the top angle ` +
      `slightly downward and symmetric; the bottom's waistband is centered under the top's hem ` +
      `with its hem fanning gently and symmetrically. Symmetry and flat-lay cleanliness must NOT ` +
      `override the reference silhouette. ` +
      `The result must look like a brand-new, professionally styled catalog photograph taken in ` +
      `the same studio session as the primary photograph — same lighting, same camera, same ` +
      `background — but with a freshly arranged, crisp, symmetric coordinated set whose ` +
      `SILHOUETTE matches the attached reference photograph. ` +
      `REMOVE ALL NECK LABELS, BRAND TAGS, SIZE TAGS, CARE LABELS, AND SEWN-IN WOVEN TAGS from ` +
      `both the top and the bottom — the inside of the neckline, collar band, waistband, and any ` +
      `other typical label location must be clean and empty with no tag, label, patch, or printed ` +
      `text of any kind showing. Hyper-realistic 4K e-commerce product photography, Zara-style ` +
      `catalog quality.`
    );
  };

  const used = descriptorsInTemplate(render("", "", "", ""));
  const cleanTop = sanitizeAnalyzerText(fields.top, used);
  const cleanTopFeatures = sanitizeAnalyzerText(fields.topFeatures, used);
  const cleanBottom = sanitizeAnalyzerText(fields.bottom, used);
  const cleanBottomFeatures = sanitizeAnalyzerText(fields.bottomFeatures, used);
  return render(cleanTop, cleanTopFeatures, cleanBottom, cleanBottomFeatures);
}

/**
 * Image Studio convenience: run the two-piece analyzer pass and return the
 * fully assembled prompt in one call, matching analyzeGarmentToPrompt's shape.
 */
export async function analyzeTwoPieceSetToPrompt(imageUrl: string): Promise<string> {
  const fields = await extractTwoPieceFields(imageUrl);
  const finalPrompt = buildTwoPiecePrompt(fields);
  console.log("[analyze-twopiece] final prompt preview:", finalPrompt.slice(0, 240));
  return finalPrompt;
}

/* ===========================================================================
 * MODEL STUDIO
 * ---------------------------------------------------------------------------
 * Second workflow: instead of swapping a garment onto a flat studio backdrop,
 * the user drops a garment photo in and we dress a human model (photographed
 * in a curated pose) in that garment. The model photo is the canvas; the
 * garment photo is the reference. Content-descriptive language only — Gemini
 * edit models don't reliably map "image 1"/"image 2" labels to array slots.
 * ======================================================================== */

/**
 * System prompt for a second vision pass: the model pose. We ask Claude to
 * describe only the STATIC elements of the photograph the image model must
 * preserve (face, body, pose, hair, lighting, background) plus the garment
 * currently on the model that must be REMOVED. The garment being applied is
 * described separately from the user's uploaded photo.
 */
const MODEL_PHOTO_ANALYSIS_PROMPT = `You are a fashion photography analyst. You see a single photograph of a human model in a studio. Output exactly four lines in this exact format, with no preamble, no markdown, and no extra lines:

CURRENT_GARMENT: <short noun phrase describing the clothing the model is currently wearing that must be REPLACED. Include primary color and garment type. Examples: "cream drawstring trousers", "striped blue tank top", "red and white horizontally-striped pants". If the model is wearing both a top and bottom and only one will be swapped, describe the one the user most likely wants to change. If both could be swapped, describe both.>
MODEL_IDENTITY: <short noun phrase capturing the model's appearance that must be preserved exactly: hair (color, length, style), skin tone, facial features, body proportions, and FACE LIGHTING / EXPOSURE character when clearly visible. Example: "long dark brown wavy hair, warm medium-olive skin, slim athletic build, neutral expression, evenly lit face with soft bright frontal exposure">
POSE: <short noun phrase describing the model's stance, arm position, leg position, and camera angle. Example: "standing three-quarter view facing camera, left hand on hip, right arm relaxed at side, weight on right leg">
SCENE: <short noun phrase describing the background, lighting, exact background COLOR / BRIGHTNESS / TONAL VALUE, and all non-swapped wardrobe items (shoes, accessories, other clothing). Example: "plain light-gray seamless studio backdrop with bright even tone, soft even frontal lighting, bare feet, no visible accessories">

RULES:
- Describe only what you can see with certainty. Do NOT invent details.
- Do NOT invent text, logos, brand names, or numbers.
- Use only real, common English words.
- Keep each line concise — one noun phrase, no sentences, no commentary.
- When clearly visible, preserve literal photographic conditions rather than vague style words: include whether the face is bright, evenly exposed, softly shadowed, or low-contrast, and include whether the backdrop is bright white, light gray, warm cream, or another specific tone.
- Output exactly the four lines above, nothing else.

ANTI-HALLUCINATION RULES — violating any of these produces bad outputs:
- NEVER guess a hardware material. If a button, zipper pull, rivet, or buckle's material cannot be identified with certainty, describe ONLY its color and shape. Do NOT write "pearl", "pearl-like", "horn", "bone", "faux-bone", "wooden", "metallic", "brass-looking", "leather-like", or "tortoiseshell".
- NEVER use the word "trim" or "trimmed" unless it is clearly a DIFFERENT color from the garment body. A ruffle or frill in the same color as the body is self-fabric — describe the shape alone (e.g. "ruffled collar") or use "self-fabric ruffle". The word "trim" implies contrast to the image model.
- NEVER use hedge qualifiers such as "-like", "-looking", "-style", "-ish", "sort of", "kind of", or "appears to be". If you cannot identify a detail with certainty, OMIT it entirely.

DESCRIPTOR DISCIPLINE — from controlled prompt tests, not optional:
- Use only words that name a visible, renderable physical property. The image model cannot render abstract or quantifier words.
- NEVER use abstract or quantifier words such as: "easy", "medium", "moderate", "nice", "great", "beautiful", "basic", "standard", "regular", "normal".
- NEVER repeat the same descriptor word across your four output lines. Each descriptor token (e.g. "soft", "relaxed", "tailored", "warm") must appear at most ONCE across all four lines.
- Pick material-consistent adjectives. Do NOT describe a knit as "crisp", a denim as "drapey", a silk as "stiff".`;

export interface AnalyzedModelPhoto {
  /** The garment currently on the model that must be replaced. */
  currentGarment: string;
  /** Model features the image model must preserve exactly. */
  modelIdentity: string;
  /** The pose + camera angle to preserve. */
  pose: string;
  /** Background, lighting, and untouched wardrobe items to preserve. */
  scene: string;
}

export const MODEL_PHOTO_ANALYSIS_FALLBACK: AnalyzedModelPhoto = {
  currentGarment: "the currently visible clothing that conflicts with the replacement garment",
  modelIdentity:
    "the same model identity, face, hair, skin tone, expression, and body proportions visible in the primary studio photograph",
  pose: "the same pose, stance, arm position, body angle, and camera angle visible in the primary studio photograph",
  scene:
    "the same studio background, lighting, shadows, accessories, and non-swapped wardrobe items visible in the primary studio photograph",
};

function cleanModelAnalysisValue(value: unknown): string {
  return String(value || "")
    .replace(/^["'`*_ \t-]+|["'`*_ \t-]+$/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\.$/, "");
}

function parseModelPhotoAnalysis(raw: string): AnalyzedModelPhoto {
  const output = raw.trim();
  let parsedJson: any = null;
  try {
    parsedJson = JSON.parse(extractJsonObject(output));
  } catch {
    parsedJson = null;
  }

  const fromJson = (keys: string[]) => {
    if (!parsedJson || typeof parsedJson !== "object") return "";
    for (const key of keys) {
      const direct = parsedJson[key];
      if (direct) return cleanModelAnalysisValue(direct);
      const foundKey = Object.keys(parsedJson).find(
        (candidate) =>
          candidate.replace(/[\s_-]+/g, "").toLowerCase() ===
          key.replace(/[\s_-]+/g, "").toLowerCase()
      );
      if (foundKey && parsedJson[foundKey]) return cleanModelAnalysisValue(parsedJson[foundKey]);
    }
    return "";
  };

  const grab = (labels: string[]): string => {
    for (const label of labels) {
      const flexible = label.replace(/[_\s]+/g, "[_\\s-]*");
      const re = new RegExp(
        `(?:^|\\n)\\s*(?:[-*•]\\s*)?(?:\\*\\*)?${flexible}(?:\\*\\*)?\\s*[:\\-–]\\s*([\\s\\S]+?)(?=\\n\\s*(?:[-*•]\\s*)?(?:\\*\\*)?(?:CURRENT[_\\s-]*GARMENT|MODEL[_\\s-]*IDENTITY|MODEL|IDENTITY|POSE|SCENE|BACKGROUND|LIGHTING)(?:\\*\\*)?\\s*[:\\-–]|$)`,
        "i"
      );
      const match = output.match(re);
      if (match?.[1]) return cleanModelAnalysisValue(match[1]);
    }
    return "";
  };

  const currentGarment =
    fromJson(["currentGarment", "current_garment", "current garment", "currentOutfit"]) ||
    grab(["CURRENT_GARMENT", "CURRENT GARMENT", "CURRENT OUTFIT", "GARMENT"]) ||
    MODEL_PHOTO_ANALYSIS_FALLBACK.currentGarment;
  const modelIdentity =
    fromJson(["modelIdentity", "model_identity", "model identity", "identity", "model"]) ||
    grab(["MODEL_IDENTITY", "MODEL IDENTITY", "IDENTITY", "MODEL"]) ||
    MODEL_PHOTO_ANALYSIS_FALLBACK.modelIdentity;
  const pose =
    fromJson(["pose", "modelPose", "model_pose"]) ||
    grab(["POSE", "MODEL POSE"]) ||
    MODEL_PHOTO_ANALYSIS_FALLBACK.pose;
  const scene =
    fromJson(["scene", "background", "lighting", "environment"]) ||
    grab(["SCENE", "BACKGROUND", "LIGHTING", "ENVIRONMENT"]) ||
    MODEL_PHOTO_ANALYSIS_FALLBACK.scene;

  return { currentGarment, modelIdentity, pose, scene };
}

export type GarmentFitAdjustment =
  | "fitted"
  | "true-to-reference"
  | "oversized"
  | "barrel"
  | "wide-leg"
  | "straight-leg"
  | "flare"
  | "bootcut"
  | "skinny"
  | "slim"
  | "relaxed"
  | "baggy"
  | "tapered"
  | "cargo";
export type GarmentLengthAdjustment =
  | "shorter"
  | "true-to-reference"
  | "longer"
  | "cropped"
  | "ankle"
  | "full-length"
  | "floor-grazing"
  | "cuffed"
  | "bermuda";

export interface GarmentAdjustments {
  fit?: GarmentFitAdjustment;
  length?: GarmentLengthAdjustment;
}

export type SwapScope = "upper-body" | "lower-body" | "full-look";

export function inferSwapScope(garment: string): SwapScope {
  const text = garment.toLowerCase();

  const fullLookWords = [
    "dress",
    "jumpsuit",
    "romper",
    "bodysuit",
    "catsuit",
    "onesie",
    "set",
    "outfit",
    "matching set",
    "two-piece",
  ];
  if (fullLookWords.some((w) => text.includes(w))) return "full-look";

  const lowerBodyWords = [
    "pants",
    "trousers",
    "jeans",
    "shorts",
    "skirt",
    "mini skirt",
    "midi skirt",
    "maxi skirt",
    "leggings",
    "joggers",
    "sweatpants",
    "slacks",
    "chinos",
    "khakis",
    "corduroys",
    "bottoms",
  ];
  if (lowerBodyWords.some((w) => text.includes(w))) return "lower-body";

  return "upper-body";
}

function buildProductLengthAuthorityClause(scope: SwapScope): string {
  const poseGarmentFirewall =
    " The selected model-pose image is not a garment reference. It controls only the model identity, body, pose, camera, framing, lighting, and background; ignore its existing clothing when deciding the new garment's category, silhouette, crop point, body length, sleeve length, hem position, neckline, waistband exposure, fabric, color, trim, print, and styling.";

  if (scope === "lower-body") {
    return (
      ` Product length authority: the uploaded garment reference controls the bottom length, rise, inseam, hem position, leg opening, and fabric break. Do not inherit pant, skirt, or short length from the model pose photograph unless it is visible in the uploaded product.${poseGarmentFirewall}`
    );
  }

  if (scope === "full-look") {
    return (
      ` Product length authority: the uploaded garment reference controls every hem and coverage point in the full look. Do not inherit the model pose photograph's existing top length, crop point, waistband exposure, dress length, pant length, or outfit proportions.${poseGarmentFirewall}`
    );
  }

  return (
    ` Product length authority: the uploaded garment reference controls the true body length, hem placement, sleeve length, and coverage of the new upper-body garment. Do not inherit, match, or average the current shirt, tank, sweater, or jacket length from the model pose photograph. If the model pose is wearing a cropped or at-waist top, ignore that old hem completely. If the uploaded jacket, cardigan, shirt, or sweater extends below the waistband, to the high hip, to the hip, or lower, render the new garment at that same longer coverage on the model. Do not crop jackets or tops for no reason, and do not expose the waistband unless the uploaded product is actually cropped.${poseGarmentFirewall}`
  );
}

function buildGarmentAdjustmentClause(adjustments?: GarmentAdjustments): string {
  const fit = adjustments?.fit ?? "true-to-reference";
  const length = adjustments?.length ?? "true-to-reference";
  const clauses: string[] = [];

  const pantsFitClauses: Partial<Record<GarmentFitAdjustment, string>> = {
    barrel:
      "Render the pants as a true barrel-leg silhouette: rounded volume through the thigh and knee, curved outer leg line, then a clear taper toward a narrower ankle opening. Do not let the pants become straight-leg or wide-leg.",
    "wide-leg":
      "Render the pants as wide-leg: roomy from hip through hem with a broad, consistent leg opening and no taper at the ankle.",
    "straight-leg":
      "Render the pants as straight-leg: even leg width from thigh to hem with a clean vertical side line, neither flared nor tapered.",
    flare:
      "Render the pants as flared: fitted or controlled through the thigh and knee, then widening visibly from knee to hem.",
    bootcut:
      "Render the pants as bootcut: slim through the thigh with a subtle outward opening below the knee, less dramatic than a flare.",
    skinny:
      "Render the pants as skinny: close-fitting from hip through ankle, following the leg shape with a narrow ankle opening.",
    slim:
      "Render the pants as slim: tailored close to the body without being skin-tight, with a narrow clean leg line.",
    relaxed:
      "Render the pants as relaxed: easy room through hip and thigh with a natural loose leg, not oversized or baggy.",
    baggy:
      "Render the pants as baggy: oversized volume through hip, thigh, and leg with a loose streetwear drape while preserving the reference details.",
    tapered:
      "Render the pants as tapered: room through the thigh that narrows progressively toward the ankle.",
    cargo:
      "Render the pants as cargo-fit: utilitarian relaxed leg volume with cargo-pocket structure preserved when visible, not skinny or dress-trouser slim.",
  };

  if (pantsFitClauses[fit]) {
    clauses.push(pantsFitClauses[fit]!);
  } else if (fit === "fitted") {
    clauses.push("Render the garment slightly more fitted and reduced in overall volume on the body than the raw reference impression, while preserving all design details and keeping the result natural for the garment type.");
  } else if (fit === "oversized") {
    clauses.push("Render the garment slightly more oversized and roomier on the body than the raw reference impression, while preserving all design details and keeping the result natural for the garment type.");
  }

  const pantsLengthClauses: Partial<Record<GarmentLengthAdjustment, string>> = {
    cropped:
      "Render the pants as cropped length, with the hem ending above the ankle while keeping the leg shape and proportions intentional.",
    ankle:
      "Render the pants at ankle length, with the hem landing at the ankle bone and no pooling at the floor.",
    "full-length":
      "Render the pants full length, with the hem reaching the top of the shoe or foot line in a clean catalog proportion.",
    "floor-grazing":
      "Render the pants extra long and floor-grazing, with a subtle break or soft pooling at the hem while keeping the fabric behavior realistic.",
    cuffed:
      "Render the pants with a visible cuffed hem, preserving the selected leg shape above the cuff.",
    bermuda:
      "Render the bottoms as bermuda length if the uploaded reference is shorts, with the hem near the knee; do not apply bermuda length to full-length pants unless the user intentionally selected it.",
  };

  if (pantsLengthClauses[length]) {
    clauses.push(pantsLengthClauses[length]!);
  } else if (length === "shorter") {
    clauses.push("Render the garment slightly shorter on the body than the raw reference impression, with hems, sleeves, or leg length landing a bit higher while still looking natural and proportional.");
  } else if (length === "longer") {
    clauses.push("Render the garment slightly longer on the body than the raw reference impression, with hems, sleeves, or leg length landing a bit lower while still looking natural and proportional. For jackets, tops, sweaters, and cardigans, make the body length visibly lower than the model pose photo's original top hem; do not stop at the old cropped-shirt length.");
  }

  if (clauses.length === 0) {
    return " Match the garment's fit and length on-body as closely as possible to the uploaded product reference, without drifting smaller, larger, shorter, or longer. Never use the model pose photo's existing shirt/top hem as the length guide for a new jacket, cardigan, shirt, sweater, or outerwear piece.";
  }

  return ` Fit adjustment: ${clauses.join(" ")}`;
}

/**
 * Run a vision pass over a model-pose photograph and extract the four
 * preservation fields. Used by the Model Studio's analyze step.
 */
export async function analyzeModelPhoto(imageUrl: string): Promise<AnalyzedModelPhoto> {
  const result: any = await subscribeVisionWithRetry(
    {
      model: VISION_MODEL,
      system_prompt: MODEL_PHOTO_ANALYSIS_PROMPT,
      prompt:
        "Analyze the model photograph using the four-line CURRENT_GARMENT / MODEL_IDENTITY / POSE / SCENE format defined in your system prompt. Output exactly those four lines, nothing else.",
      image_url: imageUrl,
    },
    "pose photo analysis"
  );

  const data = result?.data ?? result;
  const output: string = (data?.output ?? data?.response ?? data?.text ?? "").trim();
  if (!output) {
    console.error("[analyze-model] full response:", JSON.stringify(data).slice(0, 1000));
    throw new Error("Model photo analysis returned no text output.");
  }

  const modelFields = parseModelPhotoAnalysis(output);

  if (
    Object.values(modelFields).some((value) =>
      Object.values(MODEL_PHOTO_ANALYSIS_FALLBACK).includes(value)
    )
  ) {
    console.warn("[analyze-model] used safe fallback fields for pose analysis:", output.slice(0, 500));
  }

  console.log("[analyze-model] current:", modelFields.currentGarment);
  console.log("[analyze-model] identity:", modelFields.modelIdentity);
  console.log("[analyze-model] pose:", modelFields.pose);
  console.log("[analyze-model] scene:", modelFields.scene);

  return modelFields;
}

/**
 * Build three differently-phrased model-swap prompts in the Image-A / Image-B
 * structure that won David's earlier face-swap test. Image A is the model
 * pose photograph (image_urls[0], the editing canvas); Image B is the user's
 * garment reference (image_urls[1+], the source of the new clothing). All
 * three follow the same four-part pattern: preserve A, extract B, integrate,
 * quality + negatives — only the verbs and clause ordering vary, since
 * Nano Banana 2.0 produces meaningfully different outputs from synonym swaps.
 *
 * @returns tuple of exactly three prompt strings; pass each to a parallel
 *          /api/generate-model call so the user can pick the best of three.
 */
export function buildModelSwapPromptVariants(
  newGarment: string,
  newGarmentFeatures: string,
  analyzedModel: AnalyzedModelPhoto,
  adjustments?: GarmentAdjustments,
  swapScopeOverride?: SwapScope
): [string, string, string] {
  const swapScope = swapScopeOverride ?? inferSwapScope(newGarment);
  const adjustmentClause = buildGarmentAdjustmentClause(adjustments);
  const lengthAuthorityClause = buildProductLengthAuthorityClause(swapScope);

  // Scope clause — vary the verb across variants for prompt diversity but
  // keep the underlying instruction identical.
  const scopeClauseFor = (verb: "replace" | "transfer" | "integrate", ng: string): string =>
    swapScope === "upper-body"
      ? `${verb} only the upper-body garment area with the new ${ng}; preserve any visible skirt, pants, shorts, or other lower-body garment from Image A exactly as-is — same color, shape, hem, waistband, drape, and coverage; do not remove, crop out, fade out, or simplify the lower-body garment.`
      : swapScope === "lower-body"
      ? `${verb} only the lower-body garment area with the new ${ng}; preserve any visible top, jacket, sweater, blouse, shirt, or upper-body garment from Image A exactly as-is, and obey the specified leg silhouette exactly — preserve barrel curvature, wide-leg width, straight-leg vertical line, flare opening, taper, cuff, hem length, waistband rise, pocket placement, and fabric break without straightening, widening, or flattening.`
      : `${verb} the full visible outfit with the new ${ng}, since it is a full-look garment.`;

  // Anti-layering directive — shared across variants because the failure mode
  // is so common (model hallucinates an inner cami when the upload has a
  // high-low / shirttail hem). Phrased differently per variant so each prompt
  // still feels distinct, but every variant carries the constraint.
  const antiLayeringFor = (variant: "structure" | "surface" | "strict"): string => {
    if (variant === "structure") {
      return `treat any visible difference between front-hem height and back-hem height in Image B as the SAME garment's intentional high-low / shirttail / stepped hem geometry, not as a separate cami, undershirt, inner top, or layered piece — render the asymmetric hem on the model exactly as one continuous garment with a longer back panel, never split into two pieces;`;
    }
    if (variant === "surface") {
      return `the upload in Image B is ONE garment — never invent a second garment, contrasting underlayer, or visible inner cami beneath it; if Image B shows a longer back hem peeking below a shorter front hem, that is part of the same garment's hem and must be preserved as one continuous piece on the model;`;
    }
    return `do not add any inner garment, cami, undershirt, layered piece, or contrasting underlayer beneath the rendered top, even if the back hem of Image B extends below the front hem — that asymmetry is the SAME garment's high-low construction, never two pieces;`;
  };

  // Variant 1 — STRUCTURE-FIRST. Front-loads silhouette, hem geometry, sleeve
  // shape, body length. Use this when the garment has distinctive cut details
  // (high-low hem, balloon sleeves, mock collar, asymmetric closures, etc.)
  // that Nano Banana tends to flatten or simplify.
  const renderV1 = (ng: string, nf: string, cg: string, mi: string, ps: string, sc: string): string => {
    const featureClause = nf
      ? `preserve the garment's exact construction from Image B, including: ${nf};`
      : "preserve every structural detail of the garment from Image B exactly;";
    return [
      `Use Image A as the base image and keep the model's body, face, identity (${mi}), pose (${ps}), hair, expression, lighting, shadows, camera angle, depth of field, and background (${sc}) completely unchanged;`,
      `take the ${ng} from Image B and apply it onto the model — ${scopeClauseFor("replace", ng)} remove only the portion of ${cg} that conflicts with the new ${ng}, and carefully match lighting direction, fabric drape, body contour, perspective, and shadow behavior so everything blends naturally;`,
      `STRUCTURE PRIORITY: render the garment with the EXACT silhouette and construction visible in Image B — body length, hem geometry (preserve any high-low, shirttail, stepped, or asymmetric hem with the back panel longer than the front exactly as shown), sleeve length and volume, cuff shape, neckline depth and shape, collar height, waistband, drape, and overall body fit;`,
      featureClause,
      antiLayeringFor("structure"),
      `render the garment as a worn garment on this specific model and pose with natural drape, fit, volume, and contour responding to the body and scene, not a static copy of the flat-lay shape from Image B;`,
      lengthAuthorityClause.trim(),
      adjustmentClause.trim(),
      `remove all neck labels, brand tags, size tags, care labels, and sewn-in woven tags from the rendered garment;`,
      `Image A is the lighting and exposure authority — match its background brightness, backdrop tonal value, facial exposure, facial brightness, and face lighting pattern exactly; do not darken, mute, gray, warm, or cool the scene relative to Image A;`,
      `output a photorealistic 4K editorial fashion catalog image in 2:3 aspect ratio with anatomically correct proportions, clean garment edges, and high-detail textures.`,
      `Negative prompt: no face alteration, no body reshape, no pose drift, no garment-shape drift, no flattened high-low hem, no straightened shirttail hem, no separate inner garment, no layered cami, no contrasting underlayer, no straightening of barrel or flared pants, no widening of skinny pants, no cropped jacket unless the uploaded jacket is cropped, no matching the old top length.`,
    ]
      .filter(Boolean)
      .join(" ");
  };

  // Variant 2 — SURFACE-FIRST. Front-loads color, pattern fidelity, trim
  // placement, hardware position, fabric texture. Use this when the garment
  // has a distinctive print, hardware, or trim that tends to drift or get
  // mirrored / relocated by the model.
  const renderV2 = (ng: string, nf: string, cg: string, mi: string, ps: string, sc: string): string => {
    const featureClause = nf
      ? `keep every surface detail from Image B intact, including: ${nf};`
      : "keep every visible surface detail from Image B intact;";
    return [
      `Build the final image from Image A as the foundation, preserving every visual element exactly as shown — ${mi}, pose (${ps}), scene (${sc}), face, hair, posture, lighting setup, shadows, camera perspective, and depth of field, plus the rest of the visible outfit aside from the swap area;`,
      `transfer the ${ng} from Image B onto the subject in Image A — ${scopeClauseFor("transfer", ng)} remove from the current look only the portion of ${cg} that the new ${ng} replaces, and adapt the garment to Image A's lighting intensity, body geometry, perspective, and shadow placement for seamless realism;`,
      `SURFACE PRIORITY: the garment must match Image B's color exactly (every hue and saturation), the print pattern (every motif placement, density, and orientation), all trim and tape placement, hardware positions on the wearer-correct side (zippers, buttons, snaps, drawstrings), hem stitching color and width, and the precise fabric texture and sheen visible in Image B; do not mirror left/right artwork, do not relocate sleeve or chest details to the visible side just to make them readable; SCATTERED PATCH FIDELITY: if Image B shows multiple patches or motifs of similar size scattered all over the garment, reproduce ALL of them at their original relative sizes — do NOT scale up any single patch and do NOT merge multiple scattered patches into one oversized center graphic;`,
      featureClause,
      antiLayeringFor("surface"),
      `the garment must read as a worn garment on this model in this pose, not a flat-lay copy — re-render natural drape, fabric tension, and contour while preserving every visible design detail;`,
      lengthAuthorityClause.trim(),
      adjustmentClause.trim(),
      `remove all neck labels, brand tags, size tags, care labels, and sewn-in woven tags from the rendered garment;`,
      `Image A is the exposure and color authority — match its background tone, facial exposure, and overall scene mood exactly; do not shift any of these;`,
      `produce an ultra-realistic 4K image in 2:3 format with accurate facial scaling, natural blending, and high-detail textures with no visible seams, distortion, or compositing artifacts.`,
      `Negative prompt: no color drift, no pattern simplification, no missing trims, no relocated hardware, no mirrored print, no recolor, no texture blending, no exposure shift, no background change, no separate inner garment, no layered cami, no contrasting underlayer.`,
    ]
      .filter(Boolean)
      .join(" ");
  };

  // Variant 3 — STRICT / ANTI-FAILURE. Front-loads explicit do-nots. Use this
  // as the safety-net variant — it leans heavily on negatives so it's the
  // most likely to catch failure modes the other two variants miss.
  const renderV3 = (ng: string, nf: string, cg: string, mi: string, ps: string, sc: string): string => {
    const featureClause = nf
      ? `preserve every detail of the garment from Image B including: ${nf};`
      : "preserve every visible detail of the garment from Image B;";
    return [
      `Take Image A and preserve everything exactly as it is — ${mi}, pose (${ps}), scene (${sc}), face, hair, posture, lighting, shadows, camera angle, and the rest of the visible outfit aside from the swap area;`,
      `extract the ${ng} from Image B and integrate it onto the model — ${scopeClauseFor("integrate", ng)} remove only the portion of ${cg} that the new garment replaces, and ensure consistent lighting, skin-tone interaction, perspective, and depth across the new garment;`,
      `CRITICAL DO-NOTS: (1) ${antiLayeringFor("strict").replace(/^[a-z]/, (c) => c.toUpperCase())} (2) do not split the garment from Image B into multiple pieces, even if the hem is asymmetric. (3) Do not change garment color, pattern, hardware position, trim placement, neckline, sleeve shape, or hem geometry away from Image B. (4) Do not change the model's face, body, pose, hair, expression, or proportions. (5) Do not change the background, lighting, exposure, or camera perspective. (6) Do not invent text, logos, or branding not present in Image B.`,
      featureClause,
      `the result must look like a single authentic fashion catalog photograph of this model in this pose, wearing the new ${ng} as ONE continuous garment with correct silhouette, drape, hem geometry, sleeve length, and trim placement — not a flat-lay reproduction and not split into multiple pieces;`,
      lengthAuthorityClause.trim(),
      adjustmentClause.trim(),
      `remove all neck labels, brand tags, size tags, care labels, and sewn-in woven tags from the rendered garment;`,
      `Image A controls the exposure and color tone — preserve its background brightness, face lighting, and overall scene mood; do not shift any of these;`,
      `deliver a 4K photorealistic image in 2:3 aspect ratio with realistic anatomical proportions, clean compositing, and detailed garment textures throughout, with no warping, scaling errors, or edit artifacts.`,
      `Negative prompt: no face alteration, no body reshape, no exposure shift, no background change, no garment-shape drift, no separate inner garment, no layered cami, no undershirt, no contrasting underlayer, no split-into-two-pieces, no flattened high-low hem, no mirrored hardware, no relocated trim, no straightened barrel pants, no widened skinny pants, no cropped jacket unless the uploaded jacket is cropped.`,
    ]
      .filter(Boolean)
      .join(" ");
  };

  // Sanitize per-variant. Each template has its own descriptor footprint, so
  // we compute it independently for each render function before substituting.
  const sanitizeFor = (
    render: (ng: string, nf: string, cg: string, mi: string, ps: string, sc: string) => string
  ): string => {
    const used = descriptorsInTemplate(render("", "", "", "", "", ""));
    return render(
      sanitizeAnalyzerText(newGarment, used),
      sanitizeAnalyzerText(newGarmentFeatures, used),
      sanitizeAnalyzerText(analyzedModel.currentGarment, used),
      sanitizeAnalyzerText(analyzedModel.modelIdentity, used),
      sanitizeAnalyzerText(analyzedModel.pose, used),
      sanitizeAnalyzerText(analyzedModel.scene, used)
    );
  };

  return [sanitizeFor(renderV1), sanitizeFor(renderV2), sanitizeFor(renderV3)];
}

/**
 * Build the model-swap prompt. Returns the first of three Image-A / Image-B
 * variants — kept as a single-prompt API for batch generation, quality-control
 * repairs, and complete-photoshoot-set flows that don't need multi-option.
 *
 * @param newGarment  noun phrase for the replacement garment (from analyzing the user's upload)
 * @param newGarmentFeatures  comma-separated visible details of the replacement garment
 * @param analyzedModel  the four preservation fields from analyzeModelPhoto()
 */
export function buildModelSwapPrompt(
  newGarment: string,
  newGarmentFeatures: string,
  analyzedModel: AnalyzedModelPhoto,
  adjustments?: GarmentAdjustments,
  swapScopeOverride?: SwapScope
): string {
  return buildModelSwapPromptVariants(
    newGarment,
    newGarmentFeatures,
    analyzedModel,
    adjustments,
    swapScopeOverride
  )[0];
}

/**
 * Build three differently-phrased composition-first beta prompts. Same
 * structural identity as buildModelStudioBetaPrompt — input role lock,
 * photorealistic shooting setup, layout authority — but each variant
 * emphasizes a different concern (structure / surface / strict negatives)
 * so the trio gives meaningfully different outputs in Studio 2 just like
 * in Studio 1.
 */
export function buildModelStudioBetaPromptVariants(
  newGarment: string,
  newGarmentFeatures: string,
  analyzedModel: AnalyzedModelPhoto,
  adjustments?: GarmentAdjustments
): [string, string, string] {
  const swapScope = inferSwapScope(newGarment);
  const adjustmentClause = buildGarmentAdjustmentClause(adjustments);
  const lengthAuthorityClause = buildProductLengthAuthorityClause(swapScope);
  const clean = (value: string) => sanitizeAnalyzerText(value, new Set());
  const cleanGarment = clean(newGarment);
  const cleanFeatures = clean(newGarmentFeatures);
  const cleanPose = clean(analyzedModel.pose);
  const cleanScene = clean(analyzedModel.scene);
  const featureClause = cleanFeatures
    ? `Preserve all garment details from the attached product image exactly: ${cleanFeatures}.`
    : "Preserve every visible garment detail from the attached product image exactly.";
  const scopeClause =
    swapScope === "upper-body"
      ? "Apply the product only to the upper-body garment area and preserve any visible lower-body styling from the layout reference unless it conflicts with the garment."
      : swapScope === "lower-body"
      ? "Apply the product only to the lower-body garment area and preserve any visible upper-body styling from the layout reference unless it conflicts with the garment."
      : "Apply the product as the full visible outfit because the source garment is a full-look or coordinated garment.";

  // Anti-layering clause — same insight as the classic variants: high-low /
  // shirttail hems are ONE garment, not two. Phrased differently per variant.
  const antiLayeringFor = (variant: "structure" | "surface" | "strict"): string => {
    if (variant === "structure") {
      return "Treat any visible difference between front-hem and back-hem heights in the product image as the SAME garment's high-low / shirttail / stepped hem geometry, not as a separate cami, undershirt, inner top, or layered piece. Render the asymmetric hem as one continuous garment with a longer back panel.";
    }
    if (variant === "surface") {
      return "The uploaded product is ONE garment — never invent a second garment, contrasting underlayer, or visible inner cami beneath it. Any longer back hem visible in the product image is part of the same garment's hem, not a separate inner layer.";
    }
    return "Do not add any inner garment, cami, undershirt, layered piece, or contrasting underlayer beneath the rendered top, even if the product back hem extends below the front hem — that asymmetry is the SAME garment's high-low construction, never two pieces.";
  };

  // Variant 1 — STRUCTURE-FIRST. Emphasizes silhouette / hem / construction.
  const v1 = [
    "Create a studio fashion image by editing the first image, which is the selected human model pose and the only layout/composition canvas.",
    "Input image role lock: the first image is the model pose canvas and controls the model, face, body, pose, camera angle, framing, background, lighting, spacing, margins, scale, and panel layout. Every additional uploaded image is a garment reference only. Never use the garment reference photo as the final layout.",
    "The final output must be the selected human model wearing the uploaded garment. Match the structure of the first model-pose image, including the number of panels, framing, spacing, margins, scale, camera distance, and overall grid arrangement.",
    `STRUCTURE PRIORITY: render the garment with the EXACT silhouette and construction visible in the product image — body length, hem geometry (preserve any high-low, shirttail, stepped, or asymmetric hem with the back panel longer than the front exactly as shown), sleeve length and volume, cuff shape, neckline depth and shape, collar height, waistband, drape, and overall body fit. The garment must read as a worn ${cleanGarment}, not a flat-lay copy.`,
    antiLayeringFor("structure"),
    "Photorealistic shooting setup: Sony A7 IV, 50mm to 85mm commercial lookbook perspective, f/4 to f/5.6, sharp full-body clarity, minimal background blur, real fashion brand lookbook photography, RAW image feel, natural skin texture with visible pores and fine details, soft realistic hair strands, natural catchlights, clean polished but not over-retouched.",
    "Model direction: preserve the selected reference model identity, face, hair color, hairstyle, hair length, skin tone, body proportions, and natural commercial makeup from the layout reference.",
    featureClause,
    lengthAuthorityClause,
    `${scopeClause} No additional styling that distracts from the product.`,
    "Background and lighting: warm beige seamless studio background matching the reference tone, soft even commercial lighting, no harsh shadows, only subtle grounding shadow.",
    `Preserve from the first model-pose image where applicable: ${cleanPose}, ${cleanScene}, and the same camera perspective.`,
    adjustmentClause,
    "Negative prompt: no flat lay, no hanger, no mannequin, no separate inner garment, no layered cami, no contrasting underlayer, no flattened high-low hem, no straightened shirttail, no garment-shape drift, no model identity distortion, no background change, no patch consolidation, no oversized single center graphic when reference shows multiple equal-sized scattered patches.",
  ]
    .filter(Boolean)
    .join(" ");

  // Variant 2 — SURFACE-FIRST. Emphasizes color / pattern / trim placement.
  const v2 = [
    "Create a studio fashion image by editing the first image, which is the selected human model pose and the only layout/composition canvas.",
    "Input image role lock: the first image controls the model, pose, camera angle, framing, background, lighting, spacing, scale, and panel layout. Every additional uploaded image is a garment reference only. Never output the garment by itself, a flat lay, a hanger photo, a mannequin photo, or a product-only ecommerce image.",
    "Match the structure of the first model-pose image — number of panels, framing, spacing, margins, scale, camera distance, grid arrangement.",
    `SURFACE PRIORITY: the garment must match the product image's color exactly (every hue and saturation), the print pattern (every motif placement, density, and orientation), all trim and tape placement, hardware positions on the wearer-correct side (zippers, buttons, snaps, drawstrings), hem stitching color and width, and the precise fabric texture and sheen visible in the product image. Do not mirror left/right artwork. Do not relocate sleeve or chest details to the visible side just to make them readable. SCATTERED PATCH / ALL-OVER PATTERN FIDELITY: if the product image shows multiple patches, appliqués, or motifs of similar size distributed all over the garment (chest, torso, sleeves), reproduce ALL of them at their original relative sizes and spatial positions — do NOT scale up any single patch to make it larger, and do NOT consolidate multiple scattered patches into one dominant oversized center-chest graphic. Maintain the same approximate patch count and scatter density as the reference. Render as a worn ${cleanGarment}.`,
    antiLayeringFor("surface"),
    "Photorealistic shooting setup: Sony A7 IV, 50mm to 85mm commercial lookbook perspective, f/4 to f/5.6, sharp full-body clarity, minimal background blur, RAW image feel, natural skin texture, soft realistic hair strands, natural catchlights.",
    "Model direction: preserve the selected reference model identity, face, hair, skin tone, body proportions, and natural commercial makeup from the layout reference.",
    featureClause,
    lengthAuthorityClause,
    `${scopeClause} Do not alter, simplify, recolor, redesign, or reinterpret the garment.`,
    "Background and lighting: warm beige seamless studio background, soft even commercial lighting, subtle grounding shadow only.",
    `Preserve from the first model-pose image where applicable: ${cleanPose}, ${cleanScene}, and the same camera perspective.`,
    adjustmentClause,
    "Negative prompt: no color drift, no pattern simplification, no missing trims, no relocated hardware, no mirrored print, no separate inner garment, no layered cami, no contrasting underlayer, no flat lay, no hanger, no mannequin, no model identity distortion, no background change, no patch consolidation, no single oversized center graphic when reference shows multiple equal-sized scattered patches.",
  ]
    .filter(Boolean)
    .join(" ");

  // Variant 3 — STRICT / ANTI-FAILURE. Heavy negatives, the safety-net variant.
  const v3 = [
    "Create a studio fashion image by editing the first image, which is the selected human model pose and the only layout/composition canvas.",
    "Input image role lock: the first image is the model pose canvas — model, pose, camera angle, framing, background, lighting, spacing, scale, and panel layout all come from it. The garment reference is a garment source only.",
    "Match the structure of the first model-pose image exactly — number of panels, framing, spacing, scale, camera distance.",
    `CRITICAL DO-NOTS: (1) ${antiLayeringFor("strict")} (2) Do not split the garment from the product image into multiple pieces, even if its hem is asymmetric. (3) Do not change garment color, pattern, hardware position, trim placement, neckline, sleeve shape, or hem geometry away from the product image. (4) Do not change the model's face, body, pose, hair, expression, or proportions. (5) Do not change the background, lighting, exposure, or camera perspective. (6) Do not invent text, logos, or branding not present in the product image. (7) Never output the garment by itself, a flat lay, a hanger photo, a mannequin photo, or a product-only ecommerce image.`,
    `The garment must be a worn ${cleanGarment} on this model in this pose, ONE continuous garment with correct silhouette and trim placement.`,
    "Photorealistic shooting setup: Sony A7 IV, 50mm to 85mm commercial lookbook perspective, f/4 to f/5.6, RAW image feel, natural skin texture, fine details.",
    "Model direction: preserve the selected reference model identity, face, hair, skin tone, body proportions, and natural commercial makeup.",
    featureClause,
    lengthAuthorityClause,
    scopeClause,
    "Background and lighting: warm beige seamless studio background, soft even commercial lighting.",
    `Preserve from the first model-pose image where applicable: ${cleanPose}, ${cleanScene}.`,
    adjustmentClause,
    "Negative prompt: no flat lay, no hanger, no mannequin, no torso form, no isolated garment, no garment redesign, no color change, no missing trims, no wrong patches, no separate inner garment, no layered cami, no undershirt, no contrasting underlayer, no split-into-two-pieces, no flattened high-low hem, no mirrored hardware, no relocated trim, no model identity distortion, no background change, no patch consolidation, no single oversized center graphic when reference has multiple equal-sized scattered patches.",
  ]
    .filter(Boolean)
    .join(" ");

  return [v1, v2, v3];
}

/**
 * Build the composition-first beta prompt. Returns variants[0] so single-prompt
 * call sites (batch / QC / photoshoot single-variant flow) keep working.
 */
export function buildModelStudioBetaPrompt(
  newGarment: string,
  newGarmentFeatures: string,
  analyzedModel: AnalyzedModelPhoto,
  adjustments?: GarmentAdjustments
): string {
  return buildModelStudioBetaPromptVariants(
    newGarment,
    newGarmentFeatures,
    analyzedModel,
    adjustments
  )[0];
}

/**
 * Two-piece variant of buildModelSwapPrompt: instead of a single replacement
 * garment, the replacement is a coordinated top + bottom set (e.g. a matching
 * crop-top + mini-skirt outfit). The model's entire outfit is replaced, not
 * just one piece, so we explicitly scope the removal to all visible current
 * clothing rather than only the analyzer's currentGarment noun phrase.
 */
/**
 * Two-piece variant of buildModelSwapPromptVariants. Returns three prompts
 * for a coordinated set (top + bottom) using the same Image-A / Image-B
 * structure as the single-garment variants. The full outfit is replaced.
 */
/* ----- Color / pattern / embellishment authority clauses -----
   Added after a coordinated-set test (rhinestone-studded watermelon-gradient
   set on a knit) where nano-banana drifted to velvet, desaturated the bright
   green/coral toward dusty sage/mauve, lost the rhinestones, and collapsed
   a 3-band vertical gradient (green→pink→green) into a 2-band ombré. The
   three failure modes — fabric drift, color desaturation, pattern
   discontinuity across pieces — each need an explicit authority clause
   because the existing template only has SILHOUETTE AUTHORITY. */
const COLOR_AUTHORITY_CLAUSE =
  "COLOR AUTHORITY: match the exact hues and saturation visible in Image B for both pieces. " +
  "Do not desaturate, mute, dust, or shift colors toward catalog-neutral, sage, mauve, dusty, or earth-tone palettes. " +
  "If a color reads as vivid lime green or coral pink in Image B, render it as vivid lime green or coral pink — do not approximate to a darker, browner, or grayer version. " +
  "Preserve color temperature and chroma; the rendered garments must read as the same exact dye lot as Image B.";

const PATTERN_CONTINUITY_CLAUSE =
  "PATTERN CONTINUITY: if the top and bottom share a gradient, stripe, ombré, tie-dye, dip-dye, print, or all-over pattern in Image B, render them as a single continuous design across the worn outfit — not as two independent patterns. " +
  "Preserve the exact number, order, position, and proportional thickness of every color band or stripe. " +
  "If the gradient has three bands (e.g. green→pink→green), render three bands — do not collapse to a two-band ombré. " +
  "If the top and bottom together form one continuous gradient when worn, the bottom must pick up where the top's hem leaves off in color and direction.";

const EMBELLISHMENT_FIDELITY_CLAUSE =
  "EMBELLISHMENT FIDELITY: any rhinestones, sequins, beads, studs, crystals, paillettes, glitter, foil, embroidery, appliqué, or applied surface decoration visible in Image B must be rendered explicitly on the final garment — same density, same scatter pattern, same scale, same sparkle/reflectivity, same placement across both pieces. " +
  "Do not omit, smooth over, flatten, or fabric-substitute these embellishments. " +
  "Do not convert a rhinestone-studded knit into a plain knit, velvet, or velour surface; preserve the original fabric body AND the surface embellishment.";

export function buildModelSwapTwoPiecePromptVariants(
  fields: TwoPieceFields,
  analyzedModel: AnalyzedModelPhoto,
  adjustments?: GarmentAdjustments
): [string, string, string] {
  const adjustmentClause = buildGarmentAdjustmentClause(adjustments);
  const lengthAuthorityClause = buildProductLengthAuthorityClause("full-look");

  // Variant 1 — STRUCTURE-FIRST. Front-loads the silhouette / construction
  // of both pieces so distinctive cuts and hem geometry survive the swap.
  const renderV1 = (
    t: string, tf: string, b: string, bf: string, cg: string, mi: string, ps: string, sc: string
  ): string => {
    const topClause = tf ? `top construction: ${tf};` : "";
    const bottomClause = bf ? `bottom construction: ${bf};` : "";
    return [
      `Use Image A as the base image and keep the model's body, face, identity (${mi}), pose (${ps}), hair, expression, lighting, shadows, camera angle, depth of field, and background (${sc}) completely unchanged;`,
      `take the coordinated two-piece set from Image B — a ${t} worn together with a matching ${b} — and apply both pieces onto the model in Image A, completely removing the entire currently-worn outfit including the ${cg} and every other visible clothing item, while carefully matching lighting direction, fabric drape, body contour, perspective, and shadow behavior so everything blends naturally;`,
      `STRUCTURE PRIORITY: render each piece with the EXACT silhouette and construction visible in Image B — for the top: body length, hem geometry (preserve any high-low, shirttail, stepped, or asymmetric hem exactly), sleeve length and volume, neckline, collar height; for the bottom: rise, leg shape, hem position, waistband construction, pocket placement;`,
      `${topClause} ${bottomClause}`,
      `render both pieces as a single unified coordinated outfit — same color family, same fabric family, same trim language — sitting together naturally with the top's hem layering over or tucking into the bottom's waistband as appropriate; not flat-lay copies but worn garments on this specific model and pose;`,
      COLOR_AUTHORITY_CLAUSE,
      PATTERN_CONTINUITY_CLAUSE,
      EMBELLISHMENT_FIDELITY_CLAUSE,
      lengthAuthorityClause.trim(),
      adjustmentClause.trim(),
      `remove all neck labels, brand tags, size tags, care labels, and sewn-in woven tags from both top and bottom — neckline, collar band, waistband, and every other typical label location must be clean;`,
      `Image A is the lighting and exposure authority — match its background brightness, backdrop tonal value, facial exposure, facial brightness, and face lighting pattern exactly;`,
      `output a photorealistic 4K editorial fashion catalog image in 2:3 aspect ratio with anatomically correct proportions, clean garment edges, and high-detail textures.`,
      `Negative prompt: no face alteration, no body reshape, no garment-shape drift, no flattened high-low hem, no straightened shirttail, no recolor, no desaturation, no color shift toward neutral or earth tones, no fabric substitution, no smoothed-over embellishments, no missing rhinestones or sequins, no collapsed gradient bands, no texture blending, no exposure shift, no background change, no cropped top unless the uploaded top is cropped, no matching the old top length.`,
    ]
      .filter(Boolean)
      .join(" ");
  };

  // Variant 2 — SURFACE-FIRST. Front-loads color/print/trim coordination so
  // the two pieces read as a single designed set rather than two unrelated
  // garments.
  const renderV2 = (
    t: string, tf: string, b: string, bf: string, cg: string, mi: string, ps: string, sc: string
  ): string => {
    const topClause = tf ? `top surface: ${tf};` : "";
    const bottomClause = bf ? `bottom surface: ${bf};` : "";
    return [
      `Build the final image from Image A as the foundation, preserving every visual element exactly as shown — ${mi}, pose (${ps}), scene (${sc}), face, hair, posture, lighting setup, shadows, camera perspective, and depth of field;`,
      `transfer the coordinated set from Image B — a ${t} paired with a ${b} — onto the subject in Image A, completely replacing the model's current outfit including the ${cg}, and adapting both pieces to Image A's lighting intensity, body geometry, perspective, and shadow placement for seamless realism;`,
      `SURFACE PRIORITY: both pieces must match Image B's colors exactly (every hue and saturation across top and bottom), the print pattern continuity (motif placement, density, scale matching between top and bottom), all trim and tape placement, hardware positions on the wearer-correct side, hem stitching, and the fabric texture / sheen of each piece; do not mirror left/right artwork, do not relocate sleeve or chest details to the visible side, do not let the two pieces drift into different color families;`,
      `${topClause} ${bottomClause}`,
      `the two pieces must read as one designed coordinated outfit (shared color family, fabric family, and trim language), worn naturally on the model with realistic drape, fit, and layering behavior, not as two unrelated garments and not as flat-lay copies;`,
      COLOR_AUTHORITY_CLAUSE,
      PATTERN_CONTINUITY_CLAUSE,
      EMBELLISHMENT_FIDELITY_CLAUSE,
      lengthAuthorityClause.trim(),
      adjustmentClause.trim(),
      `remove all neck labels, brand tags, size tags, care labels, and sewn-in woven tags from both pieces;`,
      `Image A is the exposure and color authority for the scene's lighting only — match its background tone, facial exposure, and overall scene mood; the garments themselves take their color from Image B per COLOR AUTHORITY above;`,
      `produce an ultra-realistic 4K image in 2:3 format with accurate facial scaling, natural blending, and high-detail textures with no visible seams, distortion, or compositing artifacts.`,
      `Negative prompt: no color drift between top and bottom, no desaturation, no shift toward dusty / sage / mauve / earth tones, no fabric substitution (no velvet for knit, no smooth for textured), no missing rhinestones or sequins, no flattened gradient, no collapsed multi-band pattern, no pattern simplification, no missing trims, no relocated hardware, no mirrored print, no recolor, no texture blending, no exposure shift, no background change.`,
    ]
      .filter(Boolean)
      .join(" ");
  };

  // Variant 3 — STRICT / ANTI-FAILURE. Heavy negatives; the safety-net variant.
  const renderV3 = (
    t: string, tf: string, b: string, bf: string, cg: string, mi: string, ps: string, sc: string
  ): string => {
    const topClause = tf ? `top: ${tf};` : "";
    const bottomClause = bf ? `bottom: ${bf};` : "";
    return [
      `Take Image A and preserve everything exactly as it is — ${mi}, pose (${ps}), scene (${sc}), face, hair, posture, lighting, shadows, and camera angle;`,
      `extract the coordinated set from Image B (a ${t} and a matching ${b}) and integrate both pieces onto the model, fully replacing the model's existing outfit including the ${cg}, while ensuring consistent lighting, skin-tone interaction, perspective, and depth across the new garments;`,
      `CRITICAL DO-NOTS: (1) Do not invent a third garment, undershirt, or layered piece — Image B contains exactly two pieces (a top and a bottom). (2) Do not split either piece into multiple pieces, even if its hem is asymmetric. (3) Do not change either piece's color, pattern, hardware, trim, neckline, sleeve shape, hem geometry, or rise from Image B. (4) Do not change the model's face, body, pose, hair, or proportions. (5) Do not change the background, lighting, exposure, or camera perspective. (6) Do not invent text or logos.`,
      `${topClause} ${bottomClause}`,
      `the result must look like a single authentic fashion catalog photograph of this model in this pose, wearing the new coordinated set as TWO pieces (one top, one bottom) with correct silhouettes, drape, hems, sleeve length, and trim placement, not flat-lay reproductions and not split into more than two pieces;`,
      COLOR_AUTHORITY_CLAUSE,
      PATTERN_CONTINUITY_CLAUSE,
      EMBELLISHMENT_FIDELITY_CLAUSE,
      lengthAuthorityClause.trim(),
      adjustmentClause.trim(),
      `remove all neck labels, brand tags, size tags, care labels, and sewn-in woven tags from both pieces;`,
      `Image A controls the SCENE'S exposure and lighting only — preserve its background brightness, face lighting, and overall scene mood; the GARMENT colors and surface come exclusively from Image B per the authority clauses above;`,
      `deliver a 4K photorealistic image in 2:3 aspect ratio with realistic anatomical proportions, clean compositing, and detailed textures throughout, with no warping, scaling errors, or edit artifacts.`,
      `Negative prompt: no face alteration, no body reshape, no exposure shift, no background change, no garment-shape drift, no third garment invented, no extra layered piece, no split-into-three-pieces, no flattened high-low hem, no mirrored hardware, no relocated trim, no desaturated colors, no shift to dusty / sage / mauve / earth tones, no velvet substitution, no smoothed embellishments, no missing rhinestones, no collapsed gradient bands.`,
    ]
      .filter(Boolean)
      .join(" ");
  };

  const sanitizeFor = (
    render: (
      t: string, tf: string, b: string, bf: string, cg: string, mi: string, ps: string, sc: string
    ) => string
  ): string => {
    const used = descriptorsInTemplate(render("", "", "", "", "", "", "", ""));
    return render(
      sanitizeAnalyzerText(fields.top, used),
      sanitizeAnalyzerText(fields.topFeatures, used),
      sanitizeAnalyzerText(fields.bottom, used),
      sanitizeAnalyzerText(fields.bottomFeatures, used),
      sanitizeAnalyzerText(analyzedModel.currentGarment, used),
      sanitizeAnalyzerText(analyzedModel.modelIdentity, used),
      sanitizeAnalyzerText(analyzedModel.pose, used),
      sanitizeAnalyzerText(analyzedModel.scene, used)
    );
  };

  return [sanitizeFor(renderV1), sanitizeFor(renderV2), sanitizeFor(renderV3)];
}

/**
 * Two-piece coordinated set variant of buildModelSwapPrompt. Returns the first
 * Image-A / Image-B variant — kept as a single-prompt API for batch / QC /
 * photoshoot-set flows.
 */
export function buildModelSwapTwoPiecePrompt(
  fields: TwoPieceFields,
  analyzedModel: AnalyzedModelPhoto,
  adjustments?: GarmentAdjustments
): string {
  return buildModelSwapTwoPiecePromptVariants(fields, analyzedModel, adjustments)[0];
}

export type OverlayMode = "none" | "name" | "number" | "both";
export type OverlayPlacement =
  | "top-left"
  | "top-center"
  | "top-right"
  | "bottom-left"
  | "bottom-center"
  | "bottom-right";

export interface OverlayOptions {
  mode: OverlayMode;
  placement: OverlayPlacement;
  colorName?: string;
  styleNumber?: string;
  /** Font family name, e.g. "DM Sans". Defaults to "DM Sans". */
  fontFamily?: string;
  /** Font size in points. Defaults to 12. */
  fontSize?: number;
}

export interface GenerateParams {
  modelId: ModelId;
  prompt: string;
  imageUrls: string[];      // user-uploaded product photos (garment reference)
  /**
   * Optional. URL of the style-reference image — this becomes image_urls[0],
   * the canvas that Nano Banana edits. If omitted, the server auto-picks
   * public/product-shots/style-reference-2.png for pants and public/product-shots/style-reference.png
   * for everything else.
   */
  referenceImageUrl?: string | null;
  aspectRatio?: string;     // "auto" | "1:1" | etc.
  resolution?: string;      // "1K" | "2K" | "4K"
  format?: "png" | "jpeg";
  /**
   * Optional deterministic post-generation export size. This keeps model
   * generation high quality, then shrinks photo files without AI reprocessing.
   * `undefined` uses the app default for Nano Banana 4K 2:3 outputs.
   * `null` disables post-resizing.
   */
  outputSize?: { width: number; height: number } | null;
  numImages?: number;
  overlay?: OverlayOptions;
  /**
   * Image Studio normally auto-adds a styled reference canvas. Some workflows
   * (e.g. Library ecommerce-set expansion) need to edit from the supplied
   * approved image only, so they can opt out.
   */
  useDefaultReference?: boolean;
  /**
   * Playground mode: sandboxed, no injected defaults. Skips the default
   * style-reference image AND the garment-edit prompt prefix that Image
   * Studio applies via optimizePromptForModel. The user's prompt and image
   * URLs are passed through verbatim — nothing leaks in from other modules.
   */
  raw?: boolean;
}

const PLACEMENT_TO_ENGLISH: Record<OverlayPlacement, string> = {
  "top-left": "in the top-left corner, with generous padding from the edges",
  "top-center": "along the top edge, horizontally centered, with generous padding",
  "top-right": "in the top-right corner, with generous padding from the edges",
  "bottom-left": "in the bottom-left corner, with generous padding from the edges",
  "bottom-center": "along the bottom edge, horizontally centered, with generous padding",
  "bottom-right": "in the bottom-right corner, with generous padding from the edges",
};

/**
 * Build the text-overlay instruction appended to the prompt. Returns an empty
 * string when the user has chosen "none" or hasn't filled in any text.
 */
function buildOverlayInstruction(overlay?: OverlayOptions): string {
  if (!overlay || overlay.mode === "none") return "";
  const wantsName = overlay.mode === "name" || overlay.mode === "both";
  const wantsNumber = overlay.mode === "number" || overlay.mode === "both";
  const name = overlay.colorName?.trim();
  const num = overlay.styleNumber?.trim();
  const lines: string[] = [];
  if (wantsName && name) lines.push(name);
  if (wantsNumber && num) lines.push(num);
  if (lines.length === 0) return "";

  const placement = PLACEMENT_TO_ENGLISH[overlay.placement];
  const linesLiteral = lines.map((l) => `"${l}"`).join(" on the first line and ");
  const intro =
    lines.length === 2
      ? `Render two lines of catalog-label text ${placement}: ${linesLiteral}.`
      : `Render the catalog-label text ${linesLiteral} ${placement}.`;

  const fontFamily = overlay.fontFamily?.trim() || "DM Sans";
  const fontSize =
    typeof overlay.fontSize === "number" && overlay.fontSize > 0
      ? overlay.fontSize
      : 12;

  return ` OVERLAY TEXT: ${intro} Typography: use the "${fontFamily}" typeface at approximately ${fontSize}pt equivalent size, regular weight, solid black (#111111) color, no drop shadow, no outline, no decorative effects. The letterforms must match the "${fontFamily}" font style — clean, legible, and modern. The text must be perfectly crisp and readable, rendered as real typography on top of the background. Do not stylize, distort, or add extra words. Render ONLY the exact text given above.`;
}

export interface GenerationResult {
  images: { url: string; width?: number; height?: number; content_type?: string }[];
  requestId?: string;
  modelId: ModelId;
  cost?: number;
}

function defaultOutputSize(params: GenerateParams, _resolution: string) {
  // Only resize when the caller explicitly provides outputSize (Image Studio always does).
  // Model Studios do NOT pass outputSize and must never be force-resized here.
  return params.outputSize ?? null;
}

export async function resizeGeneratedImages(
  images: GenerationResult["images"],
  size: { width: number; height: number } | null
): Promise<GenerationResult["images"]> {
  if (!size) return images;

  return Promise.all(
    images.map(async (image, index) => {
      const source = await fetch(image.url);
      if (!source.ok) {
        throw new Error(`Could not fetch generated image for resizing (HTTP ${source.status})`);
      }
      const input = Buffer.from(await source.arrayBuffer());
      const output = await sharp(input)
        .resize(size.width, size.height, {
          fit: "cover",
          position: "center",
          withoutEnlargement: false,
        })
        .jpeg({
          quality: 92,
          mozjpeg: true,
        })
        .toBuffer();
      const blobPart = output.buffer.slice(
        output.byteOffset,
        output.byteOffset + output.byteLength
      ) as ArrayBuffer;
      const url = await uploadToFal(
        new Blob([blobPart], { type: "image/jpeg" }),
        `davidani-${size.width}x${size.height}-${index + 1}.jpg`
      );
      return {
        ...image,
        url,
        width: size.width,
        height: size.height,
        content_type: "image/jpeg",
      };
    })
  );
}

/** Upload a Blob/File to fal.ai storage and return its public URL. */
export async function uploadToFal(file: File | Blob, filename = "upload.png"): Promise<string> {
  ensureConfigured();
  const fileWithName = file instanceof File ? file : new File([file], filename);
  const maxAttempts = 4;
  let lastMessage = "Upload failed";

  const isTransientUploadError = (message: string) =>
    /fetch failed|network|timeout|timed out|econnreset|econnrefused|socket|temporar|5\d\d|rate limit|too many requests/i.test(
      message
    );

  try {
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const url = await fal.storage.upload(fileWithName);
        return url;
      } catch (err: any) {
        const detail =
          err?.body?.detail ||
          err?.body?.error ||
          err?.message ||
          "Upload failed";
        lastMessage = String(detail);

        if (!isTransientUploadError(lastMessage) || attempt === maxAttempts) {
          throw err;
        }

        const delayMs = 800 * attempt ** 2;
        console.warn(
          `[fal-upload] transient upload failure on attempt ${attempt}/${maxAttempts}; retrying in ${delayMs}ms:`,
          lastMessage
        );
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
    throw new Error(lastMessage);
  } catch (err: any) {
    const detail =
      err?.body?.detail ||
      err?.body?.error ||
      err?.message ||
      lastMessage;
    const message = String(detail);

    if (/exhausted balance|top up your balance|user is locked/i.test(message)) {
      throw new Error(
        "fal.ai upload failed because the account is locked for exhausted balance. Top up billing at fal.ai/dashboard/billing or replace FAL_KEY."
      );
    }

    if (/forbidden/i.test(message)) {
      throw new Error("fal.ai upload was forbidden. Check that FAL_KEY is valid and allowed to use storage uploads.");
    }

    if (isTransientUploadError(message)) {
      throw new Error(
        "fal.ai upload failed after several retries because the storage service or network connection was temporarily unavailable. Please try again in a moment."
      );
    }

    throw new Error(`fal.ai upload failed: ${message}`);
  }
}

/**
 * Upload a user-supplied reference in a format accepted by every image model.
 * Browsers can preview WebP/AVIF, but Kie's Nano Banana endpoint only accepts
 * JPEG/PNG references. Convert unsupported formats at the upload boundary.
 */
export async function uploadCompatibleImageToFal(file: File): Promise<{
  name: string;
  url: string;
}> {
  if (canPassThroughKieUpload(file)) {
    return { name: file.name, url: await uploadToFal(file, file.name || "upload.png") };
  }

  let jpeg: Buffer;
  try {
    jpeg = await sharp(Buffer.from(await file.arrayBuffer()))
      .rotate()
      .flatten({ background: "#ffffff" })
      .jpeg({ quality: 92, mozjpeg: true })
      .toBuffer();
  } catch {
    throw new Error(
      `"${file.name || "This file"}" could not be converted. Upload a PNG or JPEG image.`
    );
  }

  const baseName = (file.name || "upload").replace(/\.[^.]+$/, "") || "upload";
  const outputName = `${baseName}.jpg`;
  const blobPart = jpeg.buffer.slice(
    jpeg.byteOffset,
    jpeg.byteOffset + jpeg.byteLength
  ) as ArrayBuffer;
  const normalized = new File([blobPart], outputName, { type: "image/jpeg" });
  return { name: outputName, url: await uploadToFal(normalized, outputName) };
}

/**
 * Repair references uploaded before format normalization was introduced.
 * Supported URLs pass through without downloading; unsupported or extensionless
 * URLs are inspected and, when necessary, re-hosted as JPEG.
 */
async function normalizeImageUrlsForKie(imageUrls: string[]): Promise<string[]> {
  return Promise.all(
    imageUrls.map(async (url, index) => {
      if (hasKieSupportedImageExtension(url)) return url;
      if (!isTrustedKieNormalizationHost(url)) {
        throw new Error(
          `Reference image ${index + 1} must be a direct PNG or JPEG URL. For other formats, download the image and upload the file instead.`
        );
      }

      const source = await fetch(url);
      if (!source.ok) {
        throw new Error(
          `Could not read reference image ${index + 1} (HTTP ${source.status}).`
        );
      }

      const contentType = (source.headers.get("content-type") || "")
        .split(";")[0]
        .trim()
        .toLowerCase();
      if (KIE_SUPPORTED_IMAGE_MIME_TYPES.has(contentType)) return url;

      let jpeg: Buffer;
      try {
        jpeg = await sharp(Buffer.from(await source.arrayBuffer()))
          .rotate()
          .flatten({ background: "#ffffff" })
          .jpeg({ quality: 92, mozjpeg: true })
          .toBuffer();
      } catch {
        throw new Error(
          `Reference image ${index + 1} uses a format Nano Banana cannot read. Upload it again as PNG or JPEG.`
        );
      }

      const blobPart = jpeg.buffer.slice(
        jpeg.byteOffset,
        jpeg.byteOffset + jpeg.byteLength
      ) as ArrayBuffer;
      return uploadToFal(
        new Blob([blobPart], { type: "image/jpeg" }),
        `kie-reference-${index + 1}.jpg`
      );
    })
  );
}

/*
 * NOTE: No post-processing upscaler. Previously this file contained an
 * `upscaleImage()` helper that piped Nano Banana output through
 * `fal-ai/clarity-upscaler` (a latent-diffusion SDXL upscaler) to deliver
 * 2K/4K results. That upscaler introduced a visible "filter": crushed
 * blacks, crunchy fabric texture, shifted skin gamma, and a dated SD-era
 * aesthetic. It has been removed entirely.
 *
 * The app now avoids AI post-processing. For Nano Banana 4K 2:3 results, we
 * may perform a deterministic Sharp resize to a smaller PNG export
 * (2160x2700) to reduce file size. Nothing is re-diffused, re-sharpened,
 * recolored, or otherwise retouched by another model.
 */

export async function generate(params: GenerateParams): Promise<GenerationResult> {
  ensureConfigured();
  const model = MODELS[params.modelId];

  // Resolve the style-reference image (image 2). If the caller provided an
  // explicit URL, use it as-is. Otherwise auto-pick based on the inferred
  // garment category so pants default to product-shots/style-reference-2.png
  // and everything else defaults to product-shots/style-reference.png.
  const category = inferGarmentCategory(params.prompt);
  let referenceUrl: string | null = params.referenceImageUrl || null;
  if (!referenceUrl && params.useDefaultReference !== false && !params.raw) {
    try {
      referenceUrl = await getStyleReferenceUrl(category);
    } catch (err) {
      console.warn("[generate] failed to load default style reference:", err);
      referenceUrl = null;
    }
  }

  // Array order is the RELIABLE semantic signal to Nano Banana (Gemini edit):
  // the first image is the canvas it modifies, subsequent images are treated
  // as visual references. The prompt built by buildTwoImagePrompt describes
  // the task in content terms ("primary studio scene" / "attached reference
  // photograph") so it matches this ordering without relying on brittle
  // "image 1" / "image 2" numerical labels.
  //
  // Style reference → canvas; user's product photo → garment reference.
  // This reframes the task as a surgical "replace the garment on this studio
  // photo" edit (Nano Banana's training sweet spot) rather than a "composite
  // two images from scratch" task (which it handles poorly).
  const allImageUrls = referenceUrl
    ? [referenceUrl, ...params.imageUrls]
    : [...params.imageUrls];
  const generatorImageUrls = await prepareGeneratorImageUrls(allImageUrls);

  console.log(
    `[generate] category=${category} productImages=${params.imageUrls.length} ` +
      `referenceSource=${params.referenceImageUrl ? "user-override" : referenceUrl ? `default-${category}` : "none"} ` +
      `totalImages=${generatorImageUrls.length}`
  );

  // Build model-specific input payload. No STRICT_PRESERVATION_PREFIX — the
  // new two-image template (built by buildTwoImagePrompt) is self-sufficient
  // and Gemini-based edit models respond badly to stacked preservation-speak.
  const overlayInstruction = params.raw ? "" : buildOverlayInstruction(params.overlay);
  const modelOptimizedPrompt = params.raw
    ? params.prompt
    : optimizePromptForModel(params.modelId, params.prompt);
  const finalPrompt = modelOptimizedPrompt + overlayInstruction;
  let input: Record<string, unknown> = { prompt: finalPrompt };

  // Resolution multiplier: how much to scale base dimensions by.
  // Nano Banana: pass as enum; fal's edit endpoint accepts "1K" | "2K" | "4K".
  // Seedream: multiply image_size dims (capped at 4096 per fal docs).
  // GPT Image: map to "quality".
  const resolution = params.resolution || "1K";
  const resMultiplier = resolution === "4K" ? 2 : resolution === "2K" ? 1.5 : 1;
  const outputSize = defaultOutputSize(params, resolution);

  // kie.ai branch — short-circuit the fal.ai payload build and dispatcher.
  // Nano Banana 2 is served via kie.ai's async task API rather than fal's
  // synchronous `subscribe`. Return directly here to skip everything below.
  if (model.inputShape === "kie") {
    const { generateViaKie } = await import("./kie");
    const kieImageUrls = await normalizeImageUrlsForKie(generatorImageUrls);
    const kieResult = await generateViaKie({
      prompt: finalPrompt,
      imageUrls: kieImageUrls,
      numImages: params.numImages,
      aspectRatio: params.aspectRatio,
      format: params.format,
      resolution,
      model: model.endpoint, // e.g. "nano-banana-2"
    });
    const images = await resizeGeneratedImages(kieResult.images, outputSize);
    return {
      images,
      requestId: kieResult.taskIds[0],
      modelId: params.modelId,
    };
  }

  if (model.inputShape === "image_urls") {
    input.image_urls = generatorImageUrls;
    if (params.numImages) input.num_images = params.numImages;
    if (params.aspectRatio && params.aspectRatio !== "auto") input.aspect_ratio = params.aspectRatio;
    if (params.format) input.output_format = params.format;
    // NOTE: we used to set input.resolution = resolution here; the edit
    // endpoint silently ignores it and always outputs ~1024px. We now
    // deliver 2K/4K via a post-processing upscale pass (see below).
  } else if (model.inputShape === "image_urls_seedream") {
    input.image_urls = generatorImageUrls;
    if (params.numImages) input.num_images = params.numImages;
    const baseSizeMap: Record<string, { width: number; height: number }> = {
      "1:1": { width: 2048, height: 2048 },
      "2:3": { width: 1728, height: 2592 },
      "3:4": { width: 1728, height: 2304 },
      "4:5": { width: 1760, height: 2200 },
      "9:16": { width: 1440, height: 2560 },
      "16:9": { width: 2560, height: 1440 },
    };
    if (params.aspectRatio && params.aspectRatio !== "auto" && baseSizeMap[params.aspectRatio]) {
      const base = baseSizeMap[params.aspectRatio];
      input.image_size = {
        width: Math.min(4096, Math.round(base.width * resMultiplier)),
        height: Math.min(4096, Math.round(base.height * resMultiplier)),
      };
    }
  } else if (model.inputShape === "gpt") {
    input.image_urls = generatorImageUrls;
    if (params.numImages) input.num_images = params.numImages;
    input.openai_api_key = process.env.OPENAI_API_KEY ?? "";
    // GPT Image uses a "quality" enum rather than a pixel resolution.
    input.quality = resolution === "4K" ? "high" : resolution === "2K" ? "medium" : "low";
  }

  const result: any = await fal.subscribe(model.endpoint, {
    input,
    logs: false,
  });

  // Normalise output shape.
  const data = result?.data ?? result;
  const images = (data?.images ?? []).map((img: any) => ({
    url: img.url ?? img,
    width: img.width,
    height: img.height,
    content_type: img.content_type,
  }));

  const resizedImages = await resizeGeneratedImages(images, outputSize);

  return {
    images: resizedImages,
    requestId: result?.requestId,
    modelId: params.modelId,
  };
}
