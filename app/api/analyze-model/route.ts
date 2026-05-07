import { NextResponse } from "next/server";
import {
  analyzeModelPhoto,
  analyzeGarmentToPrompt,
  buildModelStudioBetaPromptVariants,
  buildModelSwapPromptVariants,
  buildModelSwapTwoPiecePromptVariants,
  extractTwoPieceFields,
  inferSwapScope,
  MODEL_PHOTO_ANALYSIS_FALLBACK,
  type GarmentAdjustments,
  type SwapScope,
} from "@/lib/fal";
import { getPosePublicPath, getPoseUrl, type PresetView } from "@/lib/models-registry";
import { fal } from "@fal-ai/client";

export const runtime = "nodejs";
export const maxDuration = 180;

let falConfigured = false;

function ensureFalConfigured() {
  if (falConfigured) return;
  const key = process.env.FAL_KEY;
  if (!key) throw new Error("FAL_KEY environment variable is missing.");
  fal.config({ credentials: key });
  falConfigured = true;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function resolvePoseUrl(
  req: Request,
  modelId: string,
  poseId: string,
  view: PresetView,
  poseVariantIndex: number
): Promise<string> {
  if (process.env.VERCEL) {
    const publicPath = getPosePublicPath(modelId, poseId, view, poseVariantIndex);
    return new URL(publicPath, req.url).toString();
  }
  return getPoseUrl(modelId, poseId, view, poseVariantIndex);
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
    ) ||
    /bad request|invalid image|image.*url|url.*image|fetch.*image|download.*image|validation|400/.test(
      message
    )
  );
}

async function subscribeVisionWithRetry(
  input: Record<string, unknown>,
  label: string
): Promise<any> {
  ensureFalConfigured();
  const delays = [0, 900, 2200];
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
 * POST /api/analyze-model
 *
 * Body: { modelId, poseId, garmentImageUrl }
 *
 * Two vision passes kicked off in parallel:
 *   1) analyzeGarmentToPrompt(garmentImageUrl)  → parses GARMENT + FEATURES
 *      out of the user's flat-lay garment photo. We only need the noun phrase
 *      parts so we reuse that helper; the assembled two-image prompt it
 *      returns is discarded.
 *   2) analyzeModelPhoto(poseUrl)               → parses CURRENT_GARMENT +
 *      MODEL_IDENTITY + POSE + SCENE out of the selected model pose.
 *
 * Then we feed both into buildModelSwapPrompt() to get the final, deterministic
 * edit prompt.
 */

// Re-run the garment vision pass but stop before prompt assembly so we can
// feed the raw GARMENT/FEATURES into the model-swap prompt. The existing
// analyzeGarmentToPrompt() wraps them in the flat-lay template which isn't
// what we want here.
async function extractGarmentFields(imageUrl: string): Promise<{ garment: string; features: string }> {
  const SYSTEM = `You are a product catalog analyzer. You see a single garment photograph and must output exactly two lines, in this exact format, with no preamble, no markdown, and no extra lines:

GARMENT: <a short noun phrase describing the garment — include primary color, fabric/texture, an explicit silhouette / cut / fit descriptor, body-length descriptor for tops/jackets/cardigans, and garment type. For pants and jeans, choose the most accurate mainstream leg-shape word: barrel-fit, wide-leg, straight-leg, flare, bootcut, skinny, slim, relaxed, baggy, tapered, cargo, jogger, trouser, palazzo, cropped, or bermuda. Example: "hip-length boxy cream fleece bomber jacket", "barrel-fit dark indigo denim jeans", "wide-leg cream linen trousers".>
FEATURES: <comma-separated noun phrases enumerating clearly visible structural details. ALWAYS begin with a silhouette clause that restates the garment's cut/fit/leg-shape/body length in concrete visual terms. For jackets, tops, cardigans, sweaters, and shirts, explicitly state where the body hem appears to land: cropped above waist, at waistband, below waistband, high hip, hip length, below hip, tunic length, etc. For barrel pants, use language like "a rounded barrel-shaped leg that curves outward through the thigh and knee then tapers toward the ankle"; for wide-leg, "a wide leg of generous width from hip to hem"; for straight-leg, "an even-width leg from thigh to hem"; for flare, "a leg that widens from knee to hem".>

RULES:
- NEVER invent text, letters, numbers, logos, brand names, or made-up words.
- NEVER describe individual motifs inside a print/pattern. Name the pattern TYPE only (e.g. "scattered oval patch design", "all-over floral print", "plaid"). However, you MUST describe the COVERAGE and PLACEMENT of every graphic or pattern — state exactly which areas it covers: e.g. "all-over scattered patches covering the full chest, torso, and both sleeves", "graphic on left chest panel only", "patch on right sleeve only", "patches on both sleeves with a clean chest panel". Coverage and placement are required even when motif detail is omitted.
- Use only real, common English words.
- Describe only the garment itself. Ignore background, hanger, or mannequin.
- PANTS SHAPE AUDIT: If the garment has two leg openings, a waistband, and no neckline, it is a bottom. Never call pants a top. Pay special attention to the outer leg line: rounded outward curve + tapered ankle = barrel; consistent width = wide-leg or straight-leg; widening below knee = flare or bootcut; close fit through ankle = skinny or slim; roomy thigh narrowing to ankle = tapered or jogger.
- If the uploaded garment is barrel pants, both GARMENT and FEATURES must explicitly say barrel/barrel-shaped. Do not soften barrel pants into straight-leg, relaxed, or wide-leg.
- If the exact pants cut is uncertain, choose the closest visible mainstream leg-shape descriptor and describe the evidence in FEATURES.
- HEM GEOMETRY AUDIT: For tops, jackets, cardigans, sweaters, shirts, blouses, hoodies, pullovers, and outerwear, examine whether the front hem and back hem land at the same height. If the back panel is visibly longer than the front (a longer back hem peeks out below the front hem on a hanger or flat-lay), say so explicitly in both GARMENT and FEATURES using one of these terms: "high-low hem", "shirttail hem", "stepped hem", "extended back hem", or "asymmetric hem with longer back panel". Treat the longer back panel as part of the SAME garment.
- LAYERING DISAMBIGUATION: Do not describe any visible inner-fabric portion as an "undershirt", "cami", "inner top", "second layer", "underlayer", "layered piece", "two-piece", or any phrase that implies more than one garment, UNLESS the photograph clearly shows two physically separate garments hanging together. A longer back hem peeking below a shorter front hem on the same hanger is ONE garment with an asymmetric hem — never two garments. A contrasting band visible at a hem is part of the garment's own construction (color-block, banded hem, raw edge), not a second garment.
- ONE GARMENT DEFAULT: If only one garment is hanging in the photograph, both GARMENT and FEATURES must describe ONE garment. Never split a single hanging garment into "top + cami", "shirt + inner tank", or any layered description.
- Output exactly two lines: GARMENT: and FEATURES:, nothing else.`;

  const result: any = await subscribeVisionWithRetry(
    {
      model: "anthropic/claude-haiku-4.5",
      system_prompt: SYSTEM,
      prompt:
        "Analyze the garment in this photograph using the two-line GARMENT / FEATURES format. Output exactly those two lines, nothing else.",
      image_url: imageUrl,
    },
    "garment field extraction"
  );
  const data = result?.data ?? result;
  const output: string = (data?.output ?? data?.response ?? data?.text ?? "").trim();
  const garmentRaw = (output.match(/GARMENT:\s*(.+?)\s*(?:\r?\n|$)/i)?.[1] || "")
    .trim()
    .replace(/\.$/, "");
  const featuresRaw = (
    output.match(/FEATURES:\s*([\s\S]+?)\s*(?:\r?\n(?=[A-Z ]+:)|$)/i)?.[1] || ""
  )
    .trim()
    .replace(/\.$/, "");
  // The vision model occasionally repeats the trailing category word
  // ("…ruffled cotton romper romper"). Collapse trailing duplicate words —
  // single token or two-word categories — so downstream scope inference
  // and prompt rendering see clean text.
  const garment = dedupeTrailingWords(garmentRaw);
  const features = dedupeTrailingWords(featuresRaw);
  if (!garment) {
    console.error("[analyze-model] garment parse failed:", output.slice(0, 400));
    throw new Error("Could not extract garment description from uploaded photo.");
  }
  return { garment, features };
}

/**
 * Collapse trailing duplicate word/word-pairs that the vision LLM sometimes
 * emits, e.g. "ruffled cotton romper romper" → "ruffled cotton romper",
 * "matching crop top crop top" → "matching crop top". Operates on the last
 * 1-2 tokens only; intentionally conservative.
 */
function dedupeTrailingWords(text: string): string {
  if (!text) return text;
  const tokens = text.split(/\s+/);
  if (tokens.length >= 2 && tokens[tokens.length - 1].toLowerCase() === tokens[tokens.length - 2].toLowerCase()) {
    return tokens.slice(0, -1).join(" ");
  }
  if (
    tokens.length >= 4 &&
    tokens[tokens.length - 1].toLowerCase() === tokens[tokens.length - 3].toLowerCase() &&
    tokens[tokens.length - 2].toLowerCase() === tokens[tokens.length - 4].toLowerCase()
  ) {
    return tokens.slice(0, -2).join(" ");
  }
  return text;
}

function fallbackGarmentFields(reason: unknown): { garment: string; features: string } {
  const message = String((reason as any)?.message || reason || "unknown");
  console.warn("[analyze-model] garment analysis failed; using safe garment fallback:", message);
  return {
    garment: "uploaded upper-body apparel garment from the product reference image",
    features:
      "preserve the exact uploaded garment category, silhouette, body length, sleeve shape, hood/collar/neckline, fabric texture, color, seams, trims, drawstrings, pockets, hem, cuffs, graphics, embellishments, hardware, and construction from the product reference image; ignore mannequin, hanger, background, and display form",
  };
}

function fallbackTwoPieceFields(reason: unknown): Awaited<ReturnType<typeof extractTwoPieceFields>> {
  const message = String((reason as any)?.message || reason || "unknown");
  console.warn("[analyze-model] two-piece analysis failed; using safe set fallback:", message);
  return {
    top: "uploaded top piece from the two-piece product reference",
    topFeatures:
      "preserve the exact uploaded top garment category, silhouette, body length, sleeve shape, neckline, fabric texture, color, seams, trims, pockets, graphics, embellishments, hardware, and construction from the first product reference image",
    bottom: "uploaded bottom piece from the two-piece product reference",
    bottomFeatures:
      "preserve the exact uploaded bottom garment category, silhouette, length, leg or skirt shape, waistband, fabric texture, color, seams, trims, pockets, graphics, embellishments, hardware, and construction from the second product reference image",
  };
}

type GarmentPart = "top" | "bottom" | "full-look" | "unknown";

function classifyGarmentPart(garment: string): GarmentPart {
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

  const bottomWords = [
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
  if (bottomWords.some((w) => text.includes(w))) return "bottom";

  const topWords = [
    "top",
    "shirt",
    "t-shirt",
    "tee",
    "tank",
    "blouse",
    "hoodie",
    "sweater",
    "cardigan",
    "jacket",
    "coat",
    "vest",
    "blazer",
    "pullover",
    "sweatshirt",
    "camisole",
  ];
  if (topWords.some((w) => text.includes(w))) return "top";

  return "unknown";
}

async function extractTwoPieceFieldsFromSeparateImages(
  imageUrls: string[]
): Promise<Awaited<ReturnType<typeof extractTwoPieceFields>>> {
  if (imageUrls.length < 2) {
    throw new Error("Two-piece mode with separate uploads requires one top image and one bottom image.");
  }

  const analyzed = await Promise.all(
    imageUrls
      .slice(0, 2)
      .map(async (url, index) =>
        extractGarmentFields(url).catch((err) =>
          fallbackGarmentFields(
            `two-piece upload ${index + 1}: ${(err as any)?.message || String(err)}`
          )
        )
      )
  );
  const classified = analyzed.map((fields) => ({
    ...fields,
    part: classifyGarmentPart(fields.garment),
  }));

  const top = classified.find((item) => item.part === "top");
  const bottom = classified.find((item) => item.part === "bottom");
  const inferredTop =
    top ||
    classified.find((item) => item.part !== "bottom") ||
    classified[0];
  const inferredBottom =
    bottom ||
    classified.find((item) => item !== inferredTop && item.part !== "top") ||
    classified[1] ||
    classified[0];

  if (!top || !bottom) {
    const summary = classified.map((item) => `"${item.garment}" -> ${item.part}`).join(", ");
    console.warn(
      `[analyze-model] two-piece classification was uncertain; using upload order fallback: ${summary}`
    );
  }

  return {
    top: inferredTop.garment,
    topFeatures: inferredTop.features,
    bottom: inferredBottom.garment,
    bottomFeatures: inferredBottom.features,
  };
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      modelId,
      poseId,
      garmentImageUrl,
      garmentImageUrls,
      twoPiece,
      view,
      garmentOverride,
      promptMode,
      swapScopeOverride,
      poseVariantIndex,
    } =
      body as {
      modelId: string;
      poseId: string;
      garmentImageUrl: string;
      garmentImageUrls?: string[];
      twoPiece?: boolean;
      adjustments?: GarmentAdjustments;
      view?: PresetView;
      garmentOverride?: unknown;
      promptMode?: "classic" | "beta";
      swapScopeOverride?: SwapScope | "auto";
      poseVariantIndex?: number;
    };
    // Clamp to a sane range so an out-of-bounds index doesn't surprise the
    // resolver. Anything > 0 only matters when the look has viewVariants.
    const safePoseVariantIndex =
      typeof poseVariantIndex === "number" && Number.isFinite(poseVariantIndex)
        ? Math.max(0, Math.min(8, Math.floor(poseVariantIndex)))
        : 0;
    const adjustments = body?.adjustments as GarmentAdjustments | undefined;
    const validScopeOverride: SwapScope | undefined =
      swapScopeOverride === "upper-body" ||
      swapScopeOverride === "lower-body" ||
      swapScopeOverride === "full-look"
        ? swapScopeOverride
        : undefined;
    const singleGarmentOverride =
      !twoPiece &&
      garmentOverride &&
      typeof garmentOverride === "object" &&
      typeof (garmentOverride as any).garment === "string" &&
      (garmentOverride as any).garment.trim()
        ? {
            garment: (garmentOverride as any).garment.trim(),
            features:
              typeof (garmentOverride as any).features === "string"
                ? (garmentOverride as any).features.trim()
                : "",
          }
        : null;
    const garmentUrls = Array.isArray(garmentImageUrls)
      ? garmentImageUrls.filter((url): url is string => typeof url === "string" && url.trim().length > 0)
      : garmentImageUrl && typeof garmentImageUrl === "string"
      ? [garmentImageUrl]
      : [];

    if (!modelId || typeof modelId !== "string") {
      return NextResponse.json({ ok: false, error: "modelId is required" }, { status: 400 });
    }
    if (!poseId || typeof poseId !== "string") {
      return NextResponse.json({ ok: false, error: "poseId is required" }, { status: 400 });
    }
    if (garmentUrls.length === 0) {
      return NextResponse.json(
        { ok: false, error: "At least one garment image is required" },
        { status: 400 }
      );
    }

    const poseUrl = await resolvePoseUrl(
      req,
      modelId,
      poseId,
      view || "front",
      safePoseVariantIndex
    );

    // Run both vision passes in parallel but use allSettled so we can report
    // which one failed. Previously a 400 from fal.ai would surface as a
    // useless "Bad Request" with no hint whether the garment or the pose
    // image was the culprit.
    //
    // When `twoPiece` is set, the garment-analyzer pass outputs four fields
    // (TOP / TOP_FEATURES / BOTTOM / BOTTOM_FEATURES) instead of two, and the
    // assembler swaps to the coordinated-set template.
    const [garmentResult, modelResult] = await Promise.allSettled([
      twoPiece
        ? garmentUrls.length >= 2
          ? extractTwoPieceFieldsFromSeparateImages(garmentUrls)
          : extractTwoPieceFields(garmentUrls[0])
        : singleGarmentOverride
        ? Promise.resolve(singleGarmentOverride)
        : extractGarmentFields(garmentUrls[0]),
      analyzeModelPhoto(poseUrl),
    ]);
    const modelFields =
      modelResult.status === "rejected"
        ? MODEL_PHOTO_ANALYSIS_FALLBACK
        : modelResult.value;
    if (modelResult.status === "rejected") {
      console.warn(
        "[analyze-model] pose analysis failed; continuing with safe fallback:",
        modelResult.reason
      );
    }

    let prompt: string;
    // For Studio 1 (classic prompt mode), also return three Image-A/Image-B
    // variants so the client can run them in parallel and offer a 3-up picker.
    // Beta keeps a single composition-first prompt.
    let prompts: string[] | undefined;
    let responseGarmentMeta: Record<string, unknown>;
    let inferredScope: SwapScope = "upper-body";
    let effectiveScope: SwapScope = "upper-body";
    if (twoPiece) {
      const twoPieceFields =
        garmentResult.status === "fulfilled"
          ? (garmentResult.value as Awaited<ReturnType<typeof extractTwoPieceFields>>)
          : fallbackTwoPieceFields(garmentResult.reason);
      // Two-piece is always full-look; the override doesn't apply because
      // a coordinated set replaces both halves of the outfit by definition.
      inferredScope = "full-look";
      effectiveScope = "full-look";
      if (promptMode === "beta") {
        const variants = buildModelStudioBetaPromptVariants(
          `${twoPieceFields.top} and ${twoPieceFields.bottom} coordinated set`,
          [twoPieceFields.topFeatures, twoPieceFields.bottomFeatures].filter(Boolean).join(", "),
          modelFields,
          adjustments
        );
        prompt = variants[0];
        prompts = variants;
      } else {
        const variants = buildModelSwapTwoPiecePromptVariants(
          twoPieceFields,
          modelFields,
          adjustments
        );
        prompt = variants[0];
        prompts = variants;
      }
      responseGarmentMeta = {
        twoPiece: true,
        top: twoPieceFields.top,
        topFeatures: twoPieceFields.topFeatures,
        bottom: twoPieceFields.bottom,
        bottomFeatures: twoPieceFields.bottomFeatures,
      };
    } else {
      const singleFields =
        garmentResult.status === "fulfilled"
          ? (garmentResult.value as Awaited<ReturnType<typeof extractGarmentFields>>)
          : fallbackGarmentFields(garmentResult.reason);
      inferredScope = inferSwapScope(singleFields.garment);
      effectiveScope = validScopeOverride ?? inferredScope;
      if (promptMode === "beta") {
        const variants = buildModelStudioBetaPromptVariants(
          singleFields.garment,
          singleFields.features,
          modelFields,
          adjustments
        );
        prompt = variants[0];
        prompts = variants;
      } else {
        const variants = buildModelSwapPromptVariants(
          singleFields.garment,
          singleFields.features,
          modelFields,
          adjustments,
          validScopeOverride
        );
        prompt = variants[0];
        prompts = variants;
      }
      responseGarmentMeta = {
        twoPiece: false,
        garment: singleFields.garment,
        features: singleFields.features,
      };
    }

    console.log("[analyze-model] final prompt preview:", prompt.slice(0, 240));

    return NextResponse.json({
      ok: true,
      prompt,
      ...(prompts ? { prompts } : {}),
      poseUrl,
      inferredScope,
      effectiveScope,
      ...responseGarmentMeta,
      model: modelFields,
    });
  } catch (err: any) {
    // Silence the unused import warning for analyzeGarmentToPrompt — kept for
    // API parity in case we later want to reuse it directly.
    void analyzeGarmentToPrompt;
    console.error("[analyze-model] error:", err);
    return NextResponse.json(
      { ok: false, error: err?.message ?? "Model analysis failed" },
      { status: 500 }
    );
  }
}
