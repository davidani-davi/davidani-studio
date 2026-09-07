import { NextResponse } from "next/server";
import { fal } from "@fal-ai/client";
import sharp from "sharp";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { uploadToFal } from "@/lib/fal";

/**
 * POST /api/square — a 2:3 studio shot becomes a square by EXTENDING the
 * backdrop generatively (Bria expand), never by painting bands next to the
 * photo. The original pixels stay untouched: the model only fills the new
 * canvas around them.
 *
 * Body: { imageUrl, size?: 2000, subjectX?: 0.5, prompt?: string }
 *   subjectX — where the subject's centre sits across the source (0..1).
 *              The source is placed so that point lands on the square's
 *              centre line, clamped to the canvas.
 * Reply: { ok, url, width, height, placed: { x, y, w, h } }
 *
 * AUTH — the same gate as /api/model-shots (X-DDTO-TOKEN or a studio session).
 */

export const maxDuration = 120;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, X-DDTO-TOKEN",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: CORS });
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

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

const DEFAULT_PROMPT =
  "continuation of the same plain seamless studio backdrop, identical even colour and lighting, " +
  "smooth paper sweep, no objects, no people, no text";

export async function POST(req: Request) {
  if (!(await authorized(req))) return json({ ok: false, error: "unauthorized" }, 401);
  let body: { imageUrl?: string; size?: number; subjectX?: number; prompt?: string };
  try { body = await req.json(); } catch { return json({ ok: false, error: "bad json" }, 400); }
  const imageUrl = String(body.imageUrl || "").trim();
  if (!/^https?:\/\//.test(imageUrl)) return json({ ok: false, error: "imageUrl required" }, 400);
  const size = Math.min(4000, Math.max(512, Math.round(Number(body.size) || 2000)));
  const subjectX = Math.min(1, Math.max(0, Number(body.subjectX ?? 0.5)));
  const key = process.env.FAL_KEY;
  if (!key) return json({ ok: false, error: "FAL_KEY missing" }, 500);
  fal.config({ credentials: key });

  try {
    const src = await fetch(imageUrl, { cache: "no-store" });
    if (!src.ok) return json({ ok: false, error: `source ${src.status}` }, 502);
    const buf = Buffer.from(await src.arrayBuffer());
    const meta = await sharp(buf).metadata();
    const w0 = meta.width || 0, h0 = meta.height || 0;
    if (!w0 || !h0) return json({ ok: false, error: "unreadable image" }, 400);

    // Fit to the square's height (portrait sources) or width (landscape ones).
    const scale = Math.min(size / h0, size / w0);
    const w = Math.round(w0 * scale), h = Math.round(h0 * scale);
    const x = Math.max(0, Math.min(size - w, Math.round(size / 2 - subjectX * w)));
    const y = Math.round((size - h) / 2);
    const resized = await sharp(buf).resize(w, h).jpeg({ quality: 95 }).toBuffer();
    const falUrl = await uploadToFal(new Blob([new Uint8Array(resized)], { type: "image/jpeg" }), "square-source.jpg");

    const result = await fal.subscribe("fal-ai/bria/expand", {
      input: {
        image_url: falUrl,
        canvas_size: [size, size],
        original_image_size: [w, h],
        original_image_location: [x, y],
        prompt: String(body.prompt || DEFAULT_PROMPT),
        negative_prompt: "people, objects, furniture, text, logos, patterns, gradients, vignette",
      },
      logs: false,
    });
    const data = result.data as { image?: { url?: string; width?: number; height?: number } };
    const url = data?.image?.url;
    if (!url) return json({ ok: false, error: "no image returned" }, 502);
    return json({ ok: true, url, width: data.image?.width, height: data.image?.height, placed: { x, y, w, h } });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return json({ ok: false, error: message.slice(0, 300) }, 502);
  }
}
