import { NextResponse } from "next/server";
import sharp from "sharp";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { generate, uploadToFal } from "@/lib/fal";
import { erpFetchBytes } from "@/lib/erp-category";
import { isErpPhotoUrl } from "@/lib/erp-photos";
import { buildRecolourPrompt, cleanColour, type RecolourMode } from "@/lib/recolour-prompt";

/**
 * POST /api/recolour — one recolour mockup of a style photo, for Faire Daily's Style Explorer
 * ("See it in this colour" on a Recolour style). Nano Banana 2 edits only the garment's colour.
 *
 * Body:  { imageUrl, colour, mode?: "solid" | "pair" }
 *        imageUrl — an ERP style photo (read here with the ERP session) or any https image.
 * Reply: { ok, url, width, height, colour, mode }
 *
 * AUTH — the same gate as /api/square and /api/model-shots (X-DDTO-TOKEN or a studio session).
 */

export const runtime = "nodejs";
export const maxDuration = 300;

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

// The output keeps the photo's own shape: the nearest of the ratios the studios use.
function ratioOf(w: number, h: number): string {
  const r = w / h;
  const options: [string, number][] = [["2:3", 2 / 3], ["3:4", 3 / 4], ["4:5", 4 / 5], ["1:1", 1], ["3:2", 3 / 2]];
  return options.reduce((best, o) => (Math.abs(o[1] - r) < Math.abs(best[1] - r) ? o : best))[0];
}

export async function POST(req: Request) {
  if (!(await authorized(req))) return json({ ok: false, error: "unauthorized" }, 401);
  let body: { imageUrl?: string; colour?: string; mode?: string };
  try { body = await req.json(); } catch { return json({ ok: false, error: "bad json" }, 400); }
  const imageUrl = String(body.imageUrl || "").trim();
  if (!/^https:\/\//.test(imageUrl)) return json({ ok: false, error: "imageUrl required" }, 400);
  const mode: RecolourMode = body.mode === "pair" ? "pair" : "solid";
  let colour: string;
  try { colour = cleanColour(body.colour); } catch (e) { return json({ ok: false, error: (e as Error).message }, 400); }

  try {
    let buf: Buffer | null;
    if (isErpPhotoUrl(imageUrl)) buf = await erpFetchBytes(imageUrl);
    else { const r = await fetch(imageUrl, { cache: "no-store" }); buf = r.ok ? Buffer.from(await r.arrayBuffer()) : null; }
    if (!buf) return json({ ok: false, error: "Could not read the style photo." }, 502);
    const meta = await sharp(buf).metadata();
    if (!meta.width || !meta.height) return json({ ok: false, error: "unreadable image" }, 400);
    const jpeg = await sharp(buf).rotate().jpeg({ quality: 95 }).toBuffer();
    const source = await uploadToFal(new Blob([new Uint8Array(jpeg)], { type: "image/jpeg" }), "recolour-source.jpg");

    const result = await generate({
      modelId: "nano-banana",
      prompt: buildRecolourPrompt(colour, mode),
      imageUrls: [source],
      useDefaultReference: false,
      raw: true,
      aspectRatio: ratioOf(meta.width, meta.height),
      resolution: "2K",
      format: "jpeg",
      numImages: 1,
      outputSize: null,
    });
    const image = result.images?.[0];
    if (!image?.url) return json({ ok: false, error: "no image returned" }, 502);
    // Provider links expire; Faire Daily keeps these on the style, so copy the file to fal storage.
    const out = await fetch(image.url, { cache: "no-store" });
    if (!out.ok) return json({ ok: false, error: `result ${out.status}` }, 502);
    const url = await uploadToFal(new Blob([new Uint8Array(await out.arrayBuffer())], { type: "image/jpeg" }), "recolour.jpg");
    return json({ ok: true, url, width: image.width, height: image.height, colour, mode });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return json({ ok: false, error: message.slice(0, 300) }, 502);
  }
}
