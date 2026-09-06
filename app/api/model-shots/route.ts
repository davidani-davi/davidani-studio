import { NextResponse } from "next/server";
import { POST as analyzeModel } from "../analyze-model/route";
import { POST as generateModel } from "../generate-model/route";
import { listAllHumanModels, type PresetView } from "@/lib/models-registry";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import {
  MULTI_MODEL_VIEWS,
  buildMultiModelConsistencySuffix,
  applyPlainBack,
  applyStyling,
  buildMultiModelViewSuffix,
  stylingFor,
  buildOperatorNoteSuffix,
  sanitizeOperatorNote,
  mergeMultiModelGarmentIdentity,
  multiModelPoseVariantIndex,
} from "@/lib/multi-model-prompt";
import { optimizePromptForModel } from "@/lib/prompt-strategy";
import { buildGarmentContract, hasKnownFacts, type KnownGarment } from "@/lib/garment-contract";
import { assignPlate } from "@/lib/plate-assign";
import { silhouetteOf } from "@/lib/plate-wear";
import { framingFor, hemFor, isDerivedPlate, plateForFraming, shotCategory, shotViews } from "@/lib/plate-framing";
import { buildTryOnInput, garmentForView, runTryOn, tryOnSeed, type GarmentPhotoType } from "@/lib/tryon-engine";
import { GPT_NATIVE_SIZE, garmentMaskFromDiff, gptVariantOf, leanBrief, maskCoverage } from "@/lib/gpt-variants";
import { uploadToFal } from "@/lib/fal";
import sharp from "sharp";
import { getPosePublicPath, getPoseUrl, isKnownHumanModel } from "@/lib/models-registry";
import { findUserModelViewUrl } from "@/lib/user-assets";
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

/**
 * The plate as a URL the try-on model can fetch — the same resolution rule as
 * /api/generate-model: a user-added model's stored URL, the public path on
 * Vercel, a fal-storage upload in local dev.
 */
async function resolvePlateUrl(
  req: Request, modelId: string, poseId: string, view: PresetView, variantIndex: number
): Promise<string> {
  if (!isKnownHumanModel(modelId)) {
    const userUrl = await findUserModelViewUrl(modelId, view);
    if (userUrl) return userUrl.startsWith("http") ? userUrl : new URL(userUrl, req.url).toString();
  }
  if (process.env.VERCEL) return new URL(getPosePublicPath(modelId, poseId, view, variantIndex), req.url).toString();
  return getPoseUrl(modelId, poseId, view, variantIndex);
}

/** GET — the model catalog the extension's picker shows. */
export async function GET(req: Request) {
  if (!(await authorized(req))) return json({ ok: false, error: "unauthorized" }, 401);
  const models = await listAllHumanModels();
  return json({
    ok: true,
    views: MULTI_MODEL_VIEWS,
    // the crop/low families are the house plates re-framed, never picked by
    // hand — but their fronts ride along as previews, so a picker can show the
    // framing a category will actually shoot on (waist-down for a bottom)
    models: models.filter((m) => m.userAdded || !isDerivedPlate(m.id)).map((m) => {
      const num = /^studio\s*(\d+)$/i.exec(m.id)?.[1];
      const sibling = (family: string) =>
        (num ? models.find((x) => x.id.toLowerCase() === `${family} ${num}`) : undefined)?.poses[0]?.publicPath;
      return {
        id: m.id,
        name: m.name,
        userAdded: Boolean(m.userAdded),
        wears: m.wears,
        lowOk: m.lowOk === true,
        silhouette: m.silhouette,
        poses: m.poses.map((p) => ({
          id: p.id,
          label: p.label,
          preview: p.publicPath,
          previews: { full: p.publicPath, crop: sibling("crop"), low: sibling("low") },
        })),
      };
    }),
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
  let humanModelId: string = body.humanModelId || "";
  let poseId: string = body.poseId || "";
  const view: PresetView = MULTI_MODEL_VIEWS.includes(body.view) ? body.view : "front";
  // Default engine since 2026-09-05: GPT Image 2 at native 2048x3072. David
  // judged the six-style bake-off (GPT "the clear winner") and round two
  // (native size holds the frame the auto size broke on a low plate). Pass
  // modelId: "nano-banana" for the pre-change editor, gptVariant: "auto" for
  // the 1200x1792 benchmark, engine: "tryon" for FASHN.
  const modelId: ModelId = body.modelId || "gpt-image";
  const resolution: string = body.resolution || "4K";
  // What the caller already knows about this style — style code, garment type,
  // the listing title we approved, ERP fabric and colourway. Optional: without
  // it the run behaves exactly as before, on vision alone.
  const known: KnownGarment = (body.known && typeof body.known === "object" ? body.known : {}) as KnownGarment;

  // A Redo's fix note from the extension: what the operator says is wrong
  // with this one view. Empty on a normal run.
  const note = sanitizeOperatorNote(body.note);
  if (!garmentImageUrls.length) return json({ ok: false, error: "garmentImageUrls is required" }, 400);

  // What is being shot decides the views and the plate framing
  // (lib/plate-framing.ts): pants and skirts waist-down, tops and outerwear
  // head-to-thigh, everything else full-length. The extension planned the run
  // with the same rule and says which category it used.
  const category = shotCategory({ ...known, category: body.category ?? (known as { category?: unknown }).category });
  // A long layer (a coat, a longline cardigan) has its hem in every frame, so
  // it is shot on the full-length plate throughout (lib/plate-framing.ts hemFor).
  const hem = hemFor({ ...known, hem: body.hem ?? known.hem });
  known.hem = known.hem || hem;
  const framing = framingFor(category, view, hem);
  const views = shotViews(category);
  const catalogue = await listAllHumanModels();

  /**
   * "auto" assigns the plate from the style code (lib/plate-assign.ts):
   * deterministic, so a style always comes back on the same model, and spread,
   * so the catalogue stops being one woman in one stance under every garment.
   */
  let assigned: string | null = null;
  if (!humanModelId || humanModelId === "auto") {
    const styleCode = String(known.styleCode || body.styleCode || "").trim();
    if (!styleCode) {
      return json({ ok: false, error: "auto model needs a styleCode to assign from" }, 400);
    }
    const choice = assignPlate(styleCode, catalogue, {
      preferPrefix: body.platePrefix, category,
      silhouette: silhouetteOf((known as { title?: unknown }).title ?? body.title),
    });
    if (!choice) return json({ ok: false, error: "no plates installed" }, 500);
    humanModelId = choice.humanModelId;
    poseId = choice.poseId;
    assigned = `${humanModelId} · ${poseId}`;
  }
  if (!humanModelId || !poseId) return json({ ok: false, error: "humanModelId and poseId are required" }, 400);

  // The house plate is full-length; a top's front is shot on its "crop NN"
  // sibling and a pant's on "low NN" -- the same photograph, re-framed. When
  // the family is not installed the full-length plate stands in.
  const plate = plateForFraming(humanModelId, poseId, framing, catalogue);
  humanModelId = plate.humanModelId;
  poseId = plate.poseId;

  /**
   * The try-on engine (lib/tryon-engine.ts): the plate and the garment photo go
   * straight into a purpose-built try-on model — no vision reads, no prompt.
   * The person is kept and only the garment is generated, which is the whole
   * difference between a photograph and a render. Off by default; the
   * extension asks for it with `engine: "tryon"`.
   */
  const engine: "nano" | "tryon" = body.engine === "tryon" ? "tryon" : "nano";
  if (engine === "tryon") {
    try {
      const variantIndex = multiModelPoseVariantIndex(view);
      const plateUrl = await resolvePlateUrl(req, humanModelId, poseId, view, variantIndex);
      const garmentUrl = garmentForView(view, garmentImageUrls);
      const styleCode = String(known.styleCode || body.styleCode || "").trim();
      const photoType: GarmentPhotoType =
        body.garmentPhotoType === "flat-lay" || body.garmentPhotoType === "model" ? body.garmentPhotoType : "auto";
      const input = buildTryOnInput({
        plateUrl, garmentUrl, category, garmentPhotoType: photoType,
        seed: tryOnSeed(styleCode, view, note),
        samples: Number(body.samples) || 1,
        segmentationFree: body.segmentationFree === true,
      });
      const out = await runTryOn(input);
      return json({
        ok: true, view, url: out.urls[0], urls: out.urls, engine,
        garment: garmentUrl, prompt: "",
        humanModelId, poseId, assigned, category, hem, framing, note: note || undefined,
        corrections: [],
        tryon: { endpoint: out.endpoint, category: input.category, seed: input.seed, ms: out.ms },
      });
    } catch (err: any) {
      return json({ ok: false, view, engine, error: String(err?.message || err) }, 502);
    }
  }

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

    // A long layer's hem is in every frame, so the whole look changes — the
    // coat and the house bottoms under it — not just the upper body: the
    // upper-body scope would order the plate's own trousers kept "as-is".
    const styling = stylingFor(category, hem);
    const analyzeBody = {
      modelId: humanModelId,
      poseId,
      view,
      garmentImageUrl: garmentImageUrls[0],
      garmentImageUrls,
      twoPiece: false,
      promptMode: "classic" as const,
      ...(styling ? { swapScopeOverride: "full-look" as const } : {}),
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

    // The styling goes into the base prompt itself: the GPT optimizer drops
    // everything after the analyzer's negative prompt, suffixes included.
    const basePrompt = applyPlainBack(applyStyling(String(analyzeData.prompt || "").trim(), styling), view, hasBackReference);
    if (!basePrompt) throw new Error(`analyzer returned an empty ${view} prompt`);

    const identity = mergeMultiModelGarmentIdentity(analyzeData);
    const v1Prompt = optimizePromptForModel(
      modelId,
      `${basePrompt}${buildMultiModelConsistencySuffix(identity.garment, identity.features, views)}` +
        `${buildMultiModelViewSuffix(view, hasBackReference, { framing, views, styling })}` +
        `${buildOperatorNoteSuffix(note, view)}`
    );

    // GPT Image 2 variants (lib/gpt-variants.ts). Each isolates one change
    // against the v1 run: the output size, the prompt, or a repaint mask.
    const gptVariant = modelId === "gpt-image" ? gptVariantOf(body.gptVariant ?? "native4k") : "auto";
    let prompt = v1Prompt;
    let rawPrompt = false;
    let imageSize: { width: number; height: number } | undefined;
    let maskUrl: string | undefined;
    let canvasImageUrl: string | undefined;
    let maskInfo: { coverage: number; tryonMs: number } | undefined;
    if (gptVariant === "native4k" || gptVariant === "lean") imageSize = { ...GPT_NATIVE_SIZE };
    if (gptVariant === "lean") {
      prompt = leanBrief({
        garment: identity.garment, features: identity.features, category, view,
        hasBackPhoto: hasBackReference, note,
      });
      rawPrompt = true;
    }
    if (gptVariant === "masked") {
      // the try-on's footprint on this plate is the region a garment occupies
      const variantIndex = multiModelPoseVariantIndex(view);
      const plateUrl = await resolvePlateUrl(req, humanModelId, poseId, view, variantIndex);
      const tryon = await runTryOn(buildTryOnInput({
        plateUrl, garmentUrl: garmentForView(view, garmentImageUrls), category,
        seed: tryOnSeed(String(known.styleCode || body.styleCode || ""), view, note),
      }));
      const [plateBuf, tryonBuf] = await Promise.all(
        [plateUrl, tryon.urls[0]].map(async (u) => Buffer.from(await (await fetch(u)).arrayBuffer()))
      );
      const size = { ...GPT_NATIVE_SIZE };
      const [plateUp, mask] = await Promise.all([
        sharp(plateBuf).resize(size.width, size.height, { fit: "fill", kernel: "lanczos3" }).jpeg({ quality: 95 }).toBuffer(),
        garmentMaskFromDiff(plateBuf, tryonBuf, { size }),
      ]);
      const [plateUpUrl, maskUp] = await Promise.all([
        uploadToFal(new Blob([Uint8Array.from(plateUp)], { type: "image/jpeg" }), "plate-4k.jpg"),
        uploadToFal(new Blob([Uint8Array.from(mask)], { type: "image/png" }), "garment-mask.png"),
      ]);
      canvasImageUrl = plateUpUrl;
      maskUrl = maskUp;
      maskInfo = { coverage: await maskCoverage(mask), tryonMs: tryon.ms };
    }

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
      ...(rawPrompt ? { rawPrompt: true } : {}),
      ...(imageSize ? { imageSize } : {}),
      ...(maskUrl ? { maskUrl } : {}),
      ...(canvasImageUrl ? { canvasImageUrl } : {}),
    });

    const url = generated?.images?.[0]?.url;
    if (typeof url !== "string") throw new Error(`${view} view did not return an image`);

    return json({
      ok: true, view, url, prompt,
      ...(gptVariant !== "auto" ? { gptVariant, ...(maskInfo ? { mask: maskInfo } : {}) } : {}),
      garment: identity.garment,
      humanModelId, poseId, assigned, category, hem, framing, note: note || undefined,
      // What the known facts changed, so a wrong contract is visible in the
      // panel and countable in the eval rather than silent.
      corrections: contract?.corrections ?? [],
    });
  } catch (err: any) {
    return json({ ok: false, view, error: String(err?.message || err) }, 502);
  }
}
