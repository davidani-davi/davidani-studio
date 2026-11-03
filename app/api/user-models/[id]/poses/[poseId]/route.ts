import { NextResponse } from "next/server";
import { listUserModels, removePosePhoto, setUserModelPoses, storePosePhoto } from "@/lib/user-assets";
import { authorized, unauthorized } from "@/lib/request-auth";
import { detectAutoContour } from "@/lib/draft-contour";
import { groundPhrase } from "@/lib/fal";
import { referencePixels } from "@/lib/garment-only";
import { imageExt, makeThumb } from "@/lib/pose-upload";
import { carryOutline, outlineOrigin, withNewOutline, withReplacedPhoto, withUndonePhoto } from "@/lib/pose-replace";
import type { ReferencePixels } from "@/lib/garment-only";
import type { UserPose } from "@/lib/user-poses";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_BYTES = 25 * 1024 * 1024;
const who = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 80) : "Model Studio");

/** The photo the pose's outline was drawn on, with its pixels; null pixels when it had no outline. Throws when it cannot be read. */
async function originOf(pose: UserPose, base: string) {
  const origin = outlineOrigin(pose);
  let ref: ReferencePixels | null = null;
  if (origin.contour) {
    const res = await fetch(new URL(origin.url, base), { cache: "no-store" });
    if (!res.ok) throw Error(`HTTP ${res.status}`);
    ref = await referencePixels(Buffer.from(await res.arrayBuffer()));
  }
  return { ...origin, ref };
}
const ORIGIN_UNREADABLE = "Studio could not open the photo this pose's face outline was drawn on, so it cannot check the new photo. Try again.";

/**
 * PATCH /api/user-models/<id>/poses/<poseId> `{ removed: true, by? }` — Remove this pose, for everyone, logged with
 * who and when; it is never picked again and the set's default views move off it. `{ removed: false }` puts it back.
 * The set's last live front cannot be removed (delete the set instead). `{ undo: true }` puts back the photo the last
 * Replace photo replaced. `{ outline: "refit", autoOutline? }` checks the photo's face outline again against the photo
 * it was drawn on (free) and moves or keeps it; when it cannot, the reply is 409 `needsAutoOutline` unless
 * `autoOutline: true` lets Studio find a new one (one paid fal Florence-2 call).
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string; poseId: string }> }) {
  if (!(await authorized(req))) return unauthorized();
  const { id, poseId } = await params;
  const body = await req.json().catch(() => null);
  if (body?.undo === true) return undoReplace(id, poseId);
  if (body?.outline === "refit") return refitOutline(req, id, poseId, body.autoOutline === true);
  if (typeof body?.removed !== "boolean") {
    return NextResponse.json({ ok: false, error: "Send { removed: true } to remove this pose, or { undo: true } to undo a Replace photo." }, { status: 400 });
  }
  const by = who(body.by);
  try {
    const model = (await listUserModels()).find((m) => m.id === id);
    if (!model) return NextResponse.json({ ok: false, error: "No saved set with that id." }, { status: 404 });
    const pose = model.poses?.find((p) => p.id === poseId);
    if (!pose) return NextResponse.json({ ok: false, error: "This set has no pose with that id." }, { status: 404 });
    if (Boolean(pose.removed) === body.removed) return NextResponse.json({ ok: true, pose, unchanged: true });
    const poses = model.poses!.map((p) => {
      if (p.id !== poseId) return p;
      if (body.removed) return { ...p, removed: { by, at: new Date().toISOString() } };
      const { removed: _removed, ...kept } = p;
      return kept;
    });
    let saved;
    try {
      saved = await setUserModelPoses(model, poses);
    } catch (err: any) {
      return NextResponse.json({ ok: false, error: err?.message ?? "Could not change this pose." }, { status: 409 });
    }
    console.info(`[user-models] pose ${body.removed ? "removed" : "restored"}`, { set: id, pose: poseId, by });
    return NextResponse.json({ ok: true, pose: saved.poses?.find((p) => p.id === poseId), views: saved.views });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message ?? "Failed to change the pose" }, { status: 500 });
  }
}

async function refitOutline(req: Request, id: string, poseId: string, autoOutline: boolean) {
  try {
    const model = (await listUserModels()).find((m) => m.id === id);
    const pose = model?.poses?.find((p) => p.id === poseId);
    if (!model || !pose) return NextResponse.json({ ok: false, error: "No saved set or pose with that id." }, { status: 404 });
    let ref, origin;
    try {
      const res = await fetch(new URL(pose.url, req.url), { cache: "no-store" });
      if (!res.ok) throw Error(`HTTP ${res.status}`);
      ref = await referencePixels(Buffer.from(await res.arrayBuffer()));
      origin = await originOf(pose, req.url);
    } catch {
      return NextResponse.json({ ok: false, error: ORIGIN_UNREADABLE }, { status: 502 });
    }
    const carried = await carryOutline(origin, ref);
    let next: UserPose;
    if ("use" in carried) next = withNewOutline(pose, carried.use, carried.carried);
    else if (!autoOutline) return NextResponse.json({ ok: false, needsAutoOutline: true, reason: carried.needsAuto }, { status: 409 });
    else {
      const found = await detectAutoContour(new URL(pose.url, req.url).toString(), pose.view, { referencePixels, ground: groundPhrase }).catch(() => null);
      if (!found || found.sha256 !== ref.sha256) return NextResponse.json({ ok: false, error: "Studio could not find a face outline on this photo." }, { status: 422 });
      next = withNewOutline(pose, found);
    }
    let saved;
    try {
      saved = await setUserModelPoses(model, model.poses!.map((p) => (p.id === poseId ? next : p)));
    } catch (err: any) {
      return NextResponse.json({ ok: false, error: err?.message ?? "Could not save the outline." }, { status: 409 });
    }
    console.info("[user-models] pose outline refit", { set: id, pose: poseId, outline: "use" in carried ? (carried.carried.moved ? "moved" : "kept") : "auto" });
    return NextResponse.json({ ok: true, pose: saved.poses?.find((p) => p.id === poseId), views: saved.views });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message ?? "Failed to check the outline" }, { status: 500 });
  }
}

async function undoReplace(id: string, poseId: string) {
  try {
    const model = (await listUserModels()).find((m) => m.id === id);
    const pose = model?.poses?.find((p) => p.id === poseId);
    if (!model || !pose) return NextResponse.json({ ok: false, error: "No saved set or pose with that id." }, { status: 404 });
    const undone = withUndonePhoto(pose);
    if (!undone) return NextResponse.json({ ok: false, error: "This photo was never replaced." }, { status: 409 });
    let saved;
    try {
      saved = await setUserModelPoses(model, model.poses!.map((p) => (p.id === poseId ? undone : p)));
    } catch (err: any) {
      return NextResponse.json({ ok: false, error: err?.message ?? "Could not undo." }, { status: 409 });
    }
    console.info("[user-models] pose photo restored", { set: id, pose: poseId });
    return NextResponse.json({ ok: true, pose: saved.poses?.find((p) => p.id === poseId), views: saved.views });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message ?? "Failed to undo" }, { status: 500 });
  }
}

/**
 * POST /api/user-models/<id>/poses/<poseId> multipart `file` (PNG, JPEG or WebP), `by?`, `autoOutline?` — Replace
 * photo: the edited photo becomes this pose's photo for everyone; the one it replaces is kept for Undo. The photo's
 * face outline is carried over only when the face it marks is in the new photo (an edit of the same shot, or the same
 * shot resized or shifted; lib/pose-replace.ts). Otherwise the reply is 409 `{ needsAutoOutline: true, reason }` and
 * nothing is saved; sending again with `autoOutline=1` lets Studio find a new outline (one fal Florence-2 call, which
 * costs money, so it only runs when asked).
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string; poseId: string }> }) {
  if (!(await authorized(req))) return unauthorized();
  const { id, poseId } = await params;
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!file || typeof file === "string" || typeof file.arrayBuffer !== "function") {
    return NextResponse.json({ ok: false, error: "Attach the new photo as file." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) return NextResponse.json({ ok: false, error: "The photo is over 25 MB." }, { status: 413 });
  const bytes = Buffer.from(await file.arrayBuffer());
  const ext = imageExt(bytes);
  if (!ext) return NextResponse.json({ ok: false, error: "Send a PNG, JPEG or WebP photo." }, { status: 400 });
  const by = who(form?.get("by"));
  const autoOutline = form?.get("autoOutline") === "1";
  let stored: { url: string; thumbUrl?: string } | null = null;
  try {
    const model = (await listUserModels()).find((m) => m.id === id);
    if (!model) return NextResponse.json({ ok: false, error: "No saved set with that id." }, { status: 404 });
    const pose = model.poses?.find((p) => p.id === poseId);
    if (!pose) return NextResponse.json({ ok: false, error: "This set has no pose with that id." }, { status: 404 });
    let ref;
    try {
      ref = await referencePixels(bytes);
    } catch (err: any) {
      return NextResponse.json({ ok: false, error: err?.message ?? "Could not read that photo." }, { status: 400 });
    }
    let origin;
    try {
      origin = await originOf(pose, req.url);
    } catch {
      return NextResponse.json({ ok: false, error: ORIGIN_UNREADABLE }, { status: 502 });
    }
    const carried = await carryOutline(origin, ref);
    if ("needsAuto" in carried && !autoOutline) {
      return NextResponse.json({ ok: false, needsAutoOutline: true, reason: carried.needsAuto }, { status: 409 });
    }
    stored = await storePosePhoto(id, poseId, bytes, ext, await makeThumb(bytes));
    let contour = "use" in carried ? carried.use : null;
    if (!contour) {
      const found = await detectAutoContour(new URL(stored.url, req.url).toString(), pose.view, { referencePixels, ground: groundPhrase }).catch(() => null);
      if (!found || found.sha256 !== ref.sha256) {
        await removePosePhoto(stored.url);
        if (stored.thumbUrl) await removePosePhoto(stored.thumbUrl);
        return NextResponse.json({ ok: false, error: "Studio could not find a face outline on the new photo, so it was not saved." }, { status: 422 });
      }
      contour = found;
    }
    const next = withReplacedPhoto(pose, { ...stored, contour, ...("use" in carried ? { carried: carried.carried } : {}) }, by);
    let saved;
    try {
      saved = await setUserModelPoses(model, model.poses!.map((p) => (p.id === poseId ? next : p)));
    } catch (err: any) {
      await removePosePhoto(stored.url);
      if (stored.thumbUrl) await removePosePhoto(stored.thumbUrl);
      return NextResponse.json({ ok: false, error: err?.message ?? "Could not save the new photo." }, { status: 409 });
    }
    console.info("[user-models] pose photo replaced", { set: id, pose: poseId, by, outline: "use" in carried ? (carried.carried.moved ? "moved" : "kept") : "auto" });
    return NextResponse.json({ ok: true, pose: saved.poses?.find((p) => p.id === poseId), views: saved.views });
  } catch (err: any) {
    if (stored) {
      await removePosePhoto(stored.url);
      if (stored.thumbUrl) await removePosePhoto(stored.thumbUrl);
    }
    return NextResponse.json({ ok: false, error: err?.message ?? "Failed to replace the photo" }, { status: 500 });
  }
}
