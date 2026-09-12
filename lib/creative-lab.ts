import { MODELS, type ModelId } from "./models";

/** Prompt-major order keeps matching concepts next to each other in the gallery. */
export function comparisonJobs(prompts: string[], modelIds: ModelId[]) {
  const models = [...new Set(modelIds)].filter((id) => Boolean(MODELS[id]));
  return prompts.flatMap((prompt, conceptIndex) =>
    models.map((modelId) => ({ prompt, modelId, conceptIndex }))
  );
}

export function modelsFromResults(results: { settings?: { modelId: ModelId } }[], fallback: ModelId): ModelId[] {
  const ids = [...new Set(results.map((result) => result.settings?.modelId).filter((id): id is ModelId => Boolean(id && MODELS[id])))];
  return ids.length ? ids : [fallback];
}

export const CREATIVE_REFERENCE_KEY = "davidani:creative-reference:v1";

export function parseCreativeReference(value: string | null): { url: string; prompt: string } | null {
  try {
    const parsed = JSON.parse(value || "null");
    if (!parsed || typeof parsed.url !== "string" || typeof parsed.prompt !== "string") return null;
    if (new URL(parsed.url).protocol !== "https:") return null;
    return { url: parsed.url, prompt: parsed.prompt };
  } catch {
    return null;
  }
}
