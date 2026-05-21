import { NextResponse } from "next/server";
import { generate, type OverlayOptions } from "@/lib/fal";
import { MODELS, type ModelId } from "@/lib/models";
import { IMAGE_STUDIO_OUTPUT_SIZE } from "@/lib/output-sizes";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      modelId,
      prompt,
      imageUrls,
      referenceImageUrl,
      aspectRatio,
      resolution,
      format,
      numImages,
      overlay,
      useDefaultReference,
      raw,
    } = body as {
      modelId: ModelId;
      prompt: string;
      imageUrls: string[];
      referenceImageUrl?: string | null;
      aspectRatio?: string;
      resolution?: string;
      format?: "png" | "jpeg";
      numImages?: number;
      overlay?: OverlayOptions;
      useDefaultReference?: boolean;
      raw?: boolean;
    };

    if (!modelId || !MODELS[modelId]) {
      return NextResponse.json({ ok: false, error: "Invalid modelId" }, { status: 400 });
    }
    if (!prompt?.trim()) {
      return NextResponse.json({ ok: false, error: "Prompt is required" }, { status: 400 });
    }
    if (!imageUrls?.length) {
      return NextResponse.json({ ok: false, error: "At least one product image is required" }, { status: 400 });
    }

    const result = await generate({
      modelId,
      prompt,
      imageUrls,
      referenceImageUrl,
      aspectRatio,
      resolution,
      format,
      numImages: numImages ?? 1,
      overlay,
      // Always locked server-side — client value is intentionally ignored.
      outputSize: IMAGE_STUDIO_OUTPUT_SIZE,
      useDefaultReference,
      raw,
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (err: any) {
    console.error("[generate] error:", err);
    return NextResponse.json(
      { ok: false, error: err?.message ?? "Generation failed" },
      { status: 500 }
    );
  }
}
