import { NextResponse } from "next/server";
import { generate, type OverlayOptions } from "@/lib/fal";
import { MODELS, type ModelId } from "@/lib/models";
import { IMAGE_STUDIO_OUTPUT_SIZE } from "@/lib/output-sizes";
import { resolveGenerateOutputSize } from "@/lib/generate-output-size";

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
      deferResize,
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
      deferResize?: boolean;
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
      // The 2160x3240 lock stays server-side (client sizes are ignored), but
      // deferResize returns native model output immediately — the client
      // shows it and calls /api/finalize-image in the background to produce
      // the locked-size final, instead of blocking the response on
      // fetch -> sharp -> re-upload.
      // Raw callers such as Image Playground own their aspect ratio. Applying
      // Image Studio's fixed 2:3 export size here would crop every selected
      // ratio (including 16:9) back into a portrait image.
      outputSize: resolveGenerateOutputSize(raw, deferResize, IMAGE_STUDIO_OUTPUT_SIZE),
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
