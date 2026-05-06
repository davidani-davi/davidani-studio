import { extractFaireListingFields } from "@/lib/faire-seo/ai";
import { DEFAULT_FAIRE_SCHEMA, type FaireSchemaField, type FaireUploadedAsset } from "@/lib/faire-seo/schema";

export const runtime = "nodejs";
export const maxDuration = 180;

function streamEvent(payload: unknown) {
  return `${JSON.stringify(payload)}\n`;
}

export async function POST(req: Request) {
  const encoder = new TextEncoder();

  return new Response(
    new ReadableStream({
      async start(controller) {
        try {
          const body = (await req.json()) as {
            assets?: FaireUploadedAsset[];
            schema?: FaireSchemaField[];
          };
          const assets = Array.isArray(body.assets) ? body.assets : [];
          if (!assets.length) throw new Error("At least one uploaded screenshot or product image is required.");

          controller.enqueue(encoder.encode(streamEvent({ type: "progress", message: "Reading screenshots and product images" })));
          const fields = await extractFaireListingFields(
            assets,
            Array.isArray(body.schema) && body.schema.length ? body.schema : DEFAULT_FAIRE_SCHEMA
          );
          controller.enqueue(encoder.encode(streamEvent({ type: "complete", fields })));
        } catch (err: any) {
          controller.enqueue(
            encoder.encode(streamEvent({ type: "error", error: err?.message || "Extraction failed" }))
          );
        } finally {
          controller.close();
        }
      },
    }),
    {
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-store",
      },
    }
  );
}
