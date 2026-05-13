import { fal } from "@fal-ai/client";
import {
  CORE_EXTRACTION_FIELDS,
  type ExtractedField,
  type FaireSchemaField,
  type FaireSeoResult,
  type FaireUploadedAsset,
  emptyScore,
  sortedVisibleSchema,
} from "@/lib/faire-seo/schema";

const VISION_MODEL = "anthropic/claude-haiku-4.5";
const ANTHROPIC_MODEL_ID = "claude-haiku-4-5-20251001";

export interface OptimizeFaireListingOutput {
  fields: ExtractedField[];
  result: FaireSeoResult;
}

const optimizeCache = new Map<string, OptimizeFaireListingOutput>();

let configured = false;

function ensureConfigured() {
  if (configured) return;
  const key = process.env.FAL_KEY;
  if (!key) throw new Error("FAL_KEY environment variable is missing.");
  fal.config({ credentials: key });
  configured = true;
}

function extractJson(raw: string): string {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  if (fenced) return fenced.trim();
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start >= 0 && end > start) return raw.slice(start, end + 1);
  return raw.trim();
}

async function runVision(prompt: string, imageUrls: string[], systemPrompt: string) {
  // Direct Anthropic path — remove ANTHROPIC_API_KEY to revert to fal.ai proxy.
  if (process.env.ANTHROPIC_API_KEY) {
    const imageBlocks = imageUrls.map((url) => ({
      type: "image" as const,
      source: { type: "url" as const, url },
    }));
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "anthropic-beta": "prompt-caching-2024-07-31",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL_ID,
        max_tokens: 4096,
        system: [{ type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: [...imageBlocks, { type: "text", text: prompt }] }],
      }),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => `HTTP ${res.status}`);
      throw new Error(`Anthropic API ${res.status}: ${errText.slice(0, 300)}`);
    }
    const data = await res.json();
    return (data.content as any[])
      .filter((b) => b.type === "text")
      .map((b) => String(b.text || ""))
      .join("")
      .trim();
  }

  // Fallback: fal.ai proxy (original behavior when no ANTHROPIC_API_KEY).
  ensureConfigured();
  const result: any = await fal.subscribe("fal-ai/any-llm/vision", {
    input: {
      model: VISION_MODEL,
      system_prompt: systemPrompt,
      prompt,
      image_url: imageUrls.length === 1 ? imageUrls[0] : undefined,
      image_urls: imageUrls.length > 1 ? imageUrls : undefined,
    },
    logs: false,
  });
  const data = result?.data ?? result;
  return String(data?.output ?? data?.response ?? data?.text ?? "").trim();
}

function normalizeExtractedFields(rawFields: any[]): ExtractedField[] {
  const byId = new Map<string, any>();
  for (const item of Array.isArray(rawFields) ? rawFields : []) {
    if (item?.id) byId.set(String(item.id), item);
  }

  return CORE_EXTRACTION_FIELDS.map((field) => {
    const found = byId.get(field.id);
    const value = String(found?.value ?? "").trim();
    const confidence = ["high", "medium", "needs_confirmation", "missing"].includes(
      found?.confidence
    )
      ? found.confidence
      : value
        ? "needs_confirmation"
        : "missing";
    const source = ["screenshot", "image", "inferred", "user", "missing"].includes(found?.source)
      ? found.source
      : value
        ? "inferred"
        : "missing";
    return {
      ...field,
      value,
      confidence,
      source,
      notes: String(found?.notes ?? "").trim(),
    };
  });
}

function slimSchema(schema: FaireSchemaField[]) {
  return sortedVisibleSchema(schema).map((field) => {
    const slim: Record<string, unknown> = { id: field.id, label: field.label, type: field.type };
    if (field.options?.length) slim.options = field.options;
    if (field.maxSelections) slim.maxSelections = field.maxSelections;
    if (field.required) slim.required = true;
    return slim;
  });
}

function value(fields: ExtractedField[], id: string) {
  return fields.find((field) => field.id === id)?.value.trim() ?? "";
}

function clampScore(score: unknown) {
  const number = Number(score);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(100, Math.round(number)));
}

function normalizeResult(raw: any, fields: ExtractedField[]): FaireSeoResult {
  const before = raw?.beforeScore ?? {};
  const after = raw?.afterScore ?? {};
  const score = (source: any) => ({
    titleSeo: clampScore(source.titleSeo),
    keywordCoverage: clampScore(source.keywordCoverage),
    retailerClarity: clampScore(source.retailerClarity),
    metadataQuality: clampScore(source.metadataQuality),
    boutiquePositioning: clampScore(source.boutiquePositioning),
    descriptionStrength: clampScore(source.descriptionStrength),
    imageReadiness: clampScore(source.imageReadiness),
    plusSizeOptimization: clampScore(source.plusSizeOptimization),
    overallFaireOptimization: clampScore(source.overallFaireOptimization),
  });

  return {
    listingId: String(raw?.listingId || `faire-${Date.now()}`),
    styleNumber: String(raw?.styleNumber || value(fields, "styleNumber")),
    plusStyleNumber: String(raw?.plusStyleNumber || value(fields, "plusStyleNumber")),
    extractedFields: fields,
    originalTitle: String(raw?.originalTitle || value(fields, "currentTitle")),
    originalDescription: String(raw?.originalDescription || value(fields, "currentDescription")),
    optimizedFields: raw?.optimizedFields && typeof raw.optimizedFields === "object" ? raw.optimizedFields : {},
    optimizedTitle: String(raw?.optimizedTitle || ""),
    plusOptimizedTitle: String(raw?.plusOptimizedTitle || ""),
    optimizedDescription: String(raw?.optimizedDescription || ""),
    plusOptimizedDescription: String(raw?.plusOptimizedDescription || ""),
    metadataSelections:
      raw?.metadataSelections && typeof raw.metadataSelections === "object"
        ? raw.metadataSelections
        : {},
    seoKeywordStrategy: Array.isArray(raw?.seoKeywordStrategy)
      ? raw.seoKeywordStrategy.map(String).filter(Boolean)
      : [],
    productDetailRecommendations: Array.isArray(raw?.productDetailRecommendations)
      ? raw.productDetailRecommendations.map(String).filter(Boolean)
      : [],
    imageOrder: Array.isArray(raw?.imageOrder) ? raw.imageOrder.map(String).filter(Boolean) : [],
    beforeScore: raw?.beforeScore ? score(before) : emptyScore(),
    afterScore: raw?.afterScore ? score(after) : emptyScore(),
    scoreRationale: Array.isArray(raw?.scoreRationale)
      ? raw.scoreRationale.map(String).filter(Boolean)
      : [],
    finalCopySheet: String(raw?.finalCopySheet || ""),
    updatedAt: new Date().toISOString(),
  };
}

export async function optimizeFaireListing(input: {
  assets: FaireUploadedAsset[];
  schema: FaireSchemaField[];
  seedFields?: ExtractedField[];
  tone?: string;
  trendKeywords?: string;
  forcePlus?: boolean;
}): Promise<OptimizeFaireListingOutput> {
  const seed = Array.isArray(input.seedFields) ? input.seedFields : [];
  const forcePlus = Boolean(input.forcePlus);
  const cacheKey = [
    input.assets.map((a) => `${a.hash}:${a.role}`).sort().join("|"),
    seed.map((f) => `${f.id}=${f.value}`).sort().join("|"),
    (input.tone || "").trim(),
    (input.trendKeywords || "").trim(),
    forcePlus ? "force-plus" : "",
  ].join("§");
  if (cacheKey && optimizeCache.has(cacheKey)) return optimizeCache.get(cacheKey)!;

  const schema = slimSchema(input.schema);
  const seedSummary = seed
    .filter((f) => f.value?.trim())
    .map((f) => `${f.id}: ${f.value}`)
    .join("\n") || "(none — derive everything from the images)";

  const prompt = `Produce a Davi&Dani Faire wholesale listing optimization for the uploaded screenshots/product images.

Step 1 — extract these field ids from the images: ${CORE_EXTRACTION_FIELDS.map((f) => f.id).join(", ")}.
Treat seed values below as authoritative when present; only fill what's missing or confirmable from images.

Seed values (from Faire URL import, when present):
${seedSummary}

Step 2 — write the optimized listing. Hard rules:
- SKU at start of title. Regular: "DJ30632 - Textured Plaid Double Breasted Statement Coat". Plus: "PJ30632 - PLUS Textured Plaid Double Breasted Statement Coat".
- If plus SKU exists, generate plus copy too. Plus must not sound utilitarian.${
    forcePlus
      ? `
- FORCE PLUS MODE: ON. You MUST generate plus copy for this listing. Derive the plus SKU by replacing the first letter "D" of the regular SKU with "P" (e.g. DJ30632 → PJ30632, DET58026 → PET58026, DWT50172 → PWT50172). Set plusStyleNumber, plusOptimizedTitle, and plusOptimizedDescription accordingly. The plus copy must be buyer-aspirational, never utilitarian.`
      : ""
  }
- Replace manufacturer wording with buyer-searchable fashion language. ~35-60 chars after SKU.
- Description = 3 paragraphs for boutique buyers, then "Features:", "Perfect For:", "Fabric:", "Model:" sections.
- Fabric: confirmed composition or "Needs confirmation". Model size carries through to plus copy verbatim.
- metadataSelections must use only valid options from the schema. If nothing fits, leave blank.
- Trending keywords are directional only — use only ones that honestly fit. Never force.
- Image order: safest broad seller → strong conversion → alt colorway → full body → detail → side/back → lifestyle.
- Output must be paste-ready into Faire.

Tone: ${input.tone || "balanced Faire SEO + boutique merchandising"}
Trending keyword reference: ${input.trendKeywords?.trim() || "None"}
Assets: ${input.assets.map((a, i) => `${i + 1}. ${a.name} (${a.role})`).join("; ")}

Schema:
${JSON.stringify(schema)}

Return strict JSON only with this exact shape:
{
  "fields": [{ "id": "<core field id>", "value": "string", "confidence": "high|medium|needs_confirmation|missing", "source": "screenshot|image|inferred|missing", "notes": "" }],
  "listingId": "string",
  "styleNumber": "string",
  "plusStyleNumber": "string",
  "originalTitle": "string",
  "originalDescription": "string",
  "optimizedFields": { "<shortFieldId>": "string" },
  "optimizedTitle": "string",
  "plusOptimizedTitle": "string",
  "optimizedDescription": "string",
  "plusOptimizedDescription": "string",
  "metadataSelections": { "<schemaFieldId>": "string|string[]|boolean|number" },
  "seoKeywordStrategy": ["keyword"],
  "productDetailRecommendations": ["recommendation"],
  "imageOrder": ["1. image name - reason"],
  "beforeScore": { "titleSeo":0,"keywordCoverage":0,"retailerClarity":0,"metadataQuality":0,"boutiquePositioning":0,"descriptionStrength":0,"imageReadiness":0,"plusSizeOptimization":0,"overallFaireOptimization":0 },
  "afterScore": { "titleSeo":0,"keywordCoverage":0,"retailerClarity":0,"metadataQuality":0,"boutiquePositioning":0,"descriptionStrength":0,"imageReadiness":0,"plusSizeOptimization":0,"overallFaireOptimization":0 },
  "scoreRationale": ["what changed and why"],
  "finalCopySheet": "paste-ready text"
}`;

  const output = await runVision(
    prompt,
    input.assets.map((a) => a.url).slice(0, 12),
    "You are a Davi&Dani Faire merchandising assistant. You extract listing attributes from images and produce paste-ready, schema-valid Faire SEO copy in a single JSON response."
  );
  const parsed = JSON.parse(extractJson(output));
  const fields = normalizeExtractedFields(parsed.fields);
  const merged = mergeSeed(fields, seed);
  const result = normalizeResult(parsed, merged);
  const out: OptimizeFaireListingOutput = { fields: merged, result };
  if (cacheKey) optimizeCache.set(cacheKey, out);
  return out;
}

function mergeSeed(extracted: ExtractedField[], seed: ExtractedField[]): ExtractedField[] {
  if (!seed.length) return extracted;
  const seedById = new Map(seed.map((f) => [f.id, f]));
  return extracted.map((field) => {
    const s = seedById.get(field.id);
    if (s?.value?.trim() && s.confidence === "high") return s;
    return field;
  });
}

export async function inferFaireSchemaUpdates(
  assets: FaireUploadedAsset[],
  currentSchema: FaireSchemaField[]
): Promise<FaireSchemaField[]> {
  const prompt = `Review uploaded Faire listing screenshots for visible product detail fields/options.

Current schema:
${JSON.stringify(currentSchema, null, 2)}

Return strict JSON only:
{
  "fields": [
    {
      "id": "stable_snake_case_id",
      "label": "field label",
      "type": "single_select | multi_select | free_text | number | boolean | country_select | dynamic_tag_input",
      "options": ["visible options only"],
      "maxSelections": 2,
      "required": false,
      "placeholder": "short placeholder",
      "helpText": "short help text",
      "visible": true,
      "sortableOrder": 10
    }
  ]
}

Only include fields/options visible in screenshots or already present in the schema. Do not invent Faire options.`;

  const output = await runVision(
    prompt,
    assets.map((asset) => asset.url),
    "You are a conservative schema-sync assistant for Faire product detail fields. You only extract visible field structures and options."
  );
  const parsed = JSON.parse(extractJson(output));
  return Array.isArray(parsed.fields) ? parsed.fields : currentSchema;
}
