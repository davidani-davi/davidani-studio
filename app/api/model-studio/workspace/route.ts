import { NextResponse } from "next/server";
import { authorized, unauthorized } from "@/lib/request-auth";
import { normalizeStyle } from "@/lib/saved-shots";
import { MAX_WORKSPACE_BYTES, WorkspaceConflict, readWorkspace, writeWorkspace } from "@/lib/model-studio/workspace-store";

export const runtime = "nodejs";

/**
 * The web Model Studio's setup per style, so a refresh or another device opens the same run.
 *
 *   GET ?style=DT78080                  → { ok, style, revision, savedAt, studio }  (revision 0, studio null = never saved)
 *   PUT { style, revision, studio }     → { ok, style, revision, savedAt }
 *                                       → 409 { ok:false, error:"conflict", current } when revision is not the newest
 */
const bad = (error: string, status = 400) => NextResponse.json({ ok: false, error }, { status });

export async function GET(req: Request) {
  if (!(await authorized(req))) return unauthorized();
  const style = normalizeStyle(new URL(req.url).searchParams.get("style"));
  if (!style) return bad("style must be an ERP style code");
  try {
    const record = await readWorkspace(style);
    return NextResponse.json({ ok: true, style, revision: record?.revision ?? 0, savedAt: record?.savedAt ?? null, studio: record?.studio ?? null });
  } catch (err) {
    return bad(String((err as Error)?.message || err), 502);
  }
}

export async function PUT(req: Request) {
  if (!(await authorized(req))) return unauthorized();
  const text = await req.text();
  if (text.length > MAX_WORKSPACE_BYTES) return bad("workspace is too large", 413);
  let body: { style?: unknown; revision?: unknown; studio?: unknown } | null = null;
  try {
    body = JSON.parse(text);
  } catch {
    return bad("body must be JSON");
  }
  const style = normalizeStyle(body?.style);
  if (!style) return bad("style must be an ERP style code");
  const revision = body?.revision;
  if (typeof revision !== "number" || !Number.isInteger(revision) || revision < 0) return bad("revision must be a whole number");
  if (!body?.studio || typeof body.studio !== "object" || Array.isArray(body.studio)) return bad("studio must be an object");
  try {
    const saved = await writeWorkspace(style, revision, body.studio);
    return NextResponse.json({ ok: true, style, revision: saved.revision, savedAt: saved.savedAt });
  } catch (err) {
    if (err instanceof WorkspaceConflict) return NextResponse.json({ ok: false, error: "conflict", current: err.current }, { status: 409 });
    return bad(String((err as Error)?.message || err), 502);
  }
}
