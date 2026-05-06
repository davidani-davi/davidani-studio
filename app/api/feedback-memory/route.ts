import { NextResponse } from "next/server";
import {
  addCloudFeedbackMemory,
  readCloudFeedbackMemory,
} from "@/lib/cloud-feedback-memory";
import type { FeedbackMemoryItem, FeedbackStudio } from "@/lib/feedback-memory";

export const runtime = "nodejs";

const VALID_STUDIOS = new Set<FeedbackStudio>(["image", "model", "model-beta"]);

function parseStudio(value: unknown): FeedbackStudio | undefined {
  return typeof value === "string" && VALID_STUDIOS.has(value as FeedbackStudio)
    ? (value as FeedbackStudio)
    : undefined;
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const items = await readCloudFeedbackMemory(parseStudio(url.searchParams.get("studio")));
    return NextResponse.json({ ok: true, items });
  } catch (err: any) {
    console.error("[api/feedback-memory] load failed:", err);
    return NextResponse.json({
      ok: false,
      recoverable: true,
      error: err?.message || "Feedback memory temporarily unavailable.",
      items: [],
    });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const item = body?.item as FeedbackMemoryItem | undefined;
    if (!item?.id || !Array.isArray(item.issueKeys)) {
      return NextResponse.json(
        { ok: false, error: "Valid feedback memory item is required." },
        { status: 400 }
      );
    }
    const saved = await addCloudFeedbackMemory(item);
    return NextResponse.json({ ok: true, item: saved });
  } catch (err: any) {
    console.error("[api/feedback-memory] save failed:", err);
    return NextResponse.json({
      ok: false,
      recoverable: true,
      error: err?.message || "Feedback memory save temporarily unavailable.",
    });
  }
}
