import { NextResponse } from "next/server";
import { listUserModels } from "@/lib/user-assets";
import { authorized, unauthorized } from "@/lib/request-auth";
import { defaultPoses, isLivePose, slotPoses, type PoseSlot, type UserPose } from "@/lib/user-poses";

export const runtime = "nodejs";

const SLOTS: PoseSlot[] = ["front", "side", "back", "full"];

/**
 * GET /api/user-models/<id>/poses?view=side — the live poses a view of a recast set can shoot on, with tags and
 * thumbnails (the Other pose sheet). Without `view`, every pose of the set, failing and removed ones included, with
 * why (for the reference library).
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await authorized(req))) return unauthorized();
  const { id } = await params;
  const view = new URL(req.url).searchParams.get("view") || "";
  if (view && !SLOTS.includes(view as PoseSlot)) {
    return NextResponse.json({ ok: false, error: "view must be front, side, back or full." }, { status: 400 });
  }
  try {
    const model = (await listUserModels()).find((m) => m.id === id);
    if (!model) return NextResponse.json({ ok: false, error: "No saved set with that id." }, { status: 404 });
    const poses = model.poses || [];
    const defaults = defaultPoses(poses);
    const row = (p: UserPose) => ({
      id: p.id, view: p.view, framing: p.framing, stance: p.stance, arms: p.arms, url: p.url, thumbUrl: p.thumbUrl,
      default: SLOTS.filter((s) => defaults[s] === p),
      ...(view ? {} : { live: isLivePose(p), checks: { pass: p.checks?.pass === true, outline: p.checks?.outline }, removed: p.removed, source: p.source }),
    });
    const list = view ? slotPoses(poses, view as PoseSlot) : poses;
    return NextResponse.json({ ok: true, id: model.id, name: model.name, ...(view ? { view } : {}), poses: list.map(row) });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message ?? "Failed to list poses" }, { status: 500 });
  }
}
