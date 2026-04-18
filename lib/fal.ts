import { fal } from "@fal-ai/client";
import fs from "node:fs";
import path from "node:path";
import { MODELS, type ModelId } from "./models";

let configured = false;
function ensureConfigured() {
  if (configured) return;
  const key = process.env.FAL_KEY;
  if (!key) throw new Error("FAL_KEY environment variable is missing.");
  fal.config({ credentials: key });
  configured = true;
}

/**
 * Reads a style-reference image from public/ and uploads it to fal.ai once,
 * caching the resulting URL in memory per "kind". Returns null if no file exists.
 *
 * Routing:
 *   - kind === "pants" → matches public/style-reference-2.{png,jpg,jpeg,webp}
 *   - kind === "other" → matches public/style-reference.{png,jpg,jpeg,webp}
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

export async function getStyleReferenceUrl(
  kind: StyleReferenceKind = "other"
): Promise<string | null> {
  if (cachedStyleReferenceUrls[kind]) return cachedStyleReferenceUrls[kind]!;
  if (styleReferenceUploadsInFlight[kind]) return styleReferenceUploadsInFlight[kind]!;

  const upload = (async () => {
    const publicDir = path.join(process.cwd(), "public");
    if (!fs.existsSync(publicDir)) {
      console.warn("[style-reference] public/ directory not found");
      return null;
    }

    // Tolerant match: any file whose base name exactly equals the target stem
    // and whose final meaningful extension is an image type. Handles macOS's
    // "style-reference.png.png" quirk too.
    const targetStem = kind === "pants" ? "style-reference-2" : "style-reference";
    const entries = fs.readdirSync(publicDir);
    const imageExts = new Set(["png", "jpg", "jpeg", "webp"]);
    const found = entries.find((name) => {
      const lower = name.toLowerCase();
      const parts = lower.split(".");
      const last = parts[parts.length - 1];
      if (!imageExts.has(last)) return false;
      const stem = parts[0];
      return stem === targetStem;
    });

    if (!found) {
      console.warn(
        `[style-reference] no file matching ${targetStem}.* found in public/ (kind=${kind})`
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

/**
 * Analyzer system prompt. Output is parsed into GARMENT + FEATURES and folded
 * into a deterministic two-image prompt template. The template instructs the
 * image model to extract the garment from image 1 (user upload) and apply it
 * to the garment structure in image 2 (the style reference), preserving the
 * reference's lighting, camera, and composition.
 */
const ANALYSIS_SYSTEM_PROMPT = `You are a product catalog analyzer. You see a single garment photograph and must output exactly two lines, in this exact format, with no preamble, no markdown, and no extra lines:

GARMENT: <a short noun phrase describing the garment — include primary color, fabric/texture, and garment type. Examples: "soft fuzzy knit baby blue cardigan", "slim-fit dark indigo denim jeans", "cropped white ribbed cotton tank top", "oversized black cotton hoodie", "hot pink leopard print sweatpants">
FEATURES: <comma-separated noun phrases enumerating clearly visible structural details. Each element is one short noun phrase. Examples: "a crew neckline, ribbed collar, cuffs, and hem, five small round white buttons aligned vertically down the center placket, long sleeves" or "a drawstring waistband, two side pockets, tapered legs, a back patch pocket">

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

/**
 * Assemble the final "extract from image 1, apply to image 2" prompt from the
 * parsed GARMENT + FEATURES extracted from the user's product photo.
 */
export function buildTwoImagePrompt(garment: string, features: string): string {
  // Image 1 = style reference (clean studio flat-lay) — the SCENE template.
  // Image 2 = user's product photo — the GARMENT reference (color, pattern,
  // details) to swap in.
  //
  // The prompt deliberately separates what's inherited from image 1 (scene:
  // background, lighting, camera, framing) from what's freshly restyled (the
  // garment itself — symmetrical, smooth, catalog-ready). Without that split,
  // Nano Banana copies image 1's exact wrinkles and fold placement verbatim.
  const featureClause = features
    ? ` The restyled garment must have all the visible properties of the garment in image 2: ${features}.`
    : "";
  return (
    `Edit image 1 by replacing the garment shown in it with the ${garment} from image 2. ` +
    `Inherit ONLY the SCENE from image 1 — its clean solid studio background, soft diffused lighting, ` +
    `shadow character, camera angle, framing, and centered composition must remain identical. ` +
    `However, the garment itself is RE-STYLED FRESH for this shot: render the ${garment} perfectly ` +
    `symmetrical along the vertical centerline, neatly laid flat with smooth, freshly-steamed fabric, ` +
    `no wrinkles, no creases, no bunched or twisted sections, and in the canonical catalog pose for its ` +
    `garment type (tops: sleeves angled slightly downward and symmetric; pants: legs straight, parallel, ` +
    `and symmetric with the waistband centered at top; dresses and skirts: hem fanning gently and ` +
    `symmetrically). Do NOT copy the specific wrinkles, folds, creases, twists, asymmetries, or garment ` +
    `placement of the original garment in image 1; that was a different garment in a different take. ` +
    `Match the color, pattern, fabric texture, hardware, and every visible detail of the garment from ` +
    `image 2 exactly.${featureClause} The result should look like a brand-new, professionally styled ` +
    `catalog photograph taken in the same studio session as image 1 — same lighting, same camera, ` +
    `same background — but with a freshly arranged, crisp, symmetric garment. ` +
    `Hyper-realistic 4K e-commerce product photography, Zara-style catalog quality.`
  );
}

export async function analyzeGarmentToPrompt(
  imageUrl: string,
  _opts: AnalyzeOptions = {}
): Promise<string> {
  ensureConfigured();

  const result: any = await fal.subscribe("fal-ai/any-llm/vision", {
    input: {
      model: "anthropic/claude-3.7-sonnet",
      system_prompt: ANALYSIS_SYSTEM_PROMPT,
      prompt:
        "Analyze the garment in this photograph using the two-line GARMENT / FEATURES format defined in your system prompt. Output exactly those two lines, nothing else.",
      image_url: imageUrl,
    },
    logs: false,
  });

  const data = result?.data ?? result;
  console.log("[analyze] raw response keys:", Object.keys(data || {}));
  console.log("[analyze] usage:", data?.usage);

  const output: string = (data?.output ?? data?.response ?? data?.text ?? "").trim();
  if (!output) {
    console.error("[analyze] full response:", JSON.stringify(data).slice(0, 1000));
    throw new Error("Vision analysis returned no text output.");
  }

  // Parse GARMENT / FEATURES lines. The model occasionally adds prose around
  // them; we tolerate that and extract whatever matches.
  const garmentMatch = output.match(/GARMENT:\s*(.+?)\s*(?:\r?\n|$)/i);
  const featuresMatch = output.match(/FEATURES:\s*([\s\S]+?)\s*(?:\r?\n(?=[A-Z ]+:)|$)/i);
  const garment = (garmentMatch?.[1] || "").trim().replace(/\.$/, "");
  const features = (featuresMatch?.[1] || "").trim().replace(/\.$/, "");

  if (!garment) {
    console.error("[analyze] could not parse GARMENT from output:", output.slice(0, 400));
    throw new Error("Analyzer did not return a GARMENT line.");
  }

  console.log("[analyze] garment:", garment);
  console.log("[analyze] features:", features);

  const finalPrompt = buildTwoImagePrompt(garment, features);
  console.log("[analyze] final prompt preview:", finalPrompt.slice(0, 240));
  return finalPrompt;
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
  imageUrls: string[];      // user-uploaded product photos (image 1, N...)
  /**
   * Optional. URL of the style reference image (image 2 in the prompt).
   * If omitted, the server auto-picks public/style-reference-2.png for pants
   * and public/style-reference.png for everything else.
   */
  referenceImageUrl?: string | null;
  aspectRatio?: string;     // "auto" | "1:1" | etc.
  resolution?: string;      // "1K" | "2K" | "4K"
  format?: "png" | "jpeg";
  numImages?: number;
  overlay?: OverlayOptions;
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

/** Upload a Blob/File to fal.ai storage and return its public URL. */
export async function uploadToFal(file: File | Blob, filename = "upload.png"): Promise<string> {
  ensureConfigured();
  const fileWithName = file instanceof File ? file : new File([file], filename);
  const url = await fal.storage.upload(fileWithName);
  return url;
}

export async function generate(params: GenerateParams): Promise<GenerationResult> {
  ensureConfigured();
  const model = MODELS[params.modelId];

  // Resolve the style-reference image (image 2). If the caller provided an
  // explicit URL, use it as-is. Otherwise auto-pick based on the inferred
  // garment category so pants default to style-reference-2.png and everything
  // else defaults to style-reference.png.
  const category = inferGarmentCategory(params.prompt);
  let referenceUrl: string | null = params.referenceImageUrl || null;
  if (!referenceUrl) {
    try {
      referenceUrl = await getStyleReferenceUrl(category);
    } catch (err) {
      console.warn("[generate] failed to load default style reference:", err);
      referenceUrl = null;
    }
  }

  // Order matters — and we intentionally put the style reference FIRST.
  //
  // Nano Banana (Gemini edit) treats the first image as the canvas to modify
  // and heavily down-weights subsequent images. By putting the reference
  // first, we turn the task into a "replace the garment on this studio photo"
  // surgical edit (its training sweet spot) rather than a "composite two
  // images" task (which it handles poorly). The prompt built by
  // buildTwoImagePrompt matches this ordering: image 1 = reference canvas,
  // image 2 = user's product photo (swap source).
  const allImageUrls = referenceUrl
    ? [referenceUrl, ...params.imageUrls]
    : [...params.imageUrls];

  console.log(
    `[generate] category=${category} productImages=${params.imageUrls.length} ` +
      `referenceSource=${params.referenceImageUrl ? "user-override" : referenceUrl ? `default-${category}` : "none"} ` +
      `totalImages=${allImageUrls.length}`
  );

  // Build model-specific input payload. No STRICT_PRESERVATION_PREFIX — the
  // new two-image template (built by buildTwoImagePrompt) is self-sufficient
  // and Gemini-based edit models respond badly to stacked preservation-speak.
  const overlayInstruction = buildOverlayInstruction(params.overlay);
  const finalPrompt = params.prompt + overlayInstruction;
  let input: Record<string, unknown> = { prompt: finalPrompt };

  // Resolution multiplier: how much to scale base dimensions by.
  // Nano Banana: pass as enum; fal's edit endpoint accepts "1K" | "2K" | "4K".
  // Seedream: multiply image_size dims (capped at 4096 per fal docs).
  // GPT Image: map to "quality".
  const resolution = params.resolution || "1K";
  const resMultiplier = resolution === "4K" ? 2 : resolution === "2K" ? 1.5 : 1;

  if (model.inputShape === "image_urls") {
    input.image_urls = allImageUrls;
    if (params.numImages) input.num_images = params.numImages;
    if (params.aspectRatio && params.aspectRatio !== "auto") input.aspect_ratio = params.aspectRatio;
    if (params.format) input.output_format = params.format;
    // Nano Banana edit: pass resolution enum directly. If fal doesn't recognise
    // the key it's harmlessly ignored, and we also repeat the intent in the
    // prompt text ("Ultra-high-resolution 4K…") so the model biases that way.
    input.resolution = resolution;
  } else if (model.inputShape === "image_urls_seedream") {
    input.image_urls = allImageUrls;
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
    input.image_urls = allImageUrls;
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

  return {
    images,
    requestId: result?.requestId,
    modelId: params.modelId,
  };
}
