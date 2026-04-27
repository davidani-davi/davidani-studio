import { NextResponse } from "next/server";
import { renderDesignVisual } from "@/lib/design-studio-render";
import type { ProductDesignConcept } from "@/lib/fal";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      concept?: ProductDesignConcept;
      detectedCategory?: string;
      imageUrl?: string;
    };
    if (!body.concept || !body.detectedCategory || !body.imageUrl) {
      return NextResponse.json(
        { ok: false, error: "concept, detectedCategory, and imageUrl are required" },
        { status: 400 }
      );
    }

    const visualUrl = await renderDesignVisual({
      concept: body.concept,
      detectedCategory: body.detectedCategory,
      imageUrl: body.imageUrl,
    });

    return NextResponse.json({ ok: true, visualUrl });
  } catch (err: any) {
    console.error("[api/design-studio/render]", err);
    return NextResponse.json(
      { ok: false, error: err?.message || "Visual render failed" },
      { status: 503 }
    );
  }
}
