import { NextResponse } from "next/server";
import { generate } from "@/lib/fal";
import { MODELS, type ModelId } from "@/lib/models";
import { CAD_STUDIO_OUTPUT_SIZE } from "@/lib/output-sizes";
import { buildCadPrompt, type CadMode } from "@/lib/cad-prompts";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { modelId, mode, imageUrls, notes, resolution, format, numImages } = body as {
      modelId: ModelId;
      mode: CadMode;
      imageUrls: string[];
      notes?: string;
      resolution?: string;
      format?: "png" | "jpeg";
      numImages?: number;
    };

    if (!modelId || !MODELS[modelId]) {
      return NextResponse.json({ ok: false, error: "Invalid modelId" }, { status: 400 });
    }
    if (mode !== "flat" && mode !== "seamless") {
      return NextResponse.json({ ok: false, error: "Invalid mode" }, { status: 400 });
    }
    if (!imageUrls?.length) {
      return NextResponse.json(
        { ok: false, error: "At least one garment image is required" },
        { status: 400 }
      );
    }

    const result = await generate({
      modelId,
      prompt: buildCadPrompt(mode, notes),
      imageUrls,
      // Sandboxed extraction: edit from the uploaded garment photo(s) only.
      raw: true,
      useDefaultReference: false,
      referenceImageUrl: null,
      aspectRatio: "1:1",
      resolution: resolution ?? "2K",
      format: format ?? "png",
      numImages: numImages ?? 1,
      // Square lock — clients never override.
      outputSize: CAD_STUDIO_OUTPUT_SIZE,
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (err: any) {
    console.error("[cad-extract] error:", err);
    return NextResponse.json(
      { ok: false, error: err?.message ?? "CAD extraction failed" },
      { status: 500 }
    );
  }
}
