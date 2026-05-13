import { optimizeFaireListing } from "@/lib/faire-seo/ai";
import {
  DEFAULT_FAIRE_SCHEMA,
  type ExtractedField,
  type FaireSchemaField,
  type FaireUploadedAsset,
} from "@/lib/faire-seo/schema";

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
            seedFields?: ExtractedField[];
            tone?: string;
            trendKeywords?: string;
            forcePlus?: boolean;
          };
          const assets = Array.isArray(body.assets) ? body.assets : [];
          if (!assets.length) throw new Error("At least one uploaded image is required.");

          controller.enqueue(
            encoder.encode(streamEvent({ type: "progress", message: "Analyzing images and writing optimized Faire listing" }))
          );
          const { fields, result } = await optimizeFaireListing({
            assets,
            schema: Array.isArray(body.schema) && body.schema.length ? body.schema : DEFAULT_FAIRE_SCHEMA,
            seedFields: Array.isArray(body.seedFields) ? body.seedFields : [],
            tone: body.tone,
            trendKeywords: body.trendKeywords,
            forcePlus: Boolean(body.forcePlus),
          });
          controller.enqueue(encoder.encode(streamEvent({ type: "complete", fields, result })));
        } catch (err: any) {
          controller.enqueue(
            encoder.encode(streamEvent({ type: "error", error: err?.message || "Optimization failed" }))
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
