import { inferFaireSchemaUpdates } from "@/lib/faire-seo/ai";
import { DEFAULT_FAIRE_SCHEMA, type FaireSchemaField, type FaireUploadedAsset } from "@/lib/faire-seo/schema";

export const runtime = "nodejs";
export const maxDuration = 180;

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      assets?: FaireUploadedAsset[];
      schema?: FaireSchemaField[];
    };
    const assets = Array.isArray(body.assets) ? body.assets : [];
    if (!assets.length) {
      return Response.json({ ok: false, error: "Upload a Faire screenshot before schema sync." }, { status: 400 });
    }

    const fields = await inferFaireSchemaUpdates(
      assets.filter((asset) => asset.role === "listing_screenshot" || asset.role === "plus_screenshot"),
      Array.isArray(body.schema) && body.schema.length ? body.schema : DEFAULT_FAIRE_SCHEMA
    );
    return Response.json({ ok: true, fields });
  } catch (err: any) {
    return Response.json(
      { ok: false, error: err?.message || "Schema sync failed" },
      { status: 500 }
    );
  }
}
