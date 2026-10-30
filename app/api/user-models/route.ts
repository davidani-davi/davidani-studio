import { NextResponse } from "next/server";
import { deleteUserModel, listUserModels, renameUserModel, saveUserModel, setUserModelContours } from "@/lib/user-assets";
import { detectAutoContour } from "@/lib/draft-contour";
import { outlineDraftSet } from "@/lib/draft-outlines";
import { referencePixels } from "@/lib/garment-only";
import { groundPhrase, readReferenceView } from "@/lib/fal";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";

export const runtime = "nodejs";
export const maxDuration = 120;

// Public in proxy.ts so the Listing Team portal (server side, X-DDTO-TOKEN) can save
// draft reference sets; the studio UI still reaches it with its session cookie.
async function authorized(req: Request): Promise<boolean> {
  const expected = process.env.MODEL_SHOTS_TOKEN || process.env.APP_PASSWORD;
  const got = req.headers.get("x-ddto-token") || "";
  if (expected && got.length === expected.length && got === expected) return true;
  const secret = process.env.AUTH_SECRET;
  if (!secret) return false;
  const cookie = req.headers.get("cookie") || "";
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`));
  return match ? verifySessionToken(decodeURIComponent(match[1]), secret) : false;
}
const unauthorized = () => NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

const draftDeps = {
  detect: (url: string, view: string) => detectAutoContour(url, view, { referencePixels, ground: groundPhrase }),
  read: readReferenceView,
  save: setUserModelContours,
};

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
  try {
    const form = await req.formData();
    const name = String(form.get("name") ?? "").trim();
    const front = asImage(form.get("front"));
    if (!name) {
      return NextResponse.json({ ok: false, error: "A model name is required." }, { status: 400 });
    }
    if (!front) {
      return NextResponse.json(
        { ok: false, error: "A front photo is required." },
        { status: 400 }
      );
    }
    const model = await saveUserModel(name, {
      front,
      side: asImage(form.get("side")),
      back: asImage(form.get("back")),
      full: asImage(form.get("full")),
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
      { status: 500 }
    );
  }
}

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
