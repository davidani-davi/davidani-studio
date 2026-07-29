import { NextResponse, after } from "next/server";
import { generate } from "@/lib/fal";
import { MODELS, type ModelId } from "@/lib/models";
import { CAD_CLEANUP_PROMPT } from "@/lib/cad-prompts";
import { readCadTask, writeCadTask } from "@/lib/cad-tasks";

export const runtime = "nodejs";
export const maxDuration = 800;

// Async task pattern — same rationale as /api/cad-extract: the generation
// runs in after() and the client polls GET, so no browser connection is held
// open for the multi-minute run.

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { imageUrl, modelId } = body as { imageUrl: string; modelId?: ModelId };

    if (!imageUrl) {
      return NextResponse.json({ ok: false, error: "imageUrl is required" }, { status: 400 });
    }
    const model: ModelId = modelId && MODELS[modelId] ? modelId : "nano-banana";

    const taskId = crypto.randomUUID();
    const now = Date.now();
    await writeCadTask({ id: taskId, kind: "cleanup", status: "running", createdAt: now, updatedAt: now });

    after(async () => {
      try {
        // The result tile is already a fetchable image URL; the cleanup pass edits
        // it in place (no offset — that relocated body construction and added a
        // center seam). The prompt hunts residual hem/stitch lines wherever they
        // are and keeps the result tileable.
        const result = await generate({
          modelId: model,
          prompt: CAD_CLEANUP_PROMPT,
          imageUrls: [imageUrl],
          raw: true,
          useDefaultReference: false,
          referenceImageUrl: null,
          aspectRatio: "1:1",
          resolution: "2K",
          format: "png",
          numImages: 1,
          // Native output, same rationale as /api/cad-extract.
          outputSize: null,
        });
        await writeCadTask({
          id: taskId,
          kind: "cleanup",
          status: "done",
          createdAt: now,
          updatedAt: Date.now(),
          images: result.images,
        });
      } catch (err: any) {
        console.error("[cad-cleanup] task error:", err);
        await writeCadTask({
          id: taskId,
          kind: "cleanup",
          status: "failed",
          createdAt: now,
          updatedAt: Date.now(),
          error: err?.message ?? "Cleanup failed",
        });
      }
    });

    return NextResponse.json({ ok: true, taskId });
  } catch (err: any) {
    console.error("[cad-cleanup] error:", err);
    return NextResponse.json(
      { ok: false, error: err?.message ?? "Cleanup failed" },
      { status: 500 }
    );
  }
}

export async function GET(req: Request) {
  try {
    const taskId = new URL(req.url).searchParams.get("taskId") ?? "";
    if (!taskId) {
      return NextResponse.json({ ok: false, error: "taskId is required" }, { status: 400 });
    }
    const task = await readCadTask(taskId);
    if (!task) {
      return NextResponse.json({ ok: false, error: "Task not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, task });
  } catch (err: any) {
    console.error("[cad-cleanup] status error:", err);
    return NextResponse.json(
      { ok: false, error: err?.message ?? "Status check failed" },
      { status: 500 }
    );
  }
}
