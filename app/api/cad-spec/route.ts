import { NextResponse } from "next/server";
import { analyzeTextileSpec } from "@/lib/fal";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { imageUrls } = body as { imageUrls: string[] };

    if (!imageUrls?.length) {
      return NextResponse.json(
        { ok: false, error: "At least one garment image is required" },
        { status: 400 }
      );
    }

    const spec = await analyzeTextileSpec(imageUrls);
    return NextResponse.json({ ok: true, spec });
  } catch (err: any) {
    console.error("[cad-spec] error:", err);
    return NextResponse.json(
      { ok: false, error: err?.message ?? "Spec analysis failed" },
      { status: 500 }
    );
  }
}
