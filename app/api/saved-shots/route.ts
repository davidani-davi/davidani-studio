import { NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import {
  collectGarbage,
  dropShot,
  listSavedStyles,
  normalizeStyle,
  normalizeView,
  readSavedStyle,
  saveShots,
  type SaveInput,
} from "@/lib/saved-shots";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Saved model shots per style. Token-gated like /api/model-shots (the
 * extension's studio key, or a shell with DAVIDANI_STUDIO_PASSWORD), or the
 * studio's own session cookie.
 *
 *   GET    ?style=DT78080          → { ok, style, shots }
 *   GET                            → { ok, styles: [{ style, count, updatedAt }] }
 *   POST   { style, shots: [{ view, url, humanModelId?, engine?, note?, by? }] }
 *                                  → { ok, style, shots, added, failed } (422 when nothing could be saved)
 *   DELETE { style, id }           → { ok, style, shots }
 *   DELETE { gc: true }            → { ok, removed: [pathnames] }  (orphaned images, legacy index)
 */
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

const bad = (error: string, status = 400) => NextResponse.json({ ok: false, error }, { status });

export async function GET(req: Request) {
  if (!(await authorized(req))) return bad("unauthorized", 401);
  const url = new URL(req.url);
  const raw = url.searchParams.get("style");
  try {
    if (!raw) return NextResponse.json({ ok: true, styles: await listSavedStyles() });
    const style = normalizeStyle(raw);
    if (!style) return bad("style must be an ERP style code");
    const entry = await readSavedStyle(style);
    return NextResponse.json({ ok: true, style, shots: entry.shots, updatedAt: entry.updatedAt });
  } catch (err: any) {
    return bad(String(err?.message || err), 500);
  }
}

export async function POST(req: Request) {
  if (!(await authorized(req))) return bad("unauthorized", 401);
  const body = await req.json().catch(() => null);
  const style = normalizeStyle(body?.style);
  if (!style) return bad("style must be an ERP style code");
  const list = Array.isArray(body?.shots) ? body.shots : [];
  const inputs: SaveInput[] = [];
  for (const s of list) {
    const view = normalizeView(s?.view);
    const url = typeof s?.url === "string" ? s.url.trim() : "";
    if (!view || !/^https?:\/\//.test(url)) continue;
    inputs.push({
      view, url,
      humanModelId: typeof s.humanModelId === "string" ? s.humanModelId : undefined,
      engine: typeof s.engine === "string" ? s.engine : undefined,
      note: typeof s.note === "string" ? s.note : undefined,
      by: typeof s.by === "string" ? s.by : undefined,
    });
  }
  if (!inputs.length) return bad("shots must list at least one { view, url }");
  if (inputs.length > 16) return bad("at most 16 shots per save");
  try {
    const { entry, added, failed } = await saveShots(style, inputs);
    // Nothing saved and something failed = the caller's request failed (a
    // dead render URL); a partial save still answers ok with `failed` listed.
    if (!added.length && failed.length) {
      return NextResponse.json({ ok: false, error: `not saved — ${failed.map((f) => `${f.view}: ${f.error}`).join("; ")}`, failed, style, shots: entry.shots }, { status: 422 });
    }
    return NextResponse.json({ ok: true, style, shots: entry.shots, added, failed, updatedAt: entry.updatedAt });
  } catch (err: any) {
    return bad(String(err?.message || err), 500);
  }
}

export async function DELETE(req: Request) {
  if (!(await authorized(req))) return bad("unauthorized", 401);
  const url = new URL(req.url);
  const body = await req.json().catch(() => ({}));
  if (body?.gc === true) {
    try {
      return NextResponse.json({ ok: true, removed: await collectGarbage() });
    } catch (err: any) {
      return bad(String(err?.message || err), 500);
    }
  }
  const style = normalizeStyle(body?.style ?? url.searchParams.get("style"));
  const id = String(body?.id ?? url.searchParams.get("id") ?? "").trim();
  if (!style || !id) return bad("style and id are required");
  try {
    const entry = await dropShot(style, id);
    return NextResponse.json({ ok: true, style, shots: entry.shots });
  } catch (err: any) {
    return bad(String(err?.message || err), 500);
  }
}
