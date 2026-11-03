import { NextResponse } from "next/server";
import sharp from "sharp";
import { authorized } from "@/lib/request-auth";
import { readGarmentFacts, uploadToFal } from "@/lib/fal";
import { erpFetchBytes } from "@/lib/erp-category";
import { isErpPhotoUrl } from "@/lib/erp-photos";
import { FACT_CODES } from "@/lib/garment-facts";

/**
 * POST /api/garment-facts — the pre-fill for the garment facts card (Model Studio, Simple garment swap).
 *
 * Body:  { imageUrl, title?, category?, description? }
 *        imageUrl — the garment's front photo: an ERP style photo (read here with the ERP session) or any https image.
 * Reply: { ok, facts, why: {field: {en, ko}}, sure: {field: high|medium|low}, model, codes }
 *
 * Nothing here reaches a render: the operator confirms or edits the card, and the confirmed facts travel with
 * each /api/model-shots request as `garmentFacts`. AUTH — X-DDTO-TOKEN or a studio session, like /api/model-shots.
 */

export const runtime = "nodejs";
export const maxDuration = 60;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, X-DDTO-TOKEN",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: CORS });

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function POST(req: Request) {
  if (!(await authorized(req))) return json({ ok: false, error: "unauthorized" }, 401);
  let body: { imageUrl?: string; title?: string; category?: string; description?: string };
  try { body = await req.json(); } catch { return json({ ok: false, error: "bad json" }, 400); }
  const imageUrl = String(body.imageUrl || "").trim();
  if (!/^https:\/\//.test(imageUrl)) return json({ ok: false, error: "imageUrl required" }, 400);

  try {
    // The vision model fetches the photo itself, so an ERP photo (session-gated) is copied to fal storage first.
    let readUrl = imageUrl;
    if (isErpPhotoUrl(imageUrl)) {
      const buf = await erpFetchBytes(imageUrl);
      if (!buf) return json({ ok: false, error: "Could not read the style photo." }, 502);
      const jpeg = await sharp(buf).rotate().resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 90 }).toBuffer();
      readUrl = await uploadToFal(new Blob([new Uint8Array(jpeg)], { type: "image/jpeg" }), "garment-facts.jpg");
    }
    const read = await readGarmentFacts(readUrl, { title: body.title, category: body.category, description: body.description });
    return json({ ok: true, facts: read.facts, why: read.why, sure: read.sure, model: read.model, codes: FACT_CODES });
  } catch (err) {
    return json({ ok: false, error: (err as Error).message || "read failed", codes: FACT_CODES }, 502);
  }
}
