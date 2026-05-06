import { NextResponse } from "next/server";
import { generateBestsellerRemixPrompts } from "@/lib/fal";

export const runtime = "nodejs";
export const maxDuration = 180;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { imageUrl } = body as { imageUrl?: string };

    if (!imageUrl || typeof imageUrl !== "string") {
      return NextResponse.json(
        { ok: false, error: "imageUrl is required" },
        { status: 400 }
      );
    }

    const prompts = await generateBestsellerRemixPrompts(imageUrl);
    return NextResponse.json({ ok: true, prompts });
  } catch (err: any) {
    console.error("[prompt-studio/bestseller-remix] error:", err);
    return NextResponse.json(
      { ok: false, error: err?.message ?? "Bestseller remix prompt generation failed" },
      { status: 500 }
    );
  }
}
