import { NextResponse } from "next/server";
import { resizeGeneratedImages } from "@/lib/fal";
import { IMAGE_STUDIO_OUTPUT_SIZE } from "@/lib/output-sizes";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * Produce the locked 2160x3240 Image Studio final from a native generation
 * URL. Split out of /api/generate (see deferResize there) so the client can
 * show the native image immediately and finalize in the background.
 */
export async function POST(req: Request) {
  try {
    const { imageUrl } = (await req.json()) as { imageUrl?: string };
    if (!imageUrl || typeof imageUrl !== "string") {
      return NextResponse.json({ ok: false, error: "imageUrl is required" }, { status: 400 });
    }
    // normalizeBackground: the model lands a few levels off #edeeee even with
    // a pixel-exact canvas (measured #dfe2e9 on a real run). Snapped here,
    // deterministically, rather than by asking the prompt more nicely.
    const [finalized] = await resizeGeneratedImages(
      [{ url: imageUrl }],
      IMAGE_STUDIO_OUTPUT_SIZE,
      "jpeg",
      { normalizeBackground: true }
    );
    return NextResponse.json({ ok: true, url: finalized.url });
  } catch (err: any) {
    console.error("[finalize-image] error:", err);
    return NextResponse.json(
      { ok: false, error: err?.message ?? "Finalize failed" },
      { status: 500 }
    );
  }
}
