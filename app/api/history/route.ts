import { NextResponse } from "next/server";
import {
  deleteCloudHistory,
  readCloudHistory,
  setCloudHistoryPinned,
  upsertCloudHistory,
  type CloudHistoryStudio,
} from "@/lib/cloud-history";
import type { HistoryItem } from "@/components/types";

export const runtime = "nodejs";

const VALID_STUDIOS = new Set<CloudHistoryStudio>(["image", "model", "model-beta"]);

function parseStudio(value: unknown): CloudHistoryStudio | null {
  return typeof value === "string" && VALID_STUDIOS.has(value as CloudHistoryStudio)
    ? (value as CloudHistoryStudio)
    : null;
}

function parseUserId(value: unknown): string {
  return typeof value === "string" && value.trim() ? value.trim() : "team";
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const studio = parseStudio(url.searchParams.get("studio"));
    if (!studio) {
      return NextResponse.json({ ok: false, error: "Valid studio is required." }, { status: 400 });
    }
    const userId = parseUserId(url.searchParams.get("userId"));
    const records = await readCloudHistory({ studio, userId });
    return NextResponse.json({
      ok: true,
      records,
      history: records.map((record) => record.item),
    });
  } catch (err: any) {
    console.error("[api/history] load failed; returning empty fallback:", err);
    return NextResponse.json({
      ok: false,
      recoverable: true,
      error: err?.message || "Cloud history temporarily unavailable.",
      records: [],
      history: [],
    });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const studio = parseStudio(body?.studio);
    const item = body?.item as HistoryItem | undefined;
    if (!studio || !item?.id) {
      return NextResponse.json(
        { ok: false, error: "Valid studio and history item are required." },
        { status: 400 }
      );
    }
    const record = await upsertCloudHistory({
      studio,
      userId: parseUserId(body?.userId),
      item,
      retentionDays: Number(body?.retentionDays) || undefined,
      pinned: typeof body?.pinned === "boolean" ? body.pinned : undefined,
    });
    return NextResponse.json({ ok: true, record });
  } catch (err: any) {
    console.error("[api/history] sync failed; preserving local browser history only:", err);
    return NextResponse.json({
      ok: false,
      recoverable: true,
      error: err?.message || "Cloud history sync temporarily unavailable.",
    });
  }
}

export async function PATCH(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const studio = parseStudio(body?.studio);
    if (!studio || typeof body?.id !== "string") {
      return NextResponse.json(
        { ok: false, error: "Valid studio and history id are required." },
        { status: 400 }
      );
    }
    const record = await setCloudHistoryPinned({
      studio,
      userId: parseUserId(body?.userId),
      itemId: body.id,
      pinned: Boolean(body?.pinned),
      retentionDays: Number(body?.retentionDays) || undefined,
    });
    if (!record) {
      return NextResponse.json({ ok: false, error: "History item not found." }, { status: 404 });
    }
    return NextResponse.json({ ok: true, record });
  } catch (err: any) {
    console.error("[api/history] pin update failed:", err);
    return NextResponse.json({
      ok: false,
      recoverable: true,
      error: err?.message || "Cloud history pin update temporarily unavailable.",
    });
  }
}

export async function DELETE(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const studio = parseStudio(body?.studio);
    if (!studio) {
      return NextResponse.json({ ok: false, error: "Valid studio is required." }, { status: 400 });
    }
    await deleteCloudHistory({
      studio,
      userId: parseUserId(body?.userId),
      itemId: typeof body?.id === "string" ? body.id : undefined,
    });
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("[api/history] delete failed:", err);
    return NextResponse.json({
      ok: false,
      recoverable: true,
      error: err?.message || "Cloud history delete temporarily unavailable.",
    });
  }
}
