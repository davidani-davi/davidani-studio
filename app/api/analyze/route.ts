import { NextResponse } from "next/server";
import { analyzeGarmentToPrompt, analyzeTwoPieceSetToPrompt } from "@/lib/fal";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { imageUrl, backgroundColor, twoPiece } = body as {
      imageUrl: string;
      backgroundColor?: string;
      twoPiece?: boolean;
    };

    if (!imageUrl || typeof imageUrl !== "string") {
      return NextResponse.json(
        { ok: false, error: "imageUrl is required" },
        { status: 400 }
      );
    }

    // When the user flags the reference as a coordinated two-piece set, route
    // through the four-line TOP/BOTTOM analyzer + the matching assembler. The
    // backgroundColor field isn't used by either path right now (legacy shape)
    // but we keep the argument for single-garment so the signature stays stable.
    const prompt = twoPiece
      ? await analyzeTwoPieceSetToPrompt(imageUrl)
      : await analyzeGarmentToPrompt(imageUrl, { backgroundColor });
    return NextResponse.json({ ok: true, prompt });
  } catch (err: any) {
    console.error("[analyze] error:", err);
    return NextResponse.json(
      { ok: false, error: err?.message ?? "Analysis failed" },
      { status: 500 }
    );
  }
}
