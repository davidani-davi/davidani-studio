import { NextResponse } from "next/server";
import { generate } from "@/lib/fal";
import { MODELS, type ModelId } from "@/lib/models";
import { CAD_CLEANUP_PROMPT } from "@/lib/cad-prompts";

export const runtime = "nodejs";
export const maxDuration = 800;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { imageUrl, modelId } = body as { imageUrl: string; modelId?: ModelId };

    if (!imageUrl) {
      return NextResponse.json({ ok: false, error: "imageUrl is required" }, { status: 400 });
    }
    const model: ModelId = modelId && MODELS[modelId] ? modelId : "nano-banana";

    // The result tile is already a fetchable image URL; the cleanup pass edits
    // it in place (no offset — that relocated body construction and added a
    // center seam). The prompt hunts residual hem/stitch lines wherever they
    // are and keeps the result tileable.
    const result = await generate({
      modelId: model,
      prompt: CAD_CLEANUP_PROMPT,
      imageUrls: [imageUrl],
      raw: true,
      useDefaultReference: false,
      referenceImageUrl: null,
      aspectRatio: "1:1",
      resolution: "2K",
      format: "png",
      numImages: 1,
      // Native output, same rationale as /api/cad-extract.
      outputSize: null,
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (err: any) {
    console.error("[cad-cleanup] error:", err);
    return NextResponse.json(
      { ok: false, error: err?.message ?? "Cleanup failed" },
      { status: 500 }
    );
  }
}
