import { NextResponse } from "next/server";
import sharp from "sharp";
import { buildSpecSheetSvg } from "@/lib/cad-export";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { imageUrl, repeatCm, dpi, repeatType, palette, colorCount } = body as {
      imageUrl: string;
      repeatCm: number | null;
      dpi: number | null;
      repeatType: string;
      palette: { hex: string; name: string }[];
      colorCount: number;
    };

    if (!imageUrl) {
      return NextResponse.json({ ok: false, error: "imageUrl is required" }, { status: 400 });
    }

    const resp = await fetch(imageUrl);
    if (!resp.ok) {
      return NextResponse.json(
        { ok: false, error: `Could not fetch result image (HTTP ${resp.status})` },
        { status: 502 }
      );
    }
    const buf = Buffer.from(await resp.arrayBuffer());
    const meta = await sharp(buf).metadata();
    const widthPx = meta.width ?? 2048;
    const heightPx = meta.height ?? 2048;

    // Print file: re-encode as PNG, stamping physical density when scale is set.
    let printPipeline = sharp(buf);
    if (dpi && dpi > 0) {
      printPipeline = printPipeline.withMetadata({ density: dpi });
    }
    const printPng = await printPipeline.png().toBuffer();

    // Spec sheet: render the SVG to PNG.
    const svg = buildSpecSheetSvg({
      repeatCm: repeatCm ?? null,
      dpi: dpi ?? null,
      widthPx,
      heightPx,
      repeatType: repeatType || "unknown",
      palette: Array.isArray(palette) ? palette : [],
      colorCount: Number.isFinite(colorCount) ? colorCount : 0,
    });
    const specPng = await sharp(Buffer.from(svg)).png().toBuffer();

    return NextResponse.json({
      ok: true,
      dpi: dpi ?? null,
      printFile: `data:image/png;base64,${printPng.toString("base64")}`,
      specSheet: `data:image/png;base64,${specPng.toString("base64")}`,
    });
  } catch (err: any) {
    console.error("[cad-export] error:", err);
    return NextResponse.json(
      { ok: false, error: err?.message ?? "Export failed" },
      { status: 500 }
    );
  }
}
