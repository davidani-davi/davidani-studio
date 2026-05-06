import { NextResponse } from "next/server";
import {
  appendActivityEvent,
  cleanupActivityFeed,
  deleteActivityFeed,
  readActivityFeed,
  type ActivityStudio,
} from "@/lib/cloud-activity";

export const runtime = "nodejs";

const VALID_STUDIOS = new Set<ActivityStudio>([
  "image",
  "model",
  "model-beta",
  "prompt",
  "techpack",
  "library",
  "system",
]);

function parseUserId(value: unknown): string {
  return typeof value === "string" && value.trim() ? value.trim() : "team";
}

function parseActor(value: unknown): string {
  return typeof value === "string" && value.trim() ? value.trim() : "Team";
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const events = await readActivityFeed({ userId: parseUserId(url.searchParams.get("userId")) });
    return NextResponse.json({ ok: true, events });
  } catch (err: any) {
    console.error("[api/activity] load failed; returning empty fallback:", err);
    return NextResponse.json({
      ok: false,
      recoverable: true,
      error: err?.message || "Activity feed temporarily unavailable.",
      events: [],
    });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const studio = VALID_STUDIOS.has(body?.studio) ? (body.studio as ActivityStudio) : "system";
    const action = typeof body?.action === "string" && body.action.trim() ? body.action.trim() : "";
    if (!action) {
      return NextResponse.json({ ok: false, error: "Activity action is required." }, { status: 400 });
    }
    const event = await appendActivityEvent({
      userId: parseUserId(body?.userId),
      actor: parseActor(body?.actor),
      studio,
      action,
      target: typeof body?.target === "string" ? body.target : undefined,
      metadata:
        body?.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata)
          ? body.metadata
          : undefined,
    });
    return NextResponse.json({ ok: true, event });
  } catch (err: any) {
    console.error("[api/activity] append failed:", err);
    return NextResponse.json({
      ok: false,
      recoverable: true,
      error: err?.message || "Activity feed sync temporarily unavailable.",
    });
  }
}

export async function DELETE(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    await deleteActivityFeed({ userId: parseUserId(body?.userId) });
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("[api/activity] clear failed:", err);
    return NextResponse.json({
      ok: false,
      recoverable: true,
      error: err?.message || "Activity feed clear temporarily unavailable.",
    });
  }
}

export async function PATCH() {
  try {
    const result = await cleanupActivityFeed();
    return NextResponse.json({ ok: true, ...result });
  } catch (err: any) {
    console.error("[api/activity] cleanup failed:", err);
    return NextResponse.json({
      ok: false,
      recoverable: true,
      error: err?.message || "Activity feed cleanup temporarily unavailable.",
    });
  }
}
