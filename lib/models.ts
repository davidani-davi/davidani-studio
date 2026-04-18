// Model catalog — maps UI choices to fal.ai endpoints.
// All endpoints are image-edit models that accept one or more reference images + a prompt.

export type ModelId = "nano-banana" | "seedream-4" | "gpt-image";

export interface ModelInfo {
  id: ModelId;
  label: string;
  badge: string;
  endpoint: string;
  /** How this model's input maps to fal.ai args */
  inputShape: "image_urls" | "image_urls_seedream" | "gpt";
  description: string;
}

export const MODELS: Record<ModelId, ModelInfo> = {
  "nano-banana": {
    id: "nano-banana",
    label: "Nano Banana 2",
    badge: "V2",
    endpoint: "fal-ai/nano-banana/edit",
    inputShape: "image_urls",
    description: "Google Gemini image edit — best for surgical swaps, cheap & fast.",
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
    label: "GPT Image",
    badge: "V1.5",
    endpoint: "fal-ai/gpt-image-1/edit-image/byok",
    inputShape: "gpt",
    description: "OpenAI GPT Image edit (BYOK — bring your own OpenAI key).",
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
