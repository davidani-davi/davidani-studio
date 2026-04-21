import { NextResponse } from "next/server";
import { listHumanModels } from "@/lib/models-registry";

export const runtime = "nodejs";

/**
 * GET /api/models
 *
 * Returns the Model Studio catalog — every human model we have photographs
 * of, and every pose available for each. Client uses this to populate the
 * model picker. No uploads happen here; poses are uploaded lazily to fal.ai
 * only once a user selects one and triggers a generation.
 */
export async function GET() {
  try {
    const models = listHumanModels();
    return NextResponse.json({ ok: true, models });
  } catch (err: any) {
    console.error("[api/models] error:", err);
    return NextResponse.json(
      { ok: false, error: err?.message ?? "Failed to list models" },
      { status: 500 }
    );
  }
}
