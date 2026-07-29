import { NextResponse } from "next/server";
import {
  analyzeFrontBackGarmentToPrompt,
  analyzeGarmentToPrompt,
  analyzeTwoPieceSetToPrompt,
} from "@/lib/fal";
import { cachedVision } from "@/lib/vision-cache";

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
    // Cached on the immutable image URLs + options (lib/vision-cache), so a
    // repeat Generate on an unchanged photo skips the vision round-trip and
    // the client-side warmup call makes the first click hit a hot cache too.
    const prompt = await cachedVision(
      "image-analyze",
      { urls: selectedImageUrls, primaryImageUrl, backgroundColor: backgroundColor ?? null, twoPiece: Boolean(twoPiece) },
      () =>
        twoPiece
          ? analyzeTwoPieceSetToPrompt(primaryImageUrl)
          : selectedImageUrls.length >= 2
          ? analyzeFrontBackGarmentToPrompt(selectedImageUrls[0], selectedImageUrls[1], {
              backgroundColor,
            })
          : analyzeGarmentToPrompt(primaryImageUrl, { backgroundColor })
    );
    return NextResponse.json({ ok: true, prompt });
  } catch (err: any) {
    console.error("[analyze] error:", err);
    return NextResponse.json(
      { ok: false, error: err?.message ?? "Analysis failed" },
      { status: 500 }
    );
  }
}
