import { NextResponse } from "next/server";
import {
  buildFrontBackContractPrompt,
  buildTwoImagePrompt,
  buildTwoPiecePrompt,
  extractCatalogGarmentFields,
  extractTwoPieceFields,
} from "@/lib/fal";
import { inferCategory, resolveCanvas, type GarmentCategory } from "@/lib/canvas-registry";
import { cachedVision } from "@/lib/vision-cache";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * Analyze the uploaded garment photo(s) and return everything the client needs
 * to pick a canvas and generate against it.
 *
 * Two things changed shape here, both for the same reason — the canvas is now
 * chosen from the garment's category, and the category is only known after the
 * vision call:
 *
 *  1. The VISION step is cached on its own, keyed only on the image URLs and
 *     the two-piece flag. Prompt assembly is pure and cheap, so it happens
 *     outside the cache. Previously the cache key included backgroundMode,
 *     which meant the same photo cost a second vision round-trip just to be
 *     described against a different canvas.
 *
 *  2. Both canvas variants of the prompt are returned. A run can need both at
 *     once — a front/back contract run for a category with an approved front
 *     canvas but no approved back one renders the front in "preserve" mode and
 *     the back against the empty sweep in "backdrop" mode. Assembling both is
 *     free; making the client guess is not.
 */
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
      return NextResponse.json({ ok: false, error: "imageUrl is required" }, { status: 400 });
    }

    const primaryImageUrl = selectedImageUrls[0] || imageUrl;
    const isContract = selectedImageUrls.length >= 2;

    // --- vision (cached) -----------------------------------------------------
    const extracted = await cachedVision(
      "image-analyze-fields",
      {
        urls: selectedImageUrls,
        primaryImageUrl,
        twoPiece: Boolean(twoPiece),
        contract: isContract,
      },
      async () => {
        if (twoPiece) {
          return { kind: "two-piece" as const, set: await extractTwoPieceFields(primaryImageUrl) };
        }
        if (isContract) {
          const [front, back] = await Promise.all([
            extractCatalogGarmentFields(selectedImageUrls[0], "analyze-front"),
            extractCatalogGarmentFields(selectedImageUrls[1], "analyze-back"),
          ]);
          return { kind: "contract" as const, front, back };
        }
        return {
          kind: "single" as const,
          single: await extractCatalogGarmentFields(primaryImageUrl),
        };
      }
    );

    // --- category ------------------------------------------------------------
    // Inferred from the GARMENT line only, never the assembled prompt: the
    // template's own layout clause names "tops:", "pants:" and "dresses and
    // skirts", so matching against the full prompt would classify everything.
    const category: GarmentCategory =
      extracted.kind === "two-piece"
        ? "set"
        : inferCategory(
            extracted.kind === "contract" ? extracted.front.garment : extracted.single.garment
          );

    // --- assembly (pure, both canvas variants) -------------------------------
    const assemble = (mode: "preserve" | "backdrop") => {
      if (extracted.kind === "two-piece") return buildTwoPiecePrompt(extracted.set, mode);
      if (extracted.kind === "contract") {
        return buildFrontBackContractPrompt(extracted.front, extracted.back, mode);
      }
      return buildTwoImagePrompt(extracted.single.garment, extracted.single.features, mode);
    };
    const promptByMode = { preserve: assemble("preserve"), backdrop: assemble("backdrop") };

    const frontCanvas = resolveCanvas(category, "front");
    const backCanvas = resolveCanvas(category, "back");

    console.log(
      `[analyze] category=${category} front=${frontCanvas.path} back=${backCanvas.path} ` +
        `fallback(front=${frontCanvas.isFallback}, back=${backCanvas.isFallback})`
    );

    return NextResponse.json({
      ok: true,
      // Default prompt matches the front canvas, which is what a single-front
      // run uses. Callers needing the other view read promptByMode directly.
      prompt: promptByMode[frontCanvas.mode],
      promptByMode,
      category,
      canvas: { front: frontCanvas, back: backCanvas },
      // Unused by the current UI, kept so the response shape stays honest about
      // what the legacy field meant.
      backgroundColor: backgroundColor ?? null,
    });
  } catch (err: any) {
    console.error("[analyze] error:", err);
    return NextResponse.json(
      { ok: false, error: err?.message ?? "Analysis failed" },
      { status: 500 }
    );
  }
}
