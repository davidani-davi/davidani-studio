import { NextResponse } from "next/server";
import { POST as analyzeModel } from "../analyze-model/route";
import { POST as generateModel } from "../generate-model/route";
import { listAllHumanModels, type PresetView } from "@/lib/models-registry";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import {
  MULTI_MODEL_VIEWS,
  buildMultiModelConsistencySuffix,
  buildMultiModelViewSuffix,
  mergeMultiModelGarmentIdentity,
  multiModelPoseVariantIndex,
} from "@/lib/multi-model-prompt";
import { optimizePromptForModel } from "@/lib/prompt-strategy";
import { buildGarmentContract, hasKnownFacts, type KnownGarment } from "@/lib/garment-contract";
import type { ModelId } from "@/lib/models";

export const runtime = "nodejs";
export const maxDuration = 800;

/**
 * POST /api/model-shots — one view of the four-view photoshoot, for callers
 * that are not a browser tab on this studio.
 *
 * WHY IT EXISTS
 * -------------
 * The Faire extension works styles that have no photography at all. Multi
 * Model Studio already turns one garment photo into front/side/back/full, but
 * only from its own page, with its own session cookie, driven by hand. This
 * exposes the same run to the extension: one view per call, so the caller can
 * fire all four at once and show each as it lands, and so a single failed view
 * is a retry rather than a lost run.
 *
 * SAME PROMPTS, NOT A COPY
 * ------------------------
 * The analyze and generate steps are the studio's own route handlers, called
 * as functions (no HTTP hop, so no session cookie and no proxy), and the
 * four-view directives come from lib/multi-model-prompt.ts, which the studio
 * client imports too. Nothing about how a shot is asked for lives here.
 *
 * AUTH
 * ----
 * A shared token in X-DDTO-TOKEN, checked against MODEL_SHOTS_TOKEN — or, when
 * that is not set, against APP_PASSWORD, which already unlocks the whole studio
 * and so grants nothing new. That fallback is what lets the extension work
 * without a second secret to deploy and rotate; set MODEL_SHOTS_TOKEN when you
 * want the extension's key to be revocable on its own.
 *
 * A logged-in browser session also gets in, so the route can be exercised from
 * a tab (the proxy skips this path, so the cookie is checked here instead).
 *
 * It fails CLOSED: no configured secret means every call is refused rather than
 * silently open — this route spends money per request.
 */

const CORS = {
  // The caller is a Chrome extension service worker (origin
  // chrome-extension://<id>), which cannot be allow-listed by name across
  // installs. The token is the gate; the origin is not.
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, X-DDTO-TOKEN",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
} as const;

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: CORS });
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

async function authorized(req: Request): Promise<boolean> {
  const expected = process.env.MODEL_SHOTS_TOKEN || process.env.APP_PASSWORD;
  const got = req.headers.get("x-ddto-token") || "";
  // Length first, then a full compare. The values are short and the route is
  // rate-limited by how long a render takes anyway.
  if (expected && got.length === expected.length && got === expected) return true;

  const secret = process.env.AUTH_SECRET;
  if (!secret) return false;
  const cookie = req.headers.get("cookie") || "";
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`));
  return match ? verifySessionToken(decodeURIComponent(match[1]), secret) : false;
}

/** GET — the model catalog the extension's picker shows. */
export async function GET(req: Request) {
  if (!(await authorized(req))) return json({ ok: false, error: "unauthorized" }, 401);
  const models = await listAllHumanModels();
  return json({
    ok: true,
    views: MULTI_MODEL_VIEWS,
    models: models.map((m) => ({
      id: m.id,
      name: m.name,
      userAdded: Boolean(m.userAdded),
      poses: m.poses.map((p) => ({ id: p.id, label: p.label, preview: p.publicPath })),
    })),
  });
}

export async function POST(req: Request) {
  if (!(await authorized(req))) return json({ ok: false, error: "unauthorized" }, 401);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "invalid JSON body" }, 400);
  }

  const garmentImageUrls: string[] = (body.garmentImageUrls || []).filter(
    (u: unknown): u is string => typeof u === "string" && u.length > 0
  );
  const humanModelId: string = body.humanModelId || "";
  const poseId: string = body.poseId || "";
  const view: PresetView = MULTI_MODEL_VIEWS.includes(body.view) ? body.view : "front";
  const modelId: ModelId = body.modelId || "nano-banana";
  const resolution: string = body.resolution || "4K";
  // What the caller already knows about this style — style code, garment type,
  // the listing title we approved, ERP fabric and colourway. Optional: without
  // it the run behaves exactly as before, on vision alone.
  const known: KnownGarment = (body.known && typeof body.known === "object" ? body.known : {}) as KnownGarment;

  if (!garmentImageUrls.length) return json({ ok: false, error: "garmentImageUrls is required" }, 400);
  if (!humanModelId || !poseId) return json({ ok: false, error: "humanModelId and poseId are required" }, 400);

  const origin = new URL(req.url).origin;
  const call = async (
    handler: (r: Request) => Promise<Response>,
    path: string,
    payload: unknown
  ) => {
    const res = await handler(
      new Request(`${origin}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || `${path} failed (${res.status})`);
    return data as any;
  };

  try {
    // The back reference is the second garment photo when there is one — the
    // same contract Multi Model Studio uses: two photos are the front and back
    // of ONE garment, not two garments.
    const hasBackReference = garmentImageUrls.length > 1;

    const analyzeBody = {
      modelId: humanModelId,
      poseId,
      view,
      garmentImageUrl: garmentImageUrls[0],
      garmentImageUrls,
      twoPiece: false,
      promptMode: "classic" as const,
    };
    let analyzeData = await call(analyzeModel, "/api/analyze-model", analyzeBody);

    /**
     * Correct the vision read with what we already know, then rebuild the
     * prompt around the corrected garment.
     *
     * The garment is 13 words of a 1,348-word prompt and everything the render
     * knows about the product rides on them — on DWJ62218 vision read an open
     * placket as a "keyhole cutout" and the cardigan came back a pullover. The
     * style code, the listing title and the ERP already held the answer.
     *
     * The second analyze call is cheap: garmentOverride skips the garment
     * vision pass entirely and the pose read is cached, so this is prompt
     * assembly, not a second look at the photographs.
     */
    let contract: ReturnType<typeof buildGarmentContract> | null = null;
    if (hasKnownFacts(known)) {
      contract = buildGarmentContract(known, {
        garment: String(analyzeData.garment || ""),
        features: String(analyzeData.features || ""),
      });
      analyzeData = await call(analyzeModel, "/api/analyze-model", {
        ...analyzeBody,
        garmentOverride: { garment: contract.garment, features: contract.features },
      });
    }

    const basePrompt = String(analyzeData.prompt || "").trim();
    if (!basePrompt) throw new Error(`analyzer returned an empty ${view} prompt`);

    const identity = mergeMultiModelGarmentIdentity(analyzeData);
    const prompt = optimizePromptForModel(
      modelId,
      `${basePrompt}${buildMultiModelConsistencySuffix(identity.garment, identity.features)}` +
        `${buildMultiModelViewSuffix(view, hasBackReference)}`
    );

    const generated = await call(generateModel, "/api/generate-model", {
      modelId,
      humanModelId,
      poseId,
      view,
      garmentImageUrls,
      aspectRatio: "2:3",
      resolution,
      format: "png",
      numImages: 1,
      poseVariantIndex: multiModelPoseVariantIndex(view),
      preserveSecondaryReferences: hasBackReference,
      prompt,
    });

    const url = generated?.images?.[0]?.url;
    if (typeof url !== "string") throw new Error(`${view} view did not return an image`);

    return json({
      ok: true, view, url, prompt,
      garment: identity.garment,
      // What the known facts changed, so a wrong contract is visible in the
      // panel and countable in the eval rather than silent.
      corrections: contract?.corrections ?? [],
    });
  } catch (err: any) {
    return json({ ok: false, view, error: String(err?.message || err) }, 502);
  }
}
