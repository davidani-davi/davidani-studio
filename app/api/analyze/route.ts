import { NextResponse } from "next/server";
import {
  analyzeFrontBackGarmentToPrompt,
  analyzeGarmentToPrompt,
  analyzeTwoPieceSetToPrompt,
} from "@/lib/fal";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { imageUrl, imageUrls, backgroundColor, twoPiece } = body as {
      imageUrl: string;
      imageUrls?: string[];
      backgroundColor?: string;
      twoPiece?: boolean;
    };
    const selectedImageUrls = Array.isArray(imageUrls)
      ? imageUrls.filter((url): url is string => typeof url === "string" && url.trim().length > 0)
      : [];

    if ((!imageUrl || typeof imageUrl !== "string") && selectedImageUrls.length === 0) {
      return NextResponse.json(
        { ok: false, error: "imageUrl is required" },
        { status: 400 }
      );
    }

    // When the user flags the reference as a coordinated two-piece set, route
    // through the four-line TOP/BOTTOM analyzer + the matching assembler. The
    // backgroundColor field isn't used by either path right now (legacy shape)
    // but we keep the argument for single-garment so the signature stays stable.
    const primaryImageUrl = selectedImageUrls[0] || imageUrl;
    const prompt = twoPiece
      ? await analyzeTwoPieceSetToPrompt(primaryImageUrl)
      : selectedImageUrls.length >= 2
      ? await analyzeFrontBackGarmentToPrompt(selectedImageUrls[0], selectedImageUrls[1], {
          backgroundColor,
        })
      : await analyzeGarmentToPrompt(primaryImageUrl, { backgroundColor });
    return NextResponse.json({ ok: true, prompt });
  } catch (err: any) {
    console.error("[analyze] error:", err);
    return NextResponse.json(
      { ok: false, error: err?.message ?? "Analysis failed" },
      { status: 500 }
    );
  }
}
