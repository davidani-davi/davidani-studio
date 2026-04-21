// kie.ai backend for Nano Banana 2 (Gemini 3.1 Flash Image).
//
// We moved off fal.ai's `fal-ai/nano-banana/edit` endpoint because that slug
// serves an older Nano Banana (Gemini 2.0 Flash) variant, which produces
// noticeably darker output and drops small repeated details like fringe.
// kie.ai proxies the current Nano Banana 2 model directly, matching what
// users get when hitting kie.ai's playground.
//
// API flow (async task-create + poll):
//   1. POST https://api.kie.ai/api/v1/jobs/createTask
//      { model, input: { prompt, <image_field>, aspect_ratio, output_format } }
//      → { code: 200, data: { taskId } }
//      NOTE: the reference-image field name depends on the model:
//        nano-banana-2           → "image_input" (array, up to 14 refs)
//        google/nano-banana-edit → "image_urls"  (array)
//      Using the wrong field silently falls back to text-to-image.
//   2. GET  https://api.kie.ai/api/v1/jobs/recordInfo?taskId=<id>
//      → { code: 200, data: { state, resultJson, failMsg, ... } }
//      Poll every few seconds until state === "success" | "fail".
//   3. Parse data.resultJson → { resultUrls: string[] }.
//
// Auth: Authorization: Bearer <KIE_AI_API_KEY>
//
// Limitation: result URLs expire ~24h after generation. For long-term
// persistence the caller can download & re-host; the UI surfaces the URL
// immediately so users can save images while they're fresh.

const KIE_BASE = "https://api.kie.ai/api/v1/jobs";

export interface KieGenerateParams {
  /** Text prompt. */
  prompt: string;
  /** Input image URLs (canvas first, references after) — up to 10. */
  imageUrls: string[];
  /** Number of output variants. Implemented by parallel task-creates. */
  numImages?: number;
  /** Aspect ratio (passes through as kie.ai's `aspect_ratio`). */
  aspectRatio?: string;
  /** Output format — kie.ai accepts "png" | "jpeg". */
  format?: "png" | "jpeg";
  /** kie.ai model identifier — defaults to "nano-banana-2". */
  model?: string;
}

export interface KieImage {
  url: string;
  width?: number;
  height?: number;
  content_type?: string;
}

export interface KieGenerationResult {
  images: KieImage[];
  /** Array of task IDs, one per variant — useful for tracing. */
  taskIds: string[];
}

function ensureConfigured(): string {
  const key = process.env.KIE_AI_API_KEY;
  if (!key || !key.trim()) {
    throw new Error(
      "KIE_AI_API_KEY is not set. Add KIE_AI_API_KEY=<your kie.ai key> to .env.local and restart the dev server."
    );
  }
  return key;
}

async function createTask(
  key: string,
  model: string,
  input: Record<string, unknown>
): Promise<string> {
  const res = await fetch(`${KIE_BASE}/createTask`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model, input }),
  });
  let body: any;
  try {
    body = await res.json();
  } catch {
    throw new Error(`kie.ai createTask returned non-JSON (HTTP ${res.status})`);
  }
  if (body?.code !== 200 || !body?.data?.taskId) {
    const msg = body?.message || body?.msg || JSON.stringify(body);
    throw new Error(`kie.ai createTask failed (HTTP ${res.status}): ${msg}`);
  }
  return body.data.taskId as string;
}

interface KieRecordInfo {
  state: string; // "success" | "fail" | "waiting" | "running" | ...
  resultJson?: string | Record<string, unknown>;
  failMsg?: string;
  failCode?: string | number;
}

async function fetchRecord(key: string, taskId: string): Promise<KieRecordInfo> {
  const res = await fetch(
    `${KIE_BASE}/recordInfo?taskId=${encodeURIComponent(taskId)}`,
    { headers: { Authorization: `Bearer ${key}` } }
  );
  let body: any;
  try {
    body = await res.json();
  } catch {
    throw new Error(`kie.ai recordInfo returned non-JSON (HTTP ${res.status})`);
  }
  if (body?.code !== 200 || !body?.data) {
    const msg = body?.message || body?.msg || JSON.stringify(body);
    throw new Error(`kie.ai recordInfo failed (HTTP ${res.status}): ${msg}`);
  }
  return body.data as KieRecordInfo;
}

async function pollUntilDone(key: string, taskId: string): Promise<KieImage[]> {
  const POLL_INTERVAL_MS = 3000;
  const MAX_POLLS = 100; // ≈ 5 minutes
  let waited = 0;
  for (let i = 0; i < MAX_POLLS; i++) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    waited += POLL_INTERVAL_MS;
    const info = await fetchRecord(key, taskId);
    if (info.state === "fail") {
      throw new Error(
        `kie.ai task ${taskId} failed: ${info.failMsg || info.failCode || "unknown"}`
      );
    }
    if (info.state === "success") {
      const parsed =
        typeof info.resultJson === "string"
          ? JSON.parse(info.resultJson)
          : info.resultJson;
      const urls: string[] = Array.isArray(parsed?.resultUrls)
        ? parsed.resultUrls
        : [];
      if (urls.length === 0) {
        throw new Error(
          `kie.ai task ${taskId} succeeded but returned no resultUrls`
        );
      }
      return urls.map((url) => ({ url }));
    }
    // otherwise state is pending/running — keep polling
  }
  throw new Error(
    `kie.ai task ${taskId} timed out after ${Math.round(waited / 1000)}s`
  );
}

/**
 * Run one Nano Banana 2 edit via kie.ai.
 *
 * If `numImages > 1`, we create `numImages` parallel tasks (kie.ai does not
 * expose a single-task num_images knob for nano-banana-2) and return a
 * flattened list of result URLs.
 */
export async function generateViaKie(
  params: KieGenerateParams
): Promise<KieGenerationResult> {
  const key = ensureConfigured();
  const model = params.model ?? "nano-banana-2";

  // Build the single-task input payload. IMPORTANT: kie.ai's two nano-banana
  // endpoints use DIFFERENT input field names — sending the wrong one causes
  // the model to silently ignore the reference images and fall back to a
  // text-to-image generation from the prompt alone (why our first attempt
  // produced the right pose/description but the wrong face).
  //
  //   model = "nano-banana-2"           → field is `image_input` (array, up to 14 refs)
  //   model = "google/nano-banana-edit" → field is `image_urls`  (array)
  //
  // Other knobs mirror fal.ai's edit endpoint: optional aspect_ratio,
  // optional output_format, optional resolution.
  const isEditModel = model.includes("nano-banana-edit");
  const imageField = isEditModel ? "image_urls" : "image_input";
  const baseInput: Record<string, unknown> = {
    prompt: params.prompt,
    [imageField]: params.imageUrls,
  };
  if (params.aspectRatio && params.aspectRatio !== "auto") {
    baseInput.aspect_ratio = params.aspectRatio;
  }
  if (params.format) {
    baseInput.output_format = params.format;
  }

  const n = Math.max(1, params.numImages ?? 1);

  console.log(
    `[kie] creating ${n} task(s) on model=${model} with ${params.imageUrls.length} ${imageField}:`
  );
  for (const [i, url] of params.imageUrls.entries()) {
    console.log(`[kie]   ${imageField}[${i}] = ${url}`);
  }

  // Fan out N parallel task creations. If any single task errors, propagate
  // the first failure — the caller's UI already handles generation errors.
  const taskIds = await Promise.all(
    Array.from({ length: n }, () => createTask(key, model, baseInput))
  );
  console.log(
    `[kie] created ${taskIds.length} task(s) on model=${model}: ${taskIds.join(", ")}`
  );

  // Poll all tasks in parallel. Each task returns ≥1 image url (usually 1).
  const perTaskImages = await Promise.all(
    taskIds.map((id) => pollUntilDone(key, id))
  );
  const images = perTaskImages.flat();

  return { images, taskIds };
}
