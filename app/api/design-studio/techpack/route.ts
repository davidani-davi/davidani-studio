import { NextResponse } from "next/server";
import { fal } from "@fal-ai/client";

export const runtime = "nodejs";
export const maxDuration = 120;

function extractText(value: unknown): string {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(extractText).filter(Boolean).join("\n");
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    for (const key of ["output", "response", "text", "content", "message"]) {
      const text = extractText(obj[key]);
      if (text) return text;
    }
  }
  return "";
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const concept = body?.concept;
    const imageUrl = String(body?.imageUrl || "");
    if (!concept?.productName || !imageUrl) {
      return NextResponse.json(
        { ok: false, error: "concept and imageUrl are required" },
        { status: 400 }
      );
    }

    const key = process.env.FAL_KEY;
    if (!key) throw new Error("FAL_KEY is not set.");
    fal.config({ credentials: key });

    const result: any = await fal.subscribe("fal-ai/any-llm/vision", {
      input: {
        model: "anthropic/claude-3.7-sonnet",
        image_url: imageUrl,
        system_prompt:
          "You are a senior fashion technical designer creating concise manufacturer-ready techpack notes from a generated product visual and concept brief.",
        prompt:
          `Create a practical first-pass techpack for this product concept.\n\n` +
          `Concept: ${JSON.stringify(concept)}\n\n` +
          `Return plain markdown with these exact sections: Product Overview, CAD Assets Needed, Front Flat CAD Notes, Back Flat CAD Notes, Materials and Trims, Construction Details, Fit and Measurement Checkpoints, Color and Artwork Notes, Manufacturer Questions. ` +
          `Keep it production-minded and specific. Do not invent exact graded specs or fiber percentages unless visually obvious. Include prompts for front and back black-and-white CAD flats that a designer can generate or hand to a CAD artist.`,
      },
      logs: false,
    });

    const data = result?.data ?? result;
    const techpack = extractText(data).trim();
    if (!techpack) throw new Error("Techpack generator returned no text.");

    return NextResponse.json({ ok: true, techpack });
  } catch (err: any) {
    console.error("[api/design-studio/techpack]", err);
    return NextResponse.json(
      { ok: false, error: err?.message || "Techpack generation failed" },
      { status: 500 }
    );
  }
}
