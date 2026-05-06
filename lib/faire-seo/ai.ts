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
const imageAnalysisCache = new Map<string, ExtractedField[]>();

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

export async function extractFaireListingFields(
  assets: FaireUploadedAsset[],
  schema: FaireSchemaField[]
): Promise<ExtractedField[]> {
  const cacheKey = assets
    .map((asset) => `${asset.hash}:${asset.role}`)
    .sort()
    .join("|");
  if (cacheKey && imageAnalysisCache.has(cacheKey)) {
    return imageAnalysisCache.get(cacheKey)!;
  }

  const prompt = `Analyze these Davi&Dani Faire listing screenshots and product images.

The workflow is specifically for wholesale apparel listings on Faire. Think like a boutique buyer, Faire merchandising expert, and wholesale fashion operator.

Extract only what is visible or strongly inferable. Never present unknown information as confirmed. If uncertain, prefill the best guess and mark needs_confirmation. If unknown, leave value blank and mark missing.

Uploaded assets:
${assets.map((asset, index) => `${index + 1}. ${asset.name} (${asset.role})`).join("\n")}

Current configurable Faire product-detail schema:
${JSON.stringify(sortedVisibleSchema(schema), null, 2)}

Return strict JSON only:
{
  "fields": [
    {
      "id": "one of these exact ids: ${CORE_EXTRACTION_FIELDS.map((field) => field.id).join(", ")}",
      "value": "string",
      "confidence": "high | medium | needs_confirmation | missing",
      "source": "screenshot | image | inferred | missing",
      "notes": "short note when useful"
    }
  ]
}`;

  const output = await runVision(
    prompt,
    assets.map((asset) => asset.url),
    "You are a precise Faire wholesale fashion listing extraction engine for Davi&Dani. You extract screenshot text and visual apparel attributes conservatively, with confidence labels."
  );
  const parsed = JSON.parse(extractJson(output));
  const fields = normalizeExtractedFields(parsed.fields);
  if (cacheKey) imageAnalysisCache.set(cacheKey, fields);
  return fields;
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

export async function generateFaireSeoResult(input: {
  assets: FaireUploadedAsset[];
  schema: FaireSchemaField[];
  extractedFields: ExtractedField[];
  tone?: string;
  trendKeywords?: string;
}): Promise<FaireSeoResult> {
  const schema = sortedVisibleSchema(input.schema);
  const prompt = `Generate a production-ready Faire SEO optimization package for a Davi&Dani wholesale apparel listing.

This is not a generic SEO tool. Think like:
- a boutique buyer choosing inventory
- a Faire merchandising expert improving discoverability
- a wholesale fashion operator preserving SKU reorder behavior

Hard rules:
- Always keep SKU/style number at the beginning of the title.
- Regular title format: "DJ30632 - Textured Plaid Double Breasted Statement Coat"
- Plus title format: "PJ30632 - PLUS Textured Plaid Double Breasted Statement Coat"
- If plus SKU exists, generate plus version automatically.
- Do not make plus sound utilitarian or basic.
- Replace internal/manufacturer wording with buyer-searchable fashion language.
- Target about 35-60 characters after SKU when possible.
- Description is for boutique buyers, not consumers.
- Description must have 3 paragraphs, then "Features:", "Perfect For:", "Fabric:", "Model:" sections.
- Fabric must use confirmed composition or "Needs confirmation".
- If model size says Small, even plus copy must say "Model is wearing size Small".
- Product details must use ONLY valid options from the schema below. If no accurate option exists, leave blank.
- Avoid over-tagging. Accuracy beats metadata stuffing.
- If Friday Faire Insider trending keywords are provided, consider them as directional SEO context. Use only keywords that honestly fit the garment, buyer intent, fabric/print/silhouette, seasonality, and boutique positioning. Never force irrelevant trends into copy.
- Image order should prioritize safest broadest seller, strongest conversion, alternate colorway, full body, detail, side/back, lifestyle.
- Final output must be clean enough to paste directly into Faire.

Requested tone/regeneration mode: ${input.tone || "balanced Faire SEO + boutique merchandising"}

Friday Faire Insider trending keyword reference:
${input.trendKeywords?.trim() || "None provided."}

Editable extracted fields:
${JSON.stringify(input.extractedFields, null, 2)}

Valid Faire schema:
${JSON.stringify(schema, null, 2)}

Uploaded asset names and roles:
${input.assets.map((asset, index) => `${index + 1}. ${asset.name} (${asset.role})`).join("\n")}

Return strict JSON only:
{
  "listingId": "string",
  "styleNumber": "string",
  "plusStyleNumber": "string",
  "originalTitle": "string",
  "originalDescription": "string",
  "optimizedFields": { "shortFieldId": "optimized editable value" },
  "optimizedTitle": "string",
  "plusOptimizedTitle": "string",
  "optimizedDescription": "string",
  "plusOptimizedDescription": "string",
  "metadataSelections": { "schemaFieldId": "string | string[] | boolean | number" },
  "seoKeywordStrategy": ["keyword phrase"],
  "productDetailRecommendations": ["recommendation or blank rationale"],
  "imageOrder": ["1. image name - reason"],
  "beforeScore": {
    "titleSeo": 0,
    "keywordCoverage": 0,
    "retailerClarity": 0,
    "metadataQuality": 0,
    "boutiquePositioning": 0,
    "descriptionStrength": 0,
    "imageReadiness": 0,
    "plusSizeOptimization": 0,
    "overallFaireOptimization": 0
  },
  "afterScore": {
    "titleSeo": 0,
    "keywordCoverage": 0,
    "retailerClarity": 0,
    "metadataQuality": 0,
    "boutiquePositioning": 0,
    "descriptionStrength": 0,
    "imageReadiness": 0,
    "plusSizeOptimization": 0,
    "overallFaireOptimization": 0
  },
  "scoreRationale": ["what changed and why it matters"],
  "finalCopySheet": "clean paste-ready text with regular and plus sections when applicable"
}`;

  const output = await runVision(
    prompt,
    input.assets.map((asset) => asset.url).slice(0, 12),
    "You are a Davi&Dani Faire merchandising assistant. You produce accurate, paste-ready wholesale listing SEO copy and schema-valid Faire metadata."
  );
  const parsed = JSON.parse(extractJson(output));
  return normalizeResult(parsed, input.extractedFields);
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
