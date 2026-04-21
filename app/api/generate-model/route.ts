import { NextResponse } from "next/server";
import { generate, type OverlayOptions } from "@/lib/fal";
import { MODELS, type ModelId } from "@/lib/models";
import { getPoseUrl } from "@/lib/models-registry";

export const runtime = "nodejs";
export const maxDuration = 300;

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
      aspectRatio,
      resolution,
      format,
      numImages,
      overlay,
    } = body as {
      modelId: ModelId;
      humanModelId: string;
      poseId: string;
      prompt: string;
      garmentImageUrls: string[];
      aspectRatio?: string;
      resolution?: string;
      format?: "png" | "jpeg";
      numImages?: number;
      overlay?: OverlayOptions;
    };

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

    const poseUrl = await getPoseUrl(humanModelId, poseId);

    const result = await generate({
      modelId,
      prompt,
      imageUrls: garmentImageUrls,
      // The pose is the canvas — generate() puts this at image_urls[0].
      referenceImageUrl: poseUrl,
      aspectRatio,
      resolution,
      format,
      numImages: numImages ?? 1,
      overlay,
    });

    return NextResponse.json({ ok: true, ...result, poseUrl });
  } catch (err: any) {
    console.error("[generate-model] error:", err);
    return NextResponse.json(
      { ok: false, error: err?.message ?? "Model generation failed" },
      { status: 500 }
    );
  }
}
