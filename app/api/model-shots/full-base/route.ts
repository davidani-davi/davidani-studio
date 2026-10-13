import { put } from "@vercel/blob";
import sharp from "sharp";
import { createHash } from "node:crypto";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";

export const runtime = "nodejs";

/**
 * POST — store the operator's own full-body photo for a bottoms full shot
 * (David, 2026-10-13). It is a render base only: kept in Blob, never written
 * into the ERP gallery. Body `{ dataUrl }` (JPEG/PNG/WebP); answers `{ ok, url }`.
 */
async function authorized(req: Request): Promise<boolean> {
  const expected = process.env.MODEL_SHOTS_TOKEN || process.env.APP_PASSWORD;
  const got = req.headers.get("x-ddto-token") || "";
  if (expected && got.length === expected.length && got === expected) return true;
  const secret = process.env.AUTH_SECRET;
  const match = (req.headers.get("cookie") || "").match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`));
  return Boolean(secret && match && (await verifySessionToken(decodeURIComponent(match[1]), secret)));
}

export async function POST(req: Request) {
  if (!(await authorized(req))) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  let body: { dataUrl?: unknown };
  try { body = await req.json(); } catch { return Response.json({ ok: false, error: "invalid JSON body" }, { status: 400 }); }
  const m = typeof body.dataUrl === "string" ? /^data:image\/(?:jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(body.dataUrl) : null;
  if (!m) return Response.json({ ok: false, error: "Choose a JPEG, PNG or WebP photo." }, { status: 400 });
  const bytes = Buffer.from(m[1], "base64");
  let out: { data: Buffer; info: sharp.OutputInfo };
  try {
    out = await sharp(bytes).rotate().resize({ width: 2400, height: 3000, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 90 }).toBuffer({ resolveWithObject: true });
  } catch { return Response.json({ ok: false, error: "This photo could not be read." }, { status: 400 }); }
  if (out.info.height < 800 || out.info.height <= out.info.width)
    return Response.json({ ok: false, error: "Use a portrait full-body photo at least 800 px tall." }, { status: 400 });
  const key = `full-bases/${createHash("sha256").update(out.data).digest("hex").slice(0, 24)}.jpg`;
  const blob = await put(key, out.data, { access: "public", contentType: "image/jpeg", allowOverwrite: true });
  return Response.json({ ok: true, url: blob.url, width: out.info.width, height: out.info.height });
}
