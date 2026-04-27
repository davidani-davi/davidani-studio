import { fal } from "@fal-ai/client";
import fs from "node:fs";
import path from "node:path";
import { MODELS, type ModelId } from "./models";
import { optimizePromptForModel } from "./prompt-strategy";

let configured = false;
function ensureConfigured() {
  if (configured) return;
  const key = process.env.FAL_KEY;
  if (!key) throw new Error("FAL_KEY environment variable is missing.");
  fal.config({ credentials: key });
  configured = true;
}

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
    /bad gateway|gateway|502|upstream|overloaded|temporarily unavailable|service unavailable/.test(
      message
    )
  );
}

async function subscribeVisionWithRetry(
  input: Record<string, unknown>,
  label: string
): Promise<any> {
  ensureConfigured();

  let lastErr: unknown;
  const delays = [0, 700, 1600];

  for (let attempt = 0; attempt < delays.length; attempt++) {
    if (delays[attempt] > 0) {
      await sleep(delays[attempt]);
    }
    try {
      return await fal.subscribe("fal-ai/any-llm/vision", {
        input,
        logs: false,
      });
    } catch (err) {
      lastErr = err;
      if (!isRetryableVisionError(err) || attempt === delays.length - 1) {
        break;
      }
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
      `studio background, soft diffused lighting, shadow character, camera angle, framing, and ` +
      `centered composition. Do NOT inherit garment-shape cues (silhouette, cut, fit, leg width, ` +
      `torso fit, length) from the primary studio photograph — those come exclusively from the ` +
      `reference photograph. ` +
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
  const result: any = await subscribeVisionWithRetry(
    {
      model: "anthropic/claude-3.7-sonnet",
      system_prompt: ANALYSIS_SYSTEM_PROMPT,
      prompt:
        "Analyze the garment in this photograph using the two-line GARMENT / FEATURES format defined in your system prompt. Output exactly those two lines, nothing else.",
      image_url: imageUrl,
    },
    "garment analysis"
  );

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
      model: "anthropic/claude-3.7-sonnet",
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

export interface ProductDesignConcept {
  assortmentRole?: string;
  productName: string;
  customerMood: string;
  productDescription: string;
  keyFeatures: string[];
  customerReasonToBuy?: string;
  bestsellerDNA?: string[];
  commercialScores?: {
    commerciality: number;
    novelty: number;
    brandFit: number;
    productionEase: number;
    risk: number;
  };
  designDifferenceFromSource: string;
  imageGenerationPrompt: string;
  visualUrl?: string;
  visualError?: string;
}

export interface ProductDesignResult {
  detectedCategory: string;
  customerWorld: string;
  bestsellerDNA?: string[];
  assortmentStrategy?: string;
  trendSignals?: string[];
  researchSources?: { title: string; url: string }[];
  concepts: ProductDesignConcept[];
  qualityChecklist: string[];
}

const PRODUCT_DESIGN_SYSTEM_PROMPT = `You are a fashion product design assistant for a bohemian boutique brand. A user will upload a product image. Your job is to identify the garment category, then create three new sellable product concepts in the same category. Do not copy the uploaded product's exact design, color palette, motif, pattern, styling, or construction. Do not create simple colorways. Each concept must have a different customer appeal, design story, fit, feature set, and visual identity. The products should feel commercially viable for a boutique fashion website and should make customers feel they need each piece for a different reason. Preserve the category: pants remain pants, jackets remain jackets, cardigans remain cardigans, tops remain tops, dresses remain dresses. Vary fit and construction within the category. Avoid repeated formulas, repeated left/middle/right roles, repeated color ordering, and overused motifs such as stars, sun, moon, daisies, and Aztec/southwestern patterns unless explicitly requested. Focus on garment design features, not graphic callouts. Generate clear, distinct, marketable product ideas.

Default style world: easy, expressive, bohemian, boutique, layerable, comfortable, curated, soft but distinctive, relaxed but not boring. Avoid costume-like and overly basic ideas.

Avoid weak repeated defaults: stars, sun motifs, moon motifs, celestial names, daisies, generic florals, Aztec/southwestern motifs, cream striped tops, big square front patches, obvious rectangle patchwork, identical oversized slouchy silhouettes, beige/cream/brown/blue-only palettes, and simple/patchwork/statement role formulas.

Use broader themes when appropriate: coastal workwear, vintage varsity, painterly abstract, cottage utility, soft romantic layering, market-day artisan, road-trip utility, washed nautical, retro 70s color blocking, mineral-wash lounge, heirloom lace, modern prairie, worn-in workwear, scarf-print inspired, folk minimalism, textural monochrome, patchwork without obvious rectangles, hand-drawn animal motifs, quilted comfort, utility romance, boutique athleisure, soft grunge boho, country club boho, painter studio casual.`;

function extractJsonObject(raw: string): string {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  if (fenced) return fenced.trim();
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start >= 0 && end > start) return raw.slice(start, end + 1);
  return raw.trim();
}

function normalizeConcept(value: any): ProductDesignConcept | null {
  if (!value || typeof value !== "object") return null;
  const keyFeatures = Array.isArray(value.keyFeatures)
    ? value.keyFeatures.map((item: unknown) => String(item || "").trim()).filter(Boolean)
    : [];
  const bestsellerDNA = Array.isArray(value.bestsellerDNA)
    ? value.bestsellerDNA.map((item: unknown) => String(item || "").trim()).filter(Boolean)
    : [];
  const scores = value.commercialScores || {};
  const concept: ProductDesignConcept = {
    assortmentRole: String(value.assortmentRole || "").trim(),
    productName: String(value.productName || "").trim(),
    customerMood: String(value.customerMood || "").trim(),
    productDescription: String(value.productDescription || "").trim(),
    keyFeatures: keyFeatures.slice(0, 6),
    customerReasonToBuy: String(value.customerReasonToBuy || "").trim(),
    bestsellerDNA: bestsellerDNA.slice(0, 4),
    commercialScores: {
      commerciality: Number(scores.commerciality || 0),
      novelty: Number(scores.novelty || 0),
      brandFit: Number(scores.brandFit || 0),
      productionEase: Number(scores.productionEase || 0),
      risk: Number(scores.risk || 0),
    },
    designDifferenceFromSource: String(value.designDifferenceFromSource || "").trim(),
    imageGenerationPrompt: String(value.imageGenerationPrompt || "").trim(),
  };
  if (
    !concept.productName ||
    !concept.customerMood ||
    !concept.productDescription ||
    concept.keyFeatures.length < 4 ||
    !concept.designDifferenceFromSource ||
    !concept.imageGenerationPrompt
  ) {
    return null;
  }
  return concept;
}

function parseProductDesignResult(raw: string): ProductDesignResult | null {
  try {
    const parsed = JSON.parse(extractJsonObject(raw));
    const concepts = Array.isArray(parsed.concepts)
      ? parsed.concepts.map(normalizeConcept).filter(Boolean).slice(0, 3)
      : [];
    if (concepts.length !== 3) return null;
    return {
      detectedCategory: String(parsed.detectedCategory || "").trim() || "Detected garment",
      customerWorld:
        String(parsed.customerWorld || "").trim() || "Bohemian boutique customer",
      bestsellerDNA: Array.isArray(parsed.bestsellerDNA)
        ? parsed.bestsellerDNA
            .map((item: unknown) => String(item || "").trim())
            .filter(Boolean)
            .slice(0, 8)
        : [],
      assortmentStrategy: String(parsed.assortmentStrategy || "").trim(),
      concepts: concepts as ProductDesignConcept[],
      qualityChecklist: Array.isArray(parsed.qualityChecklist)
        ? parsed.qualityChecklist
            .map((item: unknown) => String(item || "").trim())
            .filter(Boolean)
            .slice(0, 10)
        : [],
    };
  } catch {
    return null;
  }
}

function productDesignUserPrompt(refinement?: string): string {
  return `Analyze the uploaded product image only to identify product category, general garment type, customer/style world, and commercial context.

Extract the likely bestseller DNA from the uploaded product first: what makes the category commercially useful, wearable, emotionally appealing, easy to buy, and worth improving. Then generate exactly 3 new product design concepts in the same product category.

Build the 3 concepts as a balanced mini assortment:
- one Safe Bestseller: most wearable, highest commercial probability, easy buy
- one Trend Driver: newest silhouette/detail/color/fabric direction, still wearable
- one Novelty Statement: strongest visual hook/social merchandising idea, higher risk but exciting

Do not recreate the uploaded product. Do not include a version that looks like the original. Use the image only to identify the product category and general customer world. Create three new, sellable products in the same category with different silhouettes, construction, fabrics, trims, details, and stories.

Category preservation examples:
- If the image is pants, generate pants only.
- If the image is a cardigan, generate cardigans only.
- If the image is a jacket, generate jackets only.
- If the image is a hoodie dress, generate hoodie dresses or tunic dresses only.
- Do not turn pants into skirts, jackets into coats, cardigans into tops, or dresses into separates.

Each concept must answer why a customer would need it. Each concept must have a different customer appeal, styling story, construction or feature set, and product identity.

Vary fit, silhouette, construction, fabric combination, trims, pockets, closures, sleeve shape, neckline, hemline, print placement, embroidery, texture, color story, customer appeal, and product story where relevant to the detected category.

Before returning the final result, internally check:
- all 3 products preserve the source category
- no product is too close to the source
- the 3 concepts are meaningfully different from each other
- features are built into the garment
- color stories and silhouettes are varied
- motifs are fresh and not repeated
- each product has a different reason to buy
- the result does not look like 3 colorways
- the set feels sellable for a boutique fashion website

${refinement ? `User refinement request: ${refinement}` : "No extra user refinement request."}

Return strict JSON only:
{
  "detectedCategory": "short category phrase",
  "customerWorld": "short style/customer context",
  "bestsellerDNA": ["5-8 concise bullets describing the commercial DNA extracted from the upload and live research"],
  "assortmentStrategy": "one short sentence explaining why the 3 concepts work together as a balanced mini line",
  "concepts": [
    {
      "assortmentRole": "Safe Bestseller | Trend Driver | Novelty Statement",
      "productName": "short boutique-style name",
      "customerMood": "short phrase",
      "productDescription": "concise selling description",
      "keyFeatures": ["4-6 specific garment features"],
      "customerReasonToBuy": "one short reason this customer would need it",
      "bestsellerDNA": ["2-4 specific bestseller/commercial signals used in this concept"],
      "commercialScores": {
        "commerciality": 1-10,
        "novelty": 1-10,
        "brandFit": 1-10,
        "productionEase": 1-10,
        "risk": 1-10
      },
      "designDifferenceFromSource": "short explanation of how it avoids copying",
      "imageGenerationPrompt": "ready-to-use visual prompt for one single product visual of this exact concept, same product category as the uploaded source, clear garment view, commercial boutique product-photo style, simple beige or neutral background, Three Bird Nest bohemian boutique direction, and no copying of source design/color/motif/layout"
    }
  ],
  "qualityChecklist": ["brief passed-check notes"]
}`;
}

export async function generateProductDesignConcepts(
  imageUrl: string,
  refinement?: string,
  trendResearch?: string
): Promise<ProductDesignResult> {
  const result: any = await subscribeVisionWithRetry(
    {
      model: "anthropic/claude-3.7-sonnet",
      system_prompt: PRODUCT_DESIGN_SYSTEM_PROMPT,
      prompt:
        productDesignUserPrompt(refinement) +
        (trendResearch
          ? `\n\nLIVE TREND AND BESTSELLER RESEARCH TO USE AS COMMERCIAL INPUT:\n${trendResearch}\n\nUse these signals as inspiration only. Do not copy named products, exact brand designs, or protected graphics.`
          : ""),
      image_url: imageUrl,
    },
    "product design concept generation"
  );

  const data = result?.data ?? result;
  const output: string = (data?.output ?? data?.response ?? data?.text ?? "").trim();
  if (!output) {
    console.error("[design-studio] full response:", JSON.stringify(data).slice(0, 1000));
    throw new Error("Product design generator returned no text output.");
  }

  const parsed = parseProductDesignResult(output);
  if (!parsed) {
    console.error("[design-studio] raw output:", output.slice(0, 2000));
    throw new Error("Product design generator did not return 3 complete concepts.");
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
      model: "anthropic/claude-3.7-sonnet",
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
      `studio background, soft diffused lighting, shadow character, camera angle, framing, and ` +
      `centered composition. Do NOT inherit garment-shape cues (silhouette, cut, fit, length) from ` +
      `the primary studio photograph. ` +
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

type SwapScope = "upper-body" | "lower-body" | "full-look";

function inferSwapScope(garment: string): SwapScope {
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
    clauses.push("Render the garment slightly longer on the body than the raw reference impression, with hems, sleeves, or leg length landing a bit lower while still looking natural and proportional.");
  }

  if (clauses.length === 0) {
    return " Match the garment's fit and length on-body as closely as possible to the uploaded reference impression, without drifting smaller, larger, shorter, or longer.";
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
      model: "anthropic/claude-3.7-sonnet",
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

  const grab = (label: string): string => {
    const re = new RegExp(`${label}:\\s*([\\s\\S]+?)\\s*(?:\\r?\\n(?=[A-Z_ ]+:)|$)`, "i");
    const m = output.match(re);
    return (m?.[1] || "").trim().replace(/\.$/, "");
  };

  const currentGarment = grab("CURRENT_GARMENT");
  const modelIdentity = grab("MODEL_IDENTITY");
  const pose = grab("POSE");
  const scene = grab("SCENE");

  if (!currentGarment || !modelIdentity || !pose || !scene) {
    console.error("[analyze-model] parse failed, raw output:", output.slice(0, 500));
    throw new Error("Model photo analyzer returned an unparseable response.");
  }

  console.log("[analyze-model] current:", currentGarment);
  console.log("[analyze-model] identity:", modelIdentity);
  console.log("[analyze-model] pose:", pose);
  console.log("[analyze-model] scene:", scene);

  return { currentGarment, modelIdentity, pose, scene };
}

/**
 * Build the model-swap prompt. The primary photograph (image_urls[0]) is the
 * model pose we're editing; the attached reference (image_urls[1]) is the
 * user's garment photo. Content-descriptive language only — no "image 1/2".
 *
 * @param newGarment  noun phrase for the replacement garment (from analyzing the user's upload)
 * @param newGarmentFeatures  comma-separated visible details of the replacement garment
 * @param analyzedModel  the four preservation fields from analyzeModelPhoto()
 */
export function buildModelSwapPrompt(
  newGarment: string,
  newGarmentFeatures: string,
  analyzedModel: AnalyzedModelPhoto,
  adjustments?: GarmentAdjustments
): string {
  const swapScope = inferSwapScope(newGarment);
  // Inner renderer — introspect the template text once, then render again
  // with sanitized analyzer output.
  const render = (
    ng: string,
    nf: string,
    cg: string,
    mi: string,
    ps: string,
    sc: string
  ): string => {
    // Feature clause, attached as a standalone sentence so the preservation
    // list stays flat and comma-separated (winning-prompt pattern).
    const featureClause = nf
      ? ` Keep all garment details from the reference photograph identical, including: ${nf}.`
      : "";
    const adjustmentClause = buildGarmentAdjustmentClause(adjustments);
    const scopeClause =
      swapScope === "upper-body"
        ? ` Replace only the upper-body garment area with the new ${ng}. Preserve any visible skirt, pants, shorts, or other lower-body garment from the primary studio photograph exactly as-is — same color, shape, hem, waistband, drape, and coverage. Do not remove, crop out, fade out, or simplify the lower-body garment.`
        : swapScope === "lower-body"
        ? ` Replace only the lower-body garment area with the new ${ng}. Preserve any visible top, jacket, sweater, blouse, shirt, or other upper-body garment from the primary studio photograph exactly as-is — same color, neckline, sleeve shape, hem, drape, and coverage. Do not remove, crop out, fade out, or simplify the upper-body garment. Pants shape is critical: preserve or obey the specified leg silhouette exactly, including barrel curvature, wide-leg width, straight-leg vertical line, flare opening, taper, cuff, hem length, waistband rise, pocket placement, and fabric break.`
        : ` Replace the full visible outfit with the new ${ng}, since it is a full-look garment.`;
    return (
      // Opening — "extract X and apply onto Y" was the shared framing in the
      // two winning prompts from David's six-prompt Model Studio test (#2 and
      // #4). The losing prompts used "swap", "transfer", or "replace X in
      // image 2 with Y", which read as weaker instructions to Nano Banana.
      `Fashion catalog garment-swap edit on a human model. Extract the ${ng} from the attached ` +
      `reference photograph and apply it onto the model in the primary studio photograph, ` +
      `replacing only the garment area that conflicts with the new ${ng} while preserving the rest of the outfit unless explicitly instructed otherwise. Remove from the current look only the portion of ${cg} that must be replaced by the new ${ng}. ` +
      // Preservation — flat comma-separated list. The winning prompts enumerated
      // every preserved attribute (face / proportions / pose / hair / expression
      // / lighting / shadows / camera angle / background / non-swapped garment)
      // in one sentence rather than semicolon-grouping them.
      `Preserve the model's exact face, facial features, expression, and physical attributes — ` +
      `${mi} — along with the exact pose (${ps}), camera perspective, lighting direction, ` +
      `shadows, and the rest of the scene (${sc}) unchanged.` +
      `${scopeClause}` +
      ` The primary studio photograph is the exposure and lighting authority: match the exact ` +
      `background color, background brightness, backdrop tonal value, facial exposure, facial ` +
      `brightness, and face lighting pattern from the primary studio photograph exactly. Do not ` +
      `darken, mute, gray down, warm up, cool down, or otherwise shift the backdrop or the model's ` +
      `face relative to the primary studio photograph. Keep the face at the same exposure level and ` +
      `keep the background at the same perceived brightness and color tone as the reference pose image.` +
      `${featureClause} ` +
      // Realistic-garment-behavior clause — both winners closed with a sentence
      // describing natural draping / structure / contour, and both explicitly
      // said "do not copy the flat-lay shape".
      `Ensure realistic garment behavior on the body: natural drape, fit, volume, and contour ` +
      `that respond to the model's pose and the scene's lighting. Do not copy the static flat-lay ` +
      `shape of the garment from the reference — re-render it as a worn garment on this specific ` +
      `model in this specific pose, while preserving every visible design detail (color, pattern, ` +
      `neckline, hem, sleeve length, hardware, trim) exactly.` +
      `${adjustmentClause} ` +
      // Neck-label removal (baked in as default per earlier request).
      `REMOVE ALL NECK LABELS, BRAND TAGS, SIZE TAGS, CARE LABELS, AND SEWN-IN WOVEN TAGS from the ` +
      `rendered garment — the inside of the neckline, collar band, and any other typical label ` +
      `location must be clean and empty with no tag, label, patch, or printed text of any kind ` +
      `showing. ` +
      // Closing statement + explicit negative-prompt epilogue (shared by every
      // test prompt; keeping it for parity).
      `The result must look like a single authentic fashion catalog photograph of this model, ` +
      `taken in this exact pose and scene, wearing the new ${ng}. Hyper-realistic 4K ` +
      `e-commerce fashion photography, editorial catalog quality. ` +
      `Negative prompt: no face alteration, no body reshaping, no recolor, no texture blending, ` +
      `no distortion, no pants-shape drift, no straightening barrel pants, no widening skinny pants, no flattening flare hems, no background change, no darker face, no dimmer background, no exposure shift.`
    );
  };

  // Descriptor-discipline pass: scan the template once, then sanitize every
  // dynamic slot in priority order. newGarment + newGarmentFeatures describe
  // the replacement garment (most load-bearing); the four analyzedModel fields
  // describe static elements of the source photograph.
  const used = descriptorsInTemplate(render("", "", "", "", "", ""));
  const cleanNewGarment = sanitizeAnalyzerText(newGarment, used);
  const cleanNewFeatures = sanitizeAnalyzerText(newGarmentFeatures, used);
  const cleanCurrent = sanitizeAnalyzerText(analyzedModel.currentGarment, used);
  const cleanIdentity = sanitizeAnalyzerText(analyzedModel.modelIdentity, used);
  const cleanPose = sanitizeAnalyzerText(analyzedModel.pose, used);
  const cleanScene = sanitizeAnalyzerText(analyzedModel.scene, used);
  return render(
    cleanNewGarment,
    cleanNewFeatures,
    cleanCurrent,
    cleanIdentity,
    cleanPose,
    cleanScene
  );
}

/**
 * Two-piece variant of buildModelSwapPrompt: instead of a single replacement
 * garment, the replacement is a coordinated top + bottom set (e.g. a matching
 * crop-top + mini-skirt outfit). The model's entire outfit is replaced, not
 * just one piece, so we explicitly scope the removal to all visible current
 * clothing rather than only the analyzer's currentGarment noun phrase.
 */
export function buildModelSwapTwoPiecePrompt(
  fields: TwoPieceFields,
  analyzedModel: AnalyzedModelPhoto,
  adjustments?: GarmentAdjustments
): string {
  const render = (
    t: string,
    tf: string,
    b: string,
    bf: string,
    cg: string,
    mi: string,
    ps: string,
    sc: string
  ): string => {
    const topClause = tf
      ? ` Keep all top details from the reference photograph identical, including: ${tf}.`
      : "";
    const bottomClause = bf
      ? ` Keep all bottom details from the reference photograph identical, including: ${bf}.`
      : "";
    const adjustmentClause = buildGarmentAdjustmentClause(adjustments);
    return (
      // Same "extract and apply" framing as the single-garment winning pattern,
      // adapted for a coordinated set (both pieces extracted together).
      `Fashion catalog outfit-swap edit on a human model. Extract the coordinated two-piece set ` +
      `from the attached reference photograph — a ${t} worn together with a matching ${b} — and ` +
      `apply it onto the model in the primary studio photograph, completely removing the model's ` +
      `entire currently-worn outfit (including the ${cg} and every other visible clothing item). ` +
      // Flat comma-separated preservation list.
      `Preserve the model's exact face, facial features, expression, and physical attributes — ` +
      `${mi} — along with the exact pose (${ps}), camera perspective, lighting direction, ` +
      `shadows, and the rest of the scene (${sc}) unchanged.` +
      ` The primary studio photograph is the exposure and lighting authority: match the exact ` +
      `background color, background brightness, backdrop tonal value, facial exposure, facial ` +
      `brightness, and face lighting pattern from the primary studio photograph exactly. Do not ` +
      `darken, mute, gray down, warm up, cool down, or otherwise shift the backdrop or the model's ` +
      `face relative to the primary studio photograph. Keep the face at the same exposure level and ` +
      `keep the background at the same perceived brightness and color tone as the reference pose image.` +
      `${topClause}${bottomClause} ` +
      // Coordination statement — two pieces must read as one designed set.
      `Render both pieces as a single unified coordinated outfit — they share the same color ` +
      `family, fabric family, and trim language; they must look like two pieces of the same ` +
      `designed set, not two unrelated garments. ` +
      // Realistic-garment-behavior clause.
      `Ensure realistic garment behavior on the body: each piece drapes, fits, and contours ` +
      `naturally to the model's pose and the scene's lighting. The top and bottom sit together ` +
      `as a worn outfit — the top's hem layering correctly over or tucked into the bottom's ` +
      `waistband in whatever arrangement is natural for this pairing. Do not copy the static ` +
      `flat-lay shape of either piece from the reference — re-render them as worn garments on ` +
      `this specific model in this specific pose, while preserving every visible design detail ` +
      `(color, pattern, neckline, hem, sleeve length, hardware, trim) exactly.` +
      `${adjustmentClause} ` +
      // Neck-label removal (baked in as default).
      `REMOVE ALL NECK LABELS, BRAND TAGS, SIZE TAGS, CARE LABELS, AND SEWN-IN WOVEN TAGS from ` +
      `both the top and the bottom — the inside of the neckline, collar band, waistband, and any ` +
      `other typical label location must be clean and empty with no tag, label, patch, or printed ` +
      `text of any kind showing. ` +
      // Closing + explicit negative-prompt epilogue.
      `The result must look like a single authentic fashion catalog photograph of this model, ` +
      `taken in this exact pose and scene, wearing the new coordinated set. Hyper-realistic 4K ` +
      `e-commerce fashion photography, editorial catalog quality. ` +
      `Negative prompt: no face alteration, no body reshaping, no recolor, no texture blending, ` +
      `no distortion, no background change, no darker face, no dimmer background, no exposure shift.`
    );
  };

  const used = descriptorsInTemplate(render("", "", "", "", "", "", "", ""));
  const cleanTop = sanitizeAnalyzerText(fields.top, used);
  const cleanTopFeatures = sanitizeAnalyzerText(fields.topFeatures, used);
  const cleanBottom = sanitizeAnalyzerText(fields.bottom, used);
  const cleanBottomFeatures = sanitizeAnalyzerText(fields.bottomFeatures, used);
  const cleanCurrent = sanitizeAnalyzerText(analyzedModel.currentGarment, used);
  const cleanIdentity = sanitizeAnalyzerText(analyzedModel.modelIdentity, used);
  const cleanPose = sanitizeAnalyzerText(analyzedModel.pose, used);
  const cleanScene = sanitizeAnalyzerText(analyzedModel.scene, used);
  return render(
    cleanTop,
    cleanTopFeatures,
    cleanBottom,
    cleanBottomFeatures,
    cleanCurrent,
    cleanIdentity,
    cleanPose,
    cleanScene
  );
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
   * public/style-reference-2.png for pants and public/style-reference.png
   * for everything else.
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
  try {
    const url = await fal.storage.upload(fileWithName);
    return url;
  } catch (err: any) {
    const detail =
      err?.body?.detail ||
      err?.body?.error ||
      err?.message ||
      "Upload failed";
    const message = String(detail);

    if (/exhausted balance|top up your balance|user is locked/i.test(message)) {
      throw new Error(
        "fal.ai upload failed because the account is locked for exhausted balance. Top up billing at fal.ai/dashboard/billing or replace FAL_KEY."
      );
    }

    if (/forbidden/i.test(message)) {
      throw new Error("fal.ai upload was forbidden. Check that FAL_KEY is valid and allowed to use storage uploads.");
    }

    throw new Error(`fal.ai upload failed: ${message}`);
  }
}

/*
 * NOTE: No post-processing upscaler. Previously this file contained an
 * `upscaleImage()` helper that piped Nano Banana output through
 * `fal-ai/clarity-upscaler` (a latent-diffusion SDXL upscaler) to deliver
 * 2K/4K results. That upscaler introduced a visible "filter": crushed
 * blacks, crunchy fabric texture, shifted skin gamma, and a dated SD-era
 * aesthetic. It has been removed entirely.
 *
 * The app now returns whatever Nano Banana (or Seedream / GPT Image)
 * produces natively — nothing is re-diffused, re-sharpened, recolored,
 * or otherwise retouched post-generation. If we ever re-introduce
 * upscaling, use a deterministic non-diffusion upscaler (e.g. aura-sr,
 * Real-ESRGAN) and wire it behind an explicit opt-in.
 */

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

  console.log(
    `[generate] category=${category} productImages=${params.imageUrls.length} ` +
      `referenceSource=${params.referenceImageUrl ? "user-override" : referenceUrl ? `default-${category}` : "none"} ` +
      `totalImages=${allImageUrls.length}`
  );

  // Build model-specific input payload. No STRICT_PRESERVATION_PREFIX — the
  // new two-image template (built by buildTwoImagePrompt) is self-sufficient
  // and Gemini-based edit models respond badly to stacked preservation-speak.
  const overlayInstruction = buildOverlayInstruction(params.overlay);
  const modelOptimizedPrompt = optimizePromptForModel(params.modelId, params.prompt);
  const finalPrompt = modelOptimizedPrompt + overlayInstruction;
  let input: Record<string, unknown> = { prompt: finalPrompt };

  // Resolution multiplier: how much to scale base dimensions by.
  // Nano Banana: pass as enum; fal's edit endpoint accepts "1K" | "2K" | "4K".
  // Seedream: multiply image_size dims (capped at 4096 per fal docs).
  // GPT Image: map to "quality".
  const resolution = params.resolution || "1K";
  const resMultiplier = resolution === "4K" ? 2 : resolution === "2K" ? 1.5 : 1;

  // kie.ai branch — short-circuit the fal.ai payload build and dispatcher.
  // Nano Banana 2 is served via kie.ai's async task API rather than fal's
  // synchronous `subscribe`. Return directly here to skip everything below.
  if (model.inputShape === "kie") {
    const { generateViaKie } = await import("./kie");
    const kieResult = await generateViaKie({
      prompt: finalPrompt,
      imageUrls: allImageUrls,
      numImages: params.numImages,
      aspectRatio: params.aspectRatio,
      format: params.format,
      model: model.endpoint, // e.g. "nano-banana-2"
    });
    return {
      images: kieResult.images,
      requestId: kieResult.taskIds[0],
      modelId: params.modelId,
    };
  }

  if (model.inputShape === "image_urls") {
    input.image_urls = allImageUrls;
    if (params.numImages) input.num_images = params.numImages;
    if (params.aspectRatio && params.aspectRatio !== "auto") input.aspect_ratio = params.aspectRatio;
    if (params.format) input.output_format = params.format;
    // NOTE: we used to set input.resolution = resolution here; the edit
    // endpoint silently ignores it and always outputs ~1024px. We now
    // deliver 2K/4K via a post-processing upscale pass (see below).
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

  // No post-processing. Native model output is returned as-is — see the
  // long comment above the deleted upscaleImage() helper for background.

  return {
    images,
    requestId: result?.requestId,
    modelId: params.modelId,
  };
}
