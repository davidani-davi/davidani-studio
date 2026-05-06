import { NextResponse } from "next/server";
import {
  cleanupCloudJobs,
  deleteCloudJob,
  readCloudJobs,
  upsertCloudJob,
  type CloudStudioJob,
  type CloudStudioJobKind,
  type CloudStudioJobStatus,
} from "@/lib/cloud-jobs";

export const runtime = "nodejs";

const VALID_KINDS = new Set<CloudStudioJobKind>([
  "image",
  "model",
  "model-beta",
  "prompt",
  "techpack",
  "library",
]);
const VALID_STATUSES = new Set<CloudStudioJobStatus>([
  "queued",
  "analyzing",
  "generating",
  "saving",
  "done",
  "failed",
]);

function parseUserId(value: unknown): string {
  return typeof value === "string" && value.trim() ? value.trim() : "team";
}

function parseJob(value: any): CloudStudioJob | null {
  if (!value?.id || !VALID_KINDS.has(value.kind) || !VALID_STATUSES.has(value.status)) {
    return null;
  }
  const now = Date.now();
  return {
    id: String(value.id),
    kind: value.kind,
    label: typeof value.label === "string" && value.label.trim() ? value.label.trim() : "Studio job",
    status: value.status,
    startedAt: Number(value.startedAt) || now,
    updatedAt: Number(value.updatedAt) || now,
    userId: parseUserId(value.userId),
    historyKey: typeof value.historyKey === "string" ? value.historyKey : undefined,
    currentIdKey: typeof value.currentIdKey === "string" ? value.currentIdKey : undefined,
    resultId: typeof value.resultId === "string" ? value.resultId : undefined,
    error: typeof value.error === "string" ? value.error : undefined,
  };
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const jobs = await readCloudJobs({ userId: parseUserId(url.searchParams.get("userId")) });
    return NextResponse.json({ ok: true, jobs });
  } catch (err: any) {
    console.error("[api/jobs] load failed; returning empty fallback:", err);
    return NextResponse.json({
      ok: false,
      recoverable: true,
      error: err?.message || "Cloud jobs temporarily unavailable.",
      jobs: [],
    });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const job = parseJob(body?.job);
    if (!job) {
      return NextResponse.json({ ok: false, error: "Valid job is required." }, { status: 400 });
    }
    const record = await upsertCloudJob(job);
    return NextResponse.json({ ok: true, job: record });
  } catch (err: any) {
    console.error("[api/jobs] sync failed; preserving browser job queue only:", err);
    return NextResponse.json({
      ok: false,
      recoverable: true,
      error: err?.message || "Cloud job sync temporarily unavailable.",
    });
  }
}

export async function DELETE(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    await deleteCloudJob({
      userId: parseUserId(body?.userId),
      id: typeof body?.id === "string" ? body.id : undefined,
    });
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("[api/jobs] delete failed:", err);
    return NextResponse.json({
      ok: false,
      recoverable: true,
      error: err?.message || "Cloud job delete temporarily unavailable.",
    });
  }
}

export async function PATCH() {
  try {
    const result = await cleanupCloudJobs();
    return NextResponse.json({ ok: true, ...result });
  } catch (err: any) {
    console.error("[api/jobs] cleanup failed:", err);
    return NextResponse.json({
      ok: false,
      recoverable: true,
      error: err?.message || "Cloud job cleanup temporarily unavailable.",
    });
  }
}
