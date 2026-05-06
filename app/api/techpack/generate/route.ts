import { NextResponse } from "next/server";
import { generateTechpack, type TechpackInput } from "@/lib/fal";

export const runtime = "nodejs";
export const maxDuration = 180;

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as TechpackInput;

    if (!body.imageUrl || typeof body.imageUrl !== "string") {
      return NextResponse.json(
        { ok: false, error: "imageUrl is required" },
        { status: 400 }
      );
    }

    const techpack = await generateTechpack(body);
    return NextResponse.json({ ok: true, techpack });
  } catch (err: any) {
    console.error("[techpack/generate] error:", err);
    return NextResponse.json(
      { ok: false, error: err?.message ?? "Techpack generation failed" },
      { status: 500 }
    );
  }
}
