import { NextResponse } from "next/server";
import { upsertAbPreferenceEvent, type AbSelection } from "@/lib/ab-testing";

export const runtime = "nodejs";
export const maxDuration = 60;

function isSelection(value: unknown): value is AbSelection {
  return value === "left" || value === "right" || value === "no_preference";
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const selected = body?.selected_image;
    if (!isSelection(selected)) {
      return NextResponse.json(
        { ok: false, error: "selected_image must be left, right, or no_preference" },
        { status: 400 }
      );
    }
    const generationId = String(body?.generation_id || "");
    if (!generationId) {
      return NextResponse.json(
        { ok: false, error: "generation_id is required" },
        { status: 400 }
      );
    }

    const event = await upsertAbPreferenceEvent({
      user_id: String(body?.user_id || "anonymous"),
      generation_id: generationId,
      timestamp: new Date().toISOString(),
      selected_image: selected,
      prompt_used: String(body?.prompt_used || ""),
      version: "1.7",
    });

    return NextResponse.json({ ok: true, event });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || "A/B event capture failed" },
      { status: 500 }
    );
  }
}
