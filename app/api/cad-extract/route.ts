import { NextResponse, after } from "next/server";
import { generate } from "@/lib/fal";
import { MODELS, type ModelId } from "@/lib/models";
import { buildCadPrompt, type CadMode } from "@/lib/cad-prompts";
import { readCadTask, writeCadTask } from "@/lib/cad-tasks";

export const runtime = "nodejs";
export const maxDuration = 800;

// Async task pattern: POST returns a task id immediately and the generation
// runs in after() (up to maxDuration). GPT Image 2 holds 5-8 min at 2K, and
// a fetch that waits on the response gets killed by the browser at ~4-5 min
// ("Failed to fetch") — losing a paid, completed run. The client polls GET
// with the task id instead; no connection is held open longer than a poll.

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { modelId, mode, imageUrls, notes, resolution, format, numImages } = body as {
      modelId: ModelId;
      mode: CadMode;
      imageUrls: string[];
      notes?: string;
      resolution?: string;
      format?: "png" | "jpeg";
      numImages?: number;
    };

    if (!modelId || !MODELS[modelId]) {
      return NextResponse.json({ ok: false, error: "Invalid modelId" }, { status: 400 });
    }
    if (mode !== "flat" && mode !== "seamless") {
      return NextResponse.json({ ok: false, error: "Invalid mode" }, { status: 400 });
    }
    if (!imageUrls?.length) {
      return NextResponse.json(
        { ok: false, error: "At least one garment image is required" },
        { status: 400 }
      );
    }

    const taskId = crypto.randomUUID();
    const now = Date.now();
    await writeCadTask({ id: taskId, kind: "extract", status: "running", createdAt: now, updatedAt: now });

    after(async () => {
      try {
        const result = await generate({
          modelId,
          prompt: buildCadPrompt(mode, notes),
          imageUrls,
          // Sandboxed extraction: edit from the uploaded garment photo(s) only.
          raw: true,
          useDefaultReference: false,
          referenceImageUrl: null,
          aspectRatio: "1:1",
          resolution: resolution ?? "2K",
          format: format ?? "png",
          numImages: numImages ?? 1,
          // No server-side resize: the sharp crop-to-2048 + JPEG re-encode +
          // re-upload round-trip added seconds per run and silently converted the
          // requested PNG into JPEG q92 — a quality loss for print masters. The
          // export route reads actual pixel dimensions and produces the final
          // print PNG itself, so native model output is returned directly.
          outputSize: null,
        });
        await writeCadTask({
          id: taskId,
          kind: "extract",
          status: "done",
          createdAt: now,
          updatedAt: Date.now(),
          images: result.images,
        });
      } catch (err: any) {
        console.error("[cad-extract] task error:", err);
        await writeCadTask({
          id: taskId,
          kind: "extract",
          status: "failed",
          createdAt: now,
          updatedAt: Date.now(),
          error: err?.message ?? "CAD extraction failed",
        });
      }
    });

    return NextResponse.json({ ok: true, taskId });
  } catch (err: any) {
    console.error("[cad-extract] error:", err);
    return NextResponse.json(
      { ok: false, error: err?.message ?? "CAD extraction failed" },
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
    console.error("[cad-extract] status error:", err);
    return NextResponse.json(
      { ok: false, error: err?.message ?? "Status check failed" },
      { status: 500 }
    );
  }
}
