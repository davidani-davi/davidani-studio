import { generateFaireSeoResult } from "@/lib/faire-seo/ai";
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
            extractedFields?: ExtractedField[];
            tone?: string;
            trendKeywords?: string;
          };
          const assets = Array.isArray(body.assets) ? body.assets : [];
          const extractedFields = Array.isArray(body.extractedFields) ? body.extractedFields : [];
          if (!assets.length) throw new Error("At least one uploaded image is required.");
          if (!extractedFields.length) throw new Error("Run extraction review before generation.");

          controller.enqueue(encoder.encode(streamEvent({ type: "progress", message: "Building Faire SEO title and buyer-facing copy" })));
          const result = await generateFaireSeoResult({
            assets,
            extractedFields,
            schema: Array.isArray(body.schema) && body.schema.length ? body.schema : DEFAULT_FAIRE_SCHEMA,
            tone: body.tone,
            trendKeywords: body.trendKeywords,
          });
          controller.enqueue(encoder.encode(streamEvent({ type: "complete", result })));
        } catch (err: any) {
          controller.enqueue(
            encoder.encode(streamEvent({ type: "error", error: err?.message || "Generation failed" }))
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
