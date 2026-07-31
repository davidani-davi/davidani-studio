import { NextResponse } from "next/server";
import { generatePhotoshootPrompts } from "@/lib/fal";
import { getPhotoshootReference } from "@/lib/photoshoot-references";
import { getPhotoshootVariation } from "@/lib/photoshoot-variations";

export const runtime = "nodejs";
export const maxDuration = 180;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { imageUrl, imageUrls, referenceId, referenceUrl, count = 3, direction = "balanced", variationIndex = 0 } = body as {
      imageUrl?: string;
      imageUrls?: string[];
      referenceId?: string;
      referenceUrl?: string;
      count?: number;
      direction?: string;
      variationIndex?: number;
    };
    const productImageUrls = Array.isArray(imageUrls)
      ? imageUrls.filter((url): url is string => typeof url === "string" && Boolean(url.trim())).slice(0, 6)
      : imageUrl
      ? [imageUrl]
      : [];
    if (!productImageUrls.length) {
      return NextResponse.json({ ok: false, error: "A garment image is required" }, { status: 400 });
    }
    const reference = getPhotoshootReference(String(referenceId || ""));
    const resolvedReferenceUrl = reference
      ? new URL(reference.url, req.url).toString()
      : typeof referenceUrl === "string" && referenceUrl.trim()
      ? referenceUrl.trim()
      : null;
    if (!resolvedReferenceUrl) {
      return NextResponse.json({ ok: false, error: "Select a photoshoot reference" }, { status: 400 });
    }
    const safeCount = Math.max(1, Math.min(6, Math.round(Number(count) || 3)));
    const variation = getPhotoshootVariation(Number(variationIndex));
    const prompts = await generatePhotoshootPrompts({
      productImageUrls,
      referenceImageUrl: resolvedReferenceUrl,
      count: safeCount,
      direction: ["candid", "editorial", "balanced"].includes(direction) ? direction : "balanced",
      shotVariation: variation.instruction,
    });
    return NextResponse.json({ ok: true, prompts, shotVariation: variation.label });
  } catch (err: any) {
    console.error("[prompt-studio/photoshoot] error:", err);
    return NextResponse.json(
      { ok: false, error: err?.message ?? "Photoshoot prompt generation failed" },
      { status: 500 }
    );
  }
}
