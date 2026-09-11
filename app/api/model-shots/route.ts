import { isPantsReference, pantsReferences } from "@/lib/pants-references";
import { simpleReferenceShot, simpleFaceMask, SIMPLE_IMAGE_SIZE } from '@/lib/simple-reference-shot';
import sharp from 'sharp';
import { referencePixels, validateEdit, editMask, compositeGarment, providerMask, donutsFaceMask } from '@/lib/garment-only';
import { uploadToFal } from '@/lib/fal';
import { buildReferenceShot, runReferenceShot, NANO_REFERENCE_MODEL } from '@/lib/nano-reference-shots';
import { viewReference, referenceCoverage } from '@/lib/view-reference';
import { NextResponse, after } from "next/server";
import { readShotTask, writeShotTask, createShotTask, isSafeTaskId } from "@/lib/shot-tasks";
import { createHash } from "node:crypto";
import { POST as generateModel } from "../generate-model/route";
import { listAllHumanModels, plateTagStats, getPoseUrl, type PresetView } from "@/lib/models-registry";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { MULTI_MODEL_VIEWS, sanitizeOperatorNote } from "@/lib/multi-model-prompt";
import type { KnownGarment } from "@/lib/garment-contract";
import { assignPlate } from "@/lib/plate-assign";
import { silhouetteOf } from "@/lib/plate-wear";
import { framingFor, hemFor, isDerivedPlate, shotCategory } from "@/lib/plate-framing";
import { buildTryOnInput, garmentForView, runTryOn, tryOnSeed } from "@/lib/tryon-engine";
import { GPT_NATIVE_SIZE } from "@/lib/gpt-variants";
import { houseFaceOf, noPlateQualityOf, noPlateVariantOf, shootNoPlate, shootReference } from "@/lib/no-plate";
import { isGptModel } from "@/lib/models";

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
 * Each view is one independent native edit from its exact view reference and
 * original garment photographs. No generated-front anchor, analyzer rewrite,
 * restoration, sharpening, or resizing runs on the reference-set path.
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
  // ?taskId= polls a shot started with `async: true` (lib/shot-tasks.ts)
  const taskId = new URL(req.url).searchParams.get("taskId");
  if (taskId) {
    const task = await readShotTask(taskId);
    if (!task) return json({ ok: false, error: "task not found" }, 404);
    return json({ ok: true, task });
  }
  const models = await listAllHumanModels();
  const requestedReference = new URL(req.url).searchParams.get("referencePath");
  if (requestedReference) {
    // Only installed model assets can be inspected; never fetch an arbitrary URL.
    const pathname = requestedReference.split('?')[0];
    const permitted = models.some(m => m.poses.some(p => Object.values(p.views).some(f => f?.publicPath === pathname)));
    if (!permitted) return json({ ok:false,error:"Unknown model reference." },400);
    try {
      const url = new URL(requestedReference,req.url).href;
      const response = await fetch(url,{cache:'no-store'});
      if (!response.ok) throw Error('Reference could not be loaded.');
      const ref = await referencePixels(Buffer.from(await response.arrayBuffer()));
      return json({ok:true,referencePath:requestedReference,url,width:ref.width,height:ref.height,sha256:ref.sha256});
    } catch (e:any) { return json({ok:false,error:e.message},400); }
  }
  return json({
    ok: true,
    views: MULTI_MODEL_VIEWS,
    plateTags: plateTagStats(),
    // the crop/low families are the house plates re-framed, never picked by
    // hand — but their fronts ride along as previews, so a picker can show the
    // framing a category will actually shoot on (waist-down for a bottom)
    models: models.filter((m) => m.userAdded || !isDerivedPlate(m.id)).map((m) => {
      return {
        id: m.id,
        name: m.name,
        categories: isPantsReference(m.id) ? ["pants"] : undefined,
        referenceKind: isPantsReference(m.id) ? "pants" : undefined,
        userAdded: Boolean(m.userAdded),
        managed: Boolean(m.managed),
        wears: m.wears,
        lowOk: m.lowOk === true,
        silhouette: m.silhouette,
        // the house character's tags (plates.json via lib/plate-wear.ts), so a
        // picker can fold the plates into one card per pose with the
        // expressions inside, and keep the wardrobe variants off the front row
        ...(m.character ? { character: m.character } : {}),
        ...(m.expression ? { expression: m.expression } : {}),
        ...(m.poseKey ? { poseKey: m.poseKey } : {}),
        ...(m.pose ? { pose: m.pose } : {}),
        autoPool: m.autoPool !== false,
        poses: m.poses.map((p) => {
          const references = referenceCoverage(models, m.id, p.id);
          return ({
          id: p.id,
          label: p.label,
          preview: p.publicPath,
          references,
          previews: { full: references.full.front?.publicPath || p.publicPath, crop: references.crop.front?.publicPath, low: references.low.front?.publicPath },
        }); }),
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

  if (body.view === "full" && (isPantsReference(body.humanModelId) || shotCategory({...body.known, category: body.category ?? body.known?.category}) === "pants"))
    return json({ok:false,error:"Pants generate front, side and back only."},400);

  /**
   * `async: true` — answer with a task id now, render after the response and
   * keep the outcome in lib/shot-tasks.ts for GET ?taskId= to hand back. A
   * view with a fal retry or two runs past 300 s, and the held connection is
   * cut there whatever maxDuration says; the render itself may take the
   * whole 800 s inside after().
   */
  if (body.async === true) {
    if (body.requestId != null && (typeof body.requestId !== "string" || !isSafeTaskId(body.requestId)))
      return json({ ok: false, error: "invalid requestId" }, 400);
    const id = body.requestId || crypto.randomUUID();
    // The exact saved request is resent on recovery; changed inputs require a
    // new ID. The reservation prevents parallel devices from scheduling twice.
    const requestFingerprint = createHash("sha256").update(JSON.stringify(body)).digest("hex");
    const view = String(MULTI_MODEL_VIEWS.includes(body.view) ? body.view : "front");
    const createdAt = Date.now();
    const reserved = await createShotTask({ id, status: "running", view, createdAt, updatedAt: createdAt, requestFingerprint });
    if (!reserved) {
      const existing = await readShotTask(id);
      if (!existing) return json({ ok: false, error: "request reserved; retry the same request shortly" }, 503);
      if (existing.requestFingerprint !== requestFingerprint)
        return json({ ok: false, error: "requestId already used with different inputs" }, 409);
      return json({ ok: true, taskId: id, view: existing.view, status: existing.status });
    }
    after(async () => {
      let result: Record<string, unknown>;
      try {
        const res = await renderShot(req, body);
        result = await res.json().catch(() => ({ ok: false, view, error: `model-shots answered ${res.status}` }));
      } catch (err: any) {
        result = { ok: false, view, error: String(err?.message || err) };
      }
      await writeShotTask({ id, status: result.ok ? "done" : "failed", view, createdAt, updatedAt: Date.now(), result, requestFingerprint });
    });
    return json({ ok: true, taskId: id, view });
  }
  return renderShot(req, body);
}

/** One view, start to finish: the synchronous POST body. */
async function renderShot(req: Request, body: any): Promise<Response> {
  if (body.editMode && !['simple','native','garment-only','face-locked'].includes(body.editMode)) return json({ok:false,error:'Choose a valid editing mode.'},400);
  const simple = body.editMode === 'simple';
  if (simple && (body.engine === 'tryon' || body.reference || String(body.humanModelId || '').startsWith('face:'))) return json({ok:false,error:'Simple garment swap needs a matching model reference and GPT or Nano.'},400);
  const faceLocked = body.editMode === 'face-locked';
  const locked = body.editMode === 'garment-only' || faceLocked;
  if (locked && (body.engine === 'tryon' || body.engine === 'nano' || (body.modelId && !['gpt-image','gpt-image-25'].includes(body.modelId))))
    return json({ok:false,error:'Garment-only mode currently supports GPT 2.5 and GPT 2. Your chosen engine was not changed.'},400);
  if (locked && (body.humanModelId === 'auto' || String(body.humanModelId||'').startsWith('face:') || body.reference))
    return json({ok:false,error:'Choose an explicit view reference and review its edit area.'},400);
  const garmentImageUrls: string[] = (body.garmentImageUrls || []).filter(
    (u: unknown): u is string => typeof u === "string" && u.length > 0
  );
  let humanModelId: string = body.humanModelId || "";
  let poseId: string = body.poseId || "";
  const view: PresetView = MULTI_MODEL_VIEWS.includes(body.view) ? body.view : "front";
  const engines: Record<string, string> = { gpt25: "gpt-image-25", gpt2: "gpt-image", nano: NANO_REFERENCE_MODEL };
  if (body.engine && body.engine !== "tryon" && !engines[body.engine])
    return json({ ok: false, error: "Choose a supported image engine." }, 400);
  if (body.modelId && engines[body.engine] && body.modelId !== engines[body.engine])
    return json({ ok: false, error: "Engine and model selections conflict. Choose the image model again." }, 400);
  const modelId: string = body.modelId || engines[body.engine] || "gpt-image-25";
  const nanoReference = modelId === NANO_REFERENCE_MODEL;
  // What the caller already knows about this style — style code, garment type,
  // the listing title we approved, ERP fabric and colourway. Optional: without
  // it the run behaves exactly as before, on vision alone.
  const known: KnownGarment = (body.known && typeof body.known === "object" ? body.known : {}) as KnownGarment;

  // A Redo's fix note from the extension: what the operator says is wrong
  // with this one view. Empty on a normal run.
  const note = sanitizeOperatorNote(body.note);
  // The set's rendered FRONT, for the views shot after it (ANCHOR_RULE): the
  // extension shoots the front first and hands its URL to the other three.
  const anchorImageUrl: string =
    typeof body.anchorImageUrl === "string" && /^https?:\/\//.test(body.anchorImageUrl) && view !== "front"
      ? body.anchorImageUrl
      : "";
  // House reference set (lib/no-plate.ts shootReference): the model herself in
  // the house outfit, no garment photo. `engine: "gpt25", reference: true`.
  if (body.engine === "gpt25" && body.reference === true) {
    const face = houseFaceOf(body.face) ?? houseFaceOf(humanModelId) ?? "vision";
    try {
      return json(await shootReference({
        origin: new URL(req.url).origin, face, variant: noPlateVariantOf(body.variant),
        quality: noPlateQualityOf(body.quality), view, note, anchorImageUrl,
      }));
    } catch (err: any) {
      return json({ ok: false, view, engine: "gpt25", face, reference: true, error: String(err?.message || err) }, 502);
    }
  }
  if (!garmentImageUrls.length) return json({ ok: false, error: "garmentImageUrls is required" }, 400);

  // What is being shot decides the views and the plate framing
  // (lib/plate-framing.ts): pants and skirts waist-down, tops and outerwear
  // head-to-thigh, everything else full-length. The extension planned the run
  // with the same rule and says which category it used.
  const category = shotCategory({ ...known, category: body.category ?? (known as { category?: unknown }).category });
  if (category === "pants" && view === "full")
    return json({ ok: false, error: "Pants generate front, side and back only." }, 400);
  // A long layer (a coat, a longline cardigan) has its hem in every frame, so
  // it is shot on the full-length plate throughout (lib/plate-framing.ts hemFor).
  const hem = hemFor({ ...known, hem: body.hem ?? known.hem });
  known.hem = known.hem || hem;
  const framing = framingFor(category, view, hem);


  /**
   * The no-plate path (lib/no-plate.ts, 2026-09-08): GPT Image 2.5 renders
   * the frame from the house face references and the garment photo. No plate
   * is assigned, no analyzer runs and there is nothing to restore onto; the
   * anchor still rides last for the views after the front. The extension asks
   * for it with `engine: "gpt25"` and names the face (`face` or the picker's
   * humanModelId "face:vision"); the variant is flare unless asked otherwise.
   */
  if (body.engine === "gpt25" && humanModelId.startsWith("face:")) {
    const face = houseFaceOf(body.face) ?? houseFaceOf(humanModelId) ?? "vision";
    try {
      return json(await shootNoPlate({
        origin: new URL(req.url).origin, face, variant: noPlateVariantOf(body.variant),
        quality: noPlateQualityOf(body.quality),
        view, framing, category, hem, known, note, garmentImageUrls, anchorImageUrl,
      }));
    } catch (err: any) {
      return json({ ok: false, view, engine: "gpt25", face, error: String(err?.message || err) }, 502);
    }
  }
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
    const choice = assignPlate(styleCode, category === "pants" ? pantsReferences(catalogue) : catalogue.filter(m => !isPantsReference(m.id)), {
      preferPrefix: body.platePrefix, category,
      silhouette: silhouetteOf((known as { title?: unknown }).title ?? body.title),
    });
    if (!choice) return json({ ok: false, error: "no plates installed" }, 500);
    humanModelId = choice.humanModelId;
    poseId = choice.poseId;
    assigned = `${humanModelId} · ${poseId}`;
  }
  if (!humanModelId || !poseId) return json({ ok: false, error: "humanModelId and poseId are required" }, 400);

  if (category === "pants" && !isPantsReference(humanModelId))
    return json({ok:false,error:"Choose a reference from the shared pants collection."},400);
  if (isPantsReference(humanModelId) && category !== "pants")
    return json({ ok: false, error: "This is a pants reference. Choose a model reference for this garment." }, 400);
  if (body.engine !== "tryon" && !nanoReference && !isGptModel(modelId))
    return json({ ok: false, error: `Unsupported image model: ${modelId}` }, 400);

  // Exact view selection happens before any paid request. Never fall back to front.
  let reference;
  try { reference = viewReference(catalogue, humanModelId, poseId, view, framing); }
  catch (err: any) { return json({ ok: false, view, error: err.message }, 400); }
  humanModelId = reference.humanModelId;
  poseId = reference.poseId;
  try {
    const referenceUrl = process.env.VERCEL || /^https?:|^\/user-assets\//.test(reference.publicPath) || catalogue.find(m => m.id === humanModelId)?.userAdded
      ? new URL(reference.publicPath, req.url).toString()
      : await getPoseUrl(humanModelId, poseId, view, 0);
    const input = buildReferenceShot({ view, referenceUrl, garmentImageUrls, category, framing,
      color: typeof known.color === "string" ? known.color : undefined, note });
    const simpleInput = simple ? simpleReferenceShot({ view, referenceUrl, garmentImageUrls, category, framing, color: typeof known.color === 'string' ? known.color : undefined, note, anchorImageUrl, garmentName: typeof known.title === 'string' ? known.title : undefined }) : undefined;
    if (simpleInput) { input.prompt = simpleInput.prompt; input.image_urls = simpleInput.image_urls; }
    let simplePrepared: { ref: Awaited<ReturnType<typeof referencePixels>>; mask: Buffer } | undefined;
    if (simple && ((framing !== 'low' && view !== 'back') || reference.protection)) {
      if (reference.reframed) throw Error('Simple garment swap needs an exact view reference. Choose a complete reference set.');
      const response = await fetch(referenceUrl, {cache:'no-store'});
      if (!response.ok) throw Error('Reference could not be loaded.');
      const ref = await referencePixels(Buffer.from(await response.arrayBuffer()));
      const mask = simpleFaceMask(ref, reference.publicPath, view, framing, reference.protection);
      if (mask) simplePrepared = {ref,mask};
    }
    let preservation: Awaited<ReturnType<typeof compositeGarment>>['report'] | undefined;
    let prepared: { ref: Awaited<ReturnType<typeof referencePixels>>; mask: Buffer; canvasUrl:string; maskUrl:string } | undefined;
    if (locked) {
      if (reference.reframed) throw Error('Garment-only mode needs an exact framing reference. Choose a reference with this view already framed.');
      if(faceLocked && (category!=='pants'||view!=='full'))throw Error('Keep original face is available for DONUTS pants full shots.');
      const e=faceLocked?null:validateEdit(body.garmentEdit);
      if(e && e.referencePath!==reference.publicPath) throw Error('This edit area belongs to another view reference. Review the matching view.');
      const response=await fetch(referenceUrl,{cache:'no-store'});
      if(!response.ok) throw Error('Reference could not be loaded.');
      const ref=await referencePixels(Buffer.from(await response.arrayBuffer()));
      const mask=faceLocked?donutsFaceMask(ref,reference.publicPath):await editMask(e!,ref,framing!=='low');
      const pixels=ref.width*ref.height;
      if(ref.width%16||ref.height%16||Math.max(ref.width,ref.height)>3840||pixels<655360||pixels>8294400)
        throw Error('This reference size is not supported for a native-size garment edit. Choose another reference.');
      const canvas=await sharp(ref.data,{raw:{width:ref.width,height:ref.height,channels:4}}).png().toBuffer();
      const [canvasUrl,maskUrl]=await Promise.all([
        uploadToFal(new Blob([Uint8Array.from(canvas)],{type:'image/png'}),'protected-reference.png'),
        providerMask(mask,ref.width,ref.height).then(b=>uploadToFal(new Blob([Uint8Array.from(b)],{type:'image/png'}),'garment-edit-mask.png'))
      ]);
      prepared={ref,mask,canvasUrl,maskUrl};
      input.prompt=`Edit the original reference photograph. Replace ONLY the ${category === 'pants' || category === 'skirt' ? 'bottoms' : 'garment'} with the garment from the other image. Keep the original pose, arm and hand positions, other clothing, shoes, background and framing. Do not add hands at the waistband or pockets. One person, two arms, two hands. Keep the head unchanged. No sharpening. ${known.color ? 'Garment color: '+known.color+'.' : ''} ${note || ''}`;
    }
    let url: string;
    let outputResolution = simple || nanoReference ? "1K" : "4K";
    if (body.engine === "tryon") {
      // This engine has no prompt/framing control; do not silently substitute it
      // for a selected GPT engine or claim an unavailable pants-only crop.
      if (reference.reframed) return json({ ok: false, error: "Try-on needs a reference with this framing. Choose GPT 2.5 for this view." }, 400);
      const out = await runTryOn(buildTryOnInput({ plateUrl: referenceUrl,
        garmentUrl: garmentForView(view, garmentImageUrls), category,
        seed: tryOnSeed(String(known.styleCode || ""), view, note), samples: 1 }));
      url = out.urls[0]; outputResolution = "native";
    } else if (nanoReference) {
      url = (await runReferenceShot(input)).url;
    } else {
      const res = await generateModel(new Request(new URL("/api/generate-model", req.url), {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modelId, humanModelId, poseId, view,
          canvasImageUrl: prepared?.canvasUrl || referenceUrl, garmentImageUrls: simpleInput?.garmentImageUrls || garmentImageUrls,
          preserveSecondaryReferences: true, rawPrompt: true, prompt: input.prompt,
          imageSize: simple ? SIMPLE_IMAGE_SIZE : prepared ? {width:prepared.ref.width,height:prepared.ref.height} : GPT_NATIVE_SIZE, maskUrl: prepared?.maskUrl, aspectRatio: "2:3", resolution: simple ? "1K" : "4K", format: "png", numImages: 1 }),
      }));
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Image generation failed");
      url = result.images?.[0]?.url;
    }
    if (!url) throw new Error("Image model returned no image");
    const protectedInput = simplePrepared || prepared;
    if(protectedInput) {
      const response=await fetch(url);
      if(!response.ok)throw Error('Generated garment could not be loaded.');
      const composed=await compositeGarment(protectedInput.ref,Buffer.from(await response.arrayBuffer()),protectedInput.mask);
      url=await uploadToFal(new Blob([Uint8Array.from(composed.png)],{type:'image/png'}),'garment-only.png');
      // Verify the hosted delivery too. Never expose the unverified generated frame.
      const hosted=await fetch(url,{cache:'no-store'});
      if(!hosted.ok || !Buffer.from(await hosted.arrayBuffer()).equals(composed.png))throw Error('Hosted protected image verification failed.');
      preservation=composed.report;outputResolution=`${protectedInput.ref.width}×${protectedInput.ref.height}`;
    }
    // Existing mode keeps its native-output behavior. Protected mode returns lossless composition.
    return json({ ok: true, view, url, prompt: input.prompt,
      modelId: body.engine === "tryon" ? undefined : modelId,
      engine: body.engine === "tryon" ? "tryon" : nanoReference ? "nano" : modelId === "gpt-image-25" ? "gpt25" : "gpt2",
      resolution: outputResolution, editMode: simple ? "simple" : faceLocked ? "face-locked" : locked ? "garment-only" : "native", preservation, humanModelId, poseId, assigned, category, hem, framing,
      reference: { ...reference, url: referenceUrl },
      garmentBackInferred: view === "back" && garmentImageUrls.length < 2,
      anchored: Boolean(simpleInput?.anchored), restore: { applied: false }, photoFinish: { method: protectedInput ? "original-face-pixels" : "native", applied: !!protectedInput }, corrections: [] });
  } catch (err: any) {
    return json({ ok: false, view, error: String(err?.message || err) }, 502);
  }
}
