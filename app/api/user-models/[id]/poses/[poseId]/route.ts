import { NextResponse } from "next/server";
import { listUserModels, setUserModelPoses } from "@/lib/user-assets";
import { authorized, unauthorized } from "@/lib/request-auth";

export const runtime = "nodejs";

/**
 * PATCH /api/user-models/<id>/poses/<poseId> `{ removed: true, by? }` — Remove this pose, for everyone, logged with
 * who and when; it is never picked again and the set's default views move off it. `{ removed: false }` puts it back.
 * The set's last live front cannot be removed (delete the set instead).
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string; poseId: string }> }) {
  if (!(await authorized(req))) return unauthorized();
  const { id, poseId } = await params;
  const body = await req.json().catch(() => null);
  if (typeof body?.removed !== "boolean") {
    return NextResponse.json({ ok: false, error: "Send { removed: true } to remove this pose." }, { status: 400 });
  }
  const by = typeof body.by === "string" && body.by.trim() ? body.by.trim().slice(0, 80) : "Model Studio";
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
