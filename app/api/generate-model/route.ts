import { NextResponse } from "next/server";
import { generate, type OverlayOptions } from "@/lib/fal";
import { MODELS, type ModelId } from "@/lib/models";
import { getPosePublicPath, getPoseUrl, type PresetView } from "@/lib/models-registry";
import { MODEL_STUDIO_OUTPUT_SIZE } from "@/lib/output-sizes";

export const runtime = "nodejs";
export const maxDuration = 800;

function wait(ms: number): Promise<void> {
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

const MODEL_POSE_GARMENT_FIREWALL =
  "Final garment-source firewall: the model pose/canvas image is only the body, pose, camera, framing, lighting, and background reference. The uploaded garment image or images are the only source of truth for the replacement garment. Do not copy, average, or be influenced by the canvas image's existing clothing length, cropped hem, tucked styling, waistband exposure, sleeve length, neckline, silhouette, fabric, color, trims, or outfit proportions. If the canvas model is wearing a cropped garment but the uploaded garment is longer, render the uploaded garment longer exactly as indicated by the product reference.";

/**
 * POST /api/generate-model
 *
 * Model Studio generation endpoint. Semantically the inverse of /api/generate:
 *
 *   /api/generate       — style-reference photo = canvas, user's garment = reference
 *   /api/generate-model — MODEL POSE photo     = canvas, user's garment = reference
 *
 * We reuse the generic generate() helper; the only difference is where the
 * canvas comes from. We pass the pose URL as `referenceImageUrl` (which
 * generate() places at image_urls[0], i.e. the canvas) and the user's garment
 * photo in `imageUrls` (which lands in image_urls[1..], i.e. the reference).
 * Quality-control repairs can override the canvas with the selected generated
 * result image so the edit actually happens to that exact result.
 *
 * Body: {
 *   modelId,         // image model ID (e.g. "nano-banana")
 *   humanModelId,    // model folder name (e.g. "bianca")
 *   poseId,          // pose ID within that folder (e.g. "bianca1")
 *   prompt,          // fully-assembled prompt from /api/analyze-model
 *   garmentImageUrls,// user-uploaded garment photos
 *   aspectRatio, resolution, format, numImages, overlay
 * }
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      modelId,
      humanModelId,
      poseId,
      prompt,
      garmentImageUrls,
      view,
      canvasImageUrl,
      aspectRatio,
      resolution,
      format,
      numImages,
      overlay,
      poseVariantIndex,
      preserveSecondaryReferences,
    } = body as {
      modelId: ModelId;
      humanModelId: string;
      poseId: string;
      prompt: string;
      garmentImageUrls: string[];
      view?: PresetView;
      canvasImageUrl?: string;
      aspectRatio?: string;
      resolution?: string;
      format?: "png" | "jpeg";
      numImages?: number;
      overlay?: OverlayOptions;
      poseVariantIndex?: number;
      preserveSecondaryReferences?: boolean;
    };
    const safePoseVariantIndex =
      typeof poseVariantIndex === "number" && Number.isFinite(poseVariantIndex)
        ? Math.max(0, Math.min(8, Math.floor(poseVariantIndex)))
        : 0;

    if (!modelId || !MODELS[modelId]) {
      return NextResponse.json({ ok: false, error: "Invalid modelId" }, { status: 400 });
    }
    if (!humanModelId) {
      return NextResponse.json({ ok: false, error: "humanModelId is required" }, { status: 400 });
    }
    if (!poseId) {
      return NextResponse.json({ ok: false, error: "poseId is required" }, { status: 400 });
    }
    if (!prompt?.trim()) {
      return NextResponse.json({ ok: false, error: "Prompt is required" }, { status: 400 });
    }
    if (!garmentImageUrls?.length) {
      return NextResponse.json(
        { ok: false, error: "At least one garment image is required" },
        { status: 400 }
      );
    }

    const poseUrl = await resolvePoseUrl(
      req,
      humanModelId,
      poseId,
      view || "front",
      safePoseVariantIndex
    );

    const canvasUrl =
      typeof canvasImageUrl === "string" && canvasImageUrl.trim()
        ? canvasImageUrl.trim()
        : poseUrl;

    let result;
    try {
      result = await generate({
        modelId,
        prompt: `${prompt} ${MODEL_POSE_GARMENT_FIREWALL}`,
        imageUrls: garmentImageUrls,
        // Normal run: pose is the canvas. QC repair: selected result is the canvas.
        referenceImageUrl: canvasUrl,
        aspectRatio,
        resolution,
        format,
        numImages: numImages ?? 1,
        overlay,
        // Always locked server-side — client value is intentionally ignored.
        outputSize: MODEL_STUDIO_OUTPUT_SIZE,
      });
    } catch (err: any) {
      const message = String(err?.message || err || "");
      const isReferenceProcessingError =
        /unprocessable|invalid image|image model could not process|validation|422/i.test(message);
      const canRetryWithPrimaryReference =
        !preserveSecondaryReferences && garmentImageUrls.length > 1 && isReferenceProcessingError;

      if (!isReferenceProcessingError) throw err;

      if (canRetryWithPrimaryReference) {
        console.warn(
          "[generate-model] generator rejected multi-reference payload; retrying with primary garment reference only:",
          message
        );
      } else {
        console.warn(
          "[generate-model] generator rejected reference image; waiting briefly and retrying once:",
          message
        );
        await wait(2500);
      }
      result = await generate({
        modelId,
        prompt:
          canRetryWithPrimaryReference
            ? `${prompt} ${MODEL_POSE_GARMENT_FIREWALL} Use the remaining product reference as the sole garment source of truth. Do not invent missing details from removed secondary references.`
            : `${prompt} ${MODEL_POSE_GARMENT_FIREWALL}`,
        imageUrls: canRetryWithPrimaryReference ? [garmentImageUrls[0]] : garmentImageUrls,
        referenceImageUrl: canvasUrl,
        aspectRatio,
        resolution,
        format,
        numImages: numImages ?? 1,
        overlay,
        // Always locked server-side — client value is intentionally ignored.
        outputSize: MODEL_STUDIO_OUTPUT_SIZE,
      });
    }

    return NextResponse.json({ ok: true, ...result, poseUrl });
  } catch (err: any) {
    console.error("[generate-model] error:", err);
    return NextResponse.json(
      { ok: false, error: err?.message ?? "Model generation failed" },
      { status: 500 }
    );
  }
}
