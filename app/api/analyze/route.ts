import { NextResponse } from "next/server";
import { analyzeGarmentToPrompt } from "@/lib/fal";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { imageUrl, backgroundColor } = body as {
      imageUrl: string;
      backgroundColor?: string;
    };

    if (!imageUrl || typeof imageUrl !== "string") {
      return NextResponse.json(
        { ok: false, error: "imageUrl is required" },
        { status: 400 }
      );
    }

    const prompt = await analyzeGarmentToPrompt(imageUrl, { backgroundColor });
    return NextResponse.json({ ok: true, prompt });
  } catch (err: any) {
    console.error("[analyze] error:", err);
    return NextResponse.json(
      { ok: false, error: err?.message ?? "Analysis failed" },
      { status: 500 }
    );
  }
}
