import { NextResponse } from "next/server";
import { generateRecoloringPrompts } from "@/lib/fal";

export const runtime = "nodejs";
export const maxDuration = 120;

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

    const prompts = await generateRecoloringPrompts(imageUrl);
    return NextResponse.json({ ok: true, prompts });
  } catch (err: any) {
    console.error("[prompt-studio/recoloring] error:", err);
    return NextResponse.json(
      { ok: false, error: err?.message ?? "Prompt generation failed" },
      { status: 500 }
    );
  }
}
