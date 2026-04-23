import { NextResponse } from "next/server";
import {
  analyzeModelPhoto,
  analyzeGarmentToPrompt,
  buildModelSwapPrompt,
  buildModelSwapTwoPiecePrompt,
  extractTwoPieceFields,
  type GarmentAdjustments,
} from "@/lib/fal";
import { getPoseUrl, type PresetView } from "@/lib/models-registry";
import { fal } from "@fal-ai/client";

export const runtime = "nodejs";
export const maxDuration = 180;

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

GARMENT: <a short noun phrase describing the garment — include primary color, fabric/texture, and garment type.>
FEATURES: <comma-separated noun phrases enumerating clearly visible structural details.>

RULES:
- NEVER invent text, letters, numbers, logos, brand names, or made-up words.
- NEVER describe individual motifs inside a print/pattern. Name the pattern TYPE only.
- Use only real, common English words.
- Describe only the garment itself. Ignore background, hanger, or mannequin.
- Output exactly two lines: GARMENT: and FEATURES:, nothing else.`;

  const result: any = await subscribeVisionWithRetry(
    {
      model: "anthropic/claude-3.7-sonnet",
      system_prompt: SYSTEM,
      prompt:
        "Analyze the garment in this photograph using the two-line GARMENT / FEATURES format. Output exactly those two lines, nothing else.",
      image_url: imageUrl,
    },
    "garment field extraction"
  );
  const data = result?.data ?? result;
  const output: string = (data?.output ?? data?.response ?? data?.text ?? "").trim();
  const garment = (output.match(/GARMENT:\s*(.+?)\s*(?:\r?\n|$)/i)?.[1] || "")
    .trim()
    .replace(/\.$/, "");
  const features = (
    output.match(/FEATURES:\s*([\s\S]+?)\s*(?:\r?\n(?=[A-Z ]+:)|$)/i)?.[1] || ""
  )
    .trim()
    .replace(/\.$/, "");
  if (!garment) {
    console.error("[analyze-model] garment parse failed:", output.slice(0, 400));
    throw new Error("Could not extract garment description from uploaded photo.");
  }
  return { garment, features };
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

  const analyzed = await Promise.all(imageUrls.slice(0, 2).map((url) => extractGarmentFields(url)));
  const classified = analyzed.map((fields) => ({
    ...fields,
    part: classifyGarmentPart(fields.garment),
  }));

  const top = classified.find((item) => item.part === "top");
  const bottom = classified.find((item) => item.part === "bottom");

  if (!top || !bottom) {
    const summary = classified.map((item) => `"${item.garment}" → ${item.part}`).join(", ");
    throw new Error(
      `Two-piece mode expected one top and one bottom upload, but detected: ${summary}. Upload one top image and one bottom image.`
    );
  }

  return {
    top: top.garment,
    topFeatures: top.features,
    bottom: bottom.garment,
    bottomFeatures: bottom.features,
  };
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { modelId, poseId, garmentImageUrl, garmentImageUrls, twoPiece, view } = body as {
      modelId: string;
      poseId: string;
      garmentImageUrl: string;
      garmentImageUrls?: string[];
      twoPiece?: boolean;
      adjustments?: GarmentAdjustments;
      view?: PresetView;
    };
    const adjustments = body?.adjustments as GarmentAdjustments | undefined;
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

    const poseUrl = await getPoseUrl(modelId, poseId, view || "front");

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
        : extractGarmentFields(garmentUrls[0]),
      analyzeModelPhoto(poseUrl),
    ]);
    if (garmentResult.status === "rejected") {
      console.error("[analyze-model] garment analysis failed:", garmentResult.reason);
      const msg =
        garmentResult.reason?.message || String(garmentResult.reason) || "unknown";
      throw new Error(`Garment photo analysis failed: ${msg}`);
    }
    if (modelResult.status === "rejected") {
      console.error("[analyze-model] pose analysis failed:", modelResult.reason);
      const msg =
        modelResult.reason?.message || String(modelResult.reason) || "unknown";
      throw new Error(`Pose photo analysis failed: ${msg}`);
    }
    const modelFields = modelResult.value;

    let prompt: string;
    let responseGarmentMeta: Record<string, unknown>;
    if (twoPiece) {
      const twoPieceFields = garmentResult.value as Awaited<
        ReturnType<typeof extractTwoPieceFields>
      >;
      prompt = buildModelSwapTwoPiecePrompt(twoPieceFields, modelFields, adjustments);
      responseGarmentMeta = {
        twoPiece: true,
        top: twoPieceFields.top,
        topFeatures: twoPieceFields.topFeatures,
        bottom: twoPieceFields.bottom,
        bottomFeatures: twoPieceFields.bottomFeatures,
      };
    } else {
      const singleFields = garmentResult.value as Awaited<
        ReturnType<typeof extractGarmentFields>
      >;
      prompt = buildModelSwapPrompt(
        singleFields.garment,
        singleFields.features,
        modelFields,
        adjustments
      );
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
      poseUrl,
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
