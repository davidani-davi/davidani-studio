import { NextResponse } from "next/server";
import { cleanupCloudHistory } from "@/lib/cloud-history";

export const runtime = "nodejs";

export async function GET() {
  try {
    const result = await cleanupCloudHistory();
    return NextResponse.json({ ok: true, ...result });
  } catch (err: any) {
    console.error("[api/history/cleanup] failed:", err);
    return NextResponse.json({
      ok: false,
      recoverable: true,
      error: err?.message || "Cloud history cleanup temporarily unavailable.",
      removed: 0,
      remaining: 0,
    });
  }
}

export async function POST() {
  try {
    const result = await cleanupCloudHistory();
    return NextResponse.json({ ok: true, ...result });
  } catch (err: any) {
    console.error("[api/history/cleanup] failed:", err);
    return NextResponse.json({
      ok: false,
      recoverable: true,
      error: err?.message || "Cloud history cleanup temporarily unavailable.",
      removed: 0,
      remaining: 0,
    });
  }
}
