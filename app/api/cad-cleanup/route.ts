import { NextResponse } from "next/server";
import sharp from "sharp";
import { generate, uploadToFal } from "@/lib/fal";
import { MODELS, type ModelId } from "@/lib/models";
import { CAD_STUDIO_OUTPUT_SIZE } from "@/lib/output-sizes";
import { CAD_CLEANUP_PROMPT } from "@/lib/cad-prompts";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Offset an image by half in both axes (diagonal quadrant swap) so its outer
 * edges become continuous and any interior seam moves to the exact center.
 */
async function offsetByHalf(buf: Buffer, width: number, height: number): Promise<Buffer> {
  const halfW = Math.floor(width / 2);
  const halfH = Math.floor(height / 2);
  const rightW = width - halfW;
  const bottomH = height - halfH;

  const quad = (left: number, top: number, w: number, h: number) =>
    sharp(buf).extract({ left, top, width: w, height: h }).png().toBuffer();

  const [tl, tr, bl, br] = await Promise.all([
    quad(0, 0, halfW, halfH),
    quad(halfW, 0, rightW, halfH),
    quad(0, halfH, halfW, bottomH),
    quad(halfW, halfH, rightW, bottomH),
  ]);

  return sharp({
    create: { width, height, channels: 3, background: { r: 0, g: 0, b: 0 } },
  })
    .composite([
      { input: br, left: 0, top: 0 },
      { input: bl, left: rightW, top: 0 },
      { input: tr, left: 0, top: bottomH },
      { input: tl, left: rightW, top: bottomH },
    ])
    .png()
    .toBuffer();
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { imageUrl, modelId } = body as { imageUrl: string; modelId?: ModelId };

    if (!imageUrl) {
      return NextResponse.json({ ok: false, error: "imageUrl is required" }, { status: 400 });
    }
    const model: ModelId = modelId && MODELS[modelId] ? modelId : "nano-banana";

    const resp = await fetch(imageUrl);
    if (!resp.ok) {
      return NextResponse.json(
        { ok: false, error: `Could not fetch result image (HTTP ${resp.status})` },
        { status: 502 }
      );
    }
    const buf = Buffer.from(await resp.arrayBuffer());
    const meta = await sharp(buf).metadata();
    const width = meta.width ?? 2048;
    const height = meta.height ?? 2048;
    if (!width || !height) {
      return NextResponse.json({ ok: false, error: "Could not read image dimensions" }, { status: 400 });
    }

    const offsetBuf = await offsetByHalf(buf, width, height);
    const offsetUrl = await uploadToFal(
      new Blob([new Uint8Array(offsetBuf)], { type: "image/png" }),
      "cad-cleanup-offset.png"
    );

    const result = await generate({
      modelId: model,
      prompt: CAD_CLEANUP_PROMPT,
      imageUrls: [offsetUrl],
      raw: true,
      useDefaultReference: false,
      referenceImageUrl: null,
      aspectRatio: "1:1",
      resolution: "2K",
      format: "png",
      numImages: 1,
      outputSize: CAD_STUDIO_OUTPUT_SIZE,
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
