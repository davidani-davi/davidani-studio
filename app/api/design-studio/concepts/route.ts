import { NextResponse } from "next/server";
import { generateProductDesignConcepts } from "@/lib/fal";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: Request) {
  try {
    const { imageUrl, refinement } = (await req.json()) as {
      imageUrl?: string;
      refinement?: string;
    };
    if (!imageUrl || typeof imageUrl !== "string") {
      return NextResponse.json(
        { ok: false, error: "imageUrl is required" },
        { status: 400 }
      );
    }

    const result = await generateProductDesignConcepts(
      imageUrl,
      typeof refinement === "string" ? refinement : undefined
    );
    return NextResponse.json({ ok: true, result });
  } catch (err: any) {
    console.error("[api/design-studio/concepts]", err);
    return NextResponse.json(
      { ok: false, error: err?.message || "Product design generation failed" },
      { status: 500 }
    );
  }
}
