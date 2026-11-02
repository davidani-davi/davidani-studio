import { NextResponse } from "next/server";
import { deleteUserModel, listUserModels, renameUserModel, saveUserModel, saveUserModelPoses, setUserModelContours } from "@/lib/user-assets";
import { detectAutoContour } from "@/lib/draft-contour";
import { outlineDraftSet } from "@/lib/draft-outlines";
import { referencePixels } from "@/lib/garment-only";
import { groundPhrase, readReferenceView } from "@/lib/fal";
import { authorized, unauthorized } from "@/lib/request-auth";
import { defaultPoses } from "@/lib/user-poses";
import { readIncomingPhoto, removeIncoming } from "@/lib/user-model-upload";
import { poseSummary, preparePoses, PoseUploadError, validatePoseInputs } from "@/lib/pose-upload";

export const runtime = "nodejs";
export const maxDuration = 120;

// Public in proxy.ts so the Listing Team portal (server side, X-DDTO-TOKEN) can save
// draft reference sets; the studio UI still reaches it with its session cookie (lib/request-auth.ts).

const draftDeps = {
  detect: (url: string, view: string) => detectAutoContour(url, view, { referencePixels, ground: groundPhrase }),
  read: readReferenceView,
  save: setUserModelContours,
};

/**
 * A recast look (Chloe recast; faire-management chloe_recast/upload.mjs): JSON `{ name, poses: [{ id, view, framing,
 * stance, arms, url, contour, checks, source }] }` with hosted photo URLs. Each pose keeps its sent `recast-mask-v1`
 * outline only when it matches the photo's pixels (lib/pose-upload.ts); views come from the shoot tags, so nothing is
 * moved. The set is stored live with every pose; poses that fail are kept and never picked.
 */
async function savePoseSet(req: Request) {
  const body = await req.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!name || name.length > 120) {
    return NextResponse.json({ ok: false, error: "A set name of 1-120 characters is required." }, { status: 400 });
  }
  try {
    const prepared = await preparePoses(validatePoseInputs(body?.poses), {
      referencePixels,
      detect: (url, view) => detectAutoContour(url, view, { referencePixels, ground: groundPhrase }),
    });
    const poses = prepared.map((p) => poseSummary(p.pose));
    if (!defaultPoses(prepared.map((p) => ({ ...p.pose, url: "-" }))).front) {
      return NextResponse.json({ ok: false, error: "No front pose passed its checks, so the set would have no front photo.", poses }, { status: 422 });
    }
    return NextResponse.json({ ok: true, model: await saveUserModelPoses(name, prepared), poses });
  } catch (err: any) {
    if (err instanceof PoseUploadError) return NextResponse.json({ ok: false, error: err.message }, { status: err.status });
    throw err;
  }
}

function asImage(value: FormDataEntryValue | null): File | undefined {
  return value instanceof File && value.type.startsWith("image/") ? value : undefined;
}

export async function GET(req: Request) {
  if (!(await authorized(req))) return unauthorized();
  try {
    return NextResponse.json({ ok: true, models: await listUserModels() });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message ?? "Failed to list models" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  if (!(await authorized(req))) return unauthorized();
  const incoming: string[] = [];
  try {
    if ((req.headers.get("content-type") || "").includes("application/json")) return await savePoseSet(req);
    const form = await req.formData();
    const name = String(form.get("name") ?? "").trim();
    if (!name) {
      return NextResponse.json({ ok: false, error: "A model name is required." }, { status: 400 });
    }
    // A view arrives as a file (Listing Team drafts, small photos) or as `<view>Url`, an original the Add model
    // form uploaded straight to storage (lib/user-model-upload.ts), so full-size photos skip the 4.5 MB cap.
    const photo = async (view: "front" | "side" | "back" | "full") => {
      const file = asImage(form.get(view));
      if (file) return file;
      const url = form.get(`${view}Url`);
      if (typeof url !== "string" || !url) return undefined;
      incoming.push(url);
      try {
        return await readIncomingPhoto(url, view);
      } catch (err: any) {
        throw new PhotoError(`${view[0].toUpperCase()}${view.slice(1)} photo: ${err?.message || "could not be read."}`);
      }
    };
    const front = await photo("front");
    if (!front) {
      return NextResponse.json(
        { ok: false, error: "A front photo is required." },
        { status: 400 }
      );
    }
    const model = await saveUserModel(name, {
      front,
      side: await photo("side"),
      back: await photo("back"),
      full: await photo("full"),
    });
    // Listing Team drafts ("Draft · <author> · <name>") get automatic face outlines so Simple garment
    // swap can test them before David approves the set; a view without one is refused at render time.
    // Photos saved under the wrong view are moved first (lib/view-arrange.ts); `arranged` says which.
    // `arrange=0` keeps the views as sent (a one-photo replacement of an installed set).
    if (name.startsWith("Draft · ")) {
      const { model: saved, outlines, arranged } = await outlineDraftSet(model, draftDeps, { arrange: form.get("arrange") !== "0" });
      return NextResponse.json({ ok: true, model: saved, outlines, arranged });
    }
    return NextResponse.json({ ok: true, model });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message ?? "Failed to save model" },
      { status: err instanceof PhotoError ? 400 : 500 }
    );
  } finally {
    await removeIncoming(incoming);
  }
}

class PhotoError extends Error {}

/**
 * Re-detects the face outline of every view of a saved set that has none (`{ id }`), after the outline rule
 * changes. Views that already have an outline keep it untouched, so their renders do not change.
 * `{ id, arrange: true }` first moves photos saved under the wrong view, as a new draft set does on save.
 * `{ id, name }` renames the set instead (a draft keeps its "Draft · " prefix).
 */
export async function PATCH(req: Request) {
  if (!(await authorized(req))) return unauthorized();
  try {
    // {id, name} renames the set (Listing Team portal); {id} alone re-checks the views that have no outline.
    const { id, name, arrange } = await req.json().catch(() => ({} as { id?: string; name?: unknown; arrange?: unknown }));
    const newName = name === undefined ? undefined : typeof name === "string" ? name.trim() : "";
    if (newName !== undefined && (!newName || newName.length > 120)) {
      return NextResponse.json({ ok: false, error: "A set name of 1-120 characters is required." }, { status: 400 });
    }
    const model = (await listUserModels()).find((m) => m.id === id);
    if (!model) return NextResponse.json({ ok: false, error: "No saved set with that id." }, { status: 404 });
    if (newName !== undefined) {
      // The prefix is what keeps a teammate's draft private to its author in Model Studio.
      if (model.name.startsWith("Draft · ") && !newName.startsWith("Draft · ")) {
        return NextResponse.json({ ok: false, error: 'A draft set keeps its "Draft · " prefix.' }, { status: 400 });
      }
      return NextResponse.json({ ok: true, model: await renameUserModel(model, newName) });
    }
    return NextResponse.json({ ok: true, ...(await outlineDraftSet(model, draftDeps, { arrange: arrange === true })) });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message ?? "Failed to re-check outlines" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  if (!(await authorized(req))) return unauthorized();
  try {
    const id = new URL(req.url).searchParams.get("id");
    if (!id) {
      return NextResponse.json({ ok: false, error: "id is required." }, { status: 400 });
    }
    await deleteUserModel(id);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message ?? "Failed to delete model" },
      { status: 500 }
    );
  }
}
