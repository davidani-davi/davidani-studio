// Model catalog — maps UI choices to fal.ai endpoints.
// All endpoints are image-edit models that accept one or more reference images + a prompt.

export type ModelId = "nano-banana" | "seedream-4" | "gpt-image";

export interface ModelInfo {
  id: ModelId;
  label: string;
  badge: string;
  accentTag?: string;
  /** Backend-specific identifier. For fal.ai this is a full slug like
   * "fal-ai/nano-banana/edit"; for kie.ai it's the model id like
   * "nano-banana-2". The generate() dispatcher uses `inputShape` to know
   * which backend to talk to. */
  endpoint: string;
  /** How this model's input maps to backend args. "kie" routes to kie.ai,
   * everything else routes to fal.ai. */
  inputShape: "image_urls" | "image_urls_seedream" | "gpt" | "kie";
  description: string;
}

export const MODELS: Record<ModelId, ModelInfo> = {
  "nano-banana": {
    id: "nano-banana",
    label: "Nano Banana 2",
    badge: "V2",
    // kie.ai model ID — proxies the current Nano Banana 2 (Gemini 3.1
    // Flash Image). Previously pointed at fal.ai's `fal-ai/nano-banana/edit`
    // which served an older, darker variant that dropped fine details like
    // fringe. Switched over April 2026.
    endpoint: "nano-banana-2",
    inputShape: "kie",
    description: "Google Nano Banana 2 via kie.ai — best for surgical swaps, cheap & fast.",
  },
  "seedream-4": {
    id: "seedream-4",
    label: "Seedream 4.5",
    badge: "V4.5",
    endpoint: "fal-ai/bytedance/seedream/v4/edit",
    inputShape: "image_urls_seedream",
    description: "ByteDance Seedream — strong on fashion + fabric realism.",
  },
  "gpt-image": {
    id: "gpt-image",
    label: "ChatGPT Image Generator",
    badge: "V2.0",
    accentTag: "NEW",
    endpoint: "openai/gpt-image-2/edit",
    inputShape: "gpt",
    description: "OpenAI GPT Image 2 edit via fal.ai — latest higher-fidelity editing with stronger detail and text rendering.",
  },
};

export const ASPECT_RATIOS = [
  { value: "auto", label: "Auto" },
  { value: "1:1", label: "1:1 square" },
  { value: "2:3", label: "2:3 portrait" },
  { value: "3:4", label: "3:4 portrait" },
  { value: "4:5", label: "4:5 portrait" },
  { value: "9:16", label: "9:16 vertical" },
  { value: "16:9", label: "16:9 wide" },
] as const;

export const RESOLUTIONS = [
  { value: "1K", label: "1K (fast, cheap)" },
  { value: "2K", label: "2K" },
  { value: "4K", label: "4K" },
] as const;

export const FORMATS = [
  { value: "png", label: "PNG" },
  { value: "jpeg", label: "JPEG" },
] as const;
