import { NextResponse } from "next/server";
import { deleteUserModel, listUserModels, saveUserModel, setUserModelContours } from "@/lib/user-assets";
import { detectAutoContour } from "@/lib/draft-contour";
import { referencePixels } from "@/lib/garment-only";
import { groundPhrase } from "@/lib/fal";
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
    if (name.startsWith("Draft · ")) {
      const views = (["front", "side", "back", "full"] as const).filter((v) => model.views[v]);
      const found = await Promise.all(views.map((v) =>
        detectAutoContour(model.views[v]!, v, { referencePixels, ground: groundPhrase }).catch((e) => {
          console.warn("[user-models] draft outline failed", v, e?.message);
          return null;
        })));
      const contours = Object.fromEntries(views.flatMap((v, i) => (found[i] ? [[v, found[i]]] : [])));
      const saved = await setUserModelContours(model, contours);
      return NextResponse.json({ ok: true, model: saved, outlines: Object.fromEntries(views.map((v, i) => [v, found[i]?.kind ?? "missing"])) });
    }
    return NextResponse.json({ ok: true, model });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message ?? "Failed to save model" },
      { status: 500 }
    );
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
