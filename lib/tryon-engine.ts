import { fal } from "@fal-ai/client";
import type { PresetView } from "./models-registry";

/**
 * The try-on engine (2026-09-05): a purpose-built virtual try-on model in
 * place of the general image editor, behind `engine: "tryon"` on
 * /api/model-shots. The nano-banana prompt pipeline is untouched and stays the
 * default; the pre-engine state is tagged model-maker-v1-nano-banana-2026-09-05.
 *
 * Same contract as Google's Shopping try-on (TryOnDiffusion: a person image
 * and a garment image into a model trained on millions of person/garment
 * pairs; the garment carried as pixels through cross-attention; the person
 * kept, only the garment generated): the plate is the person, the ERP photo
 * is the garment, and there is no prose in between. FASHN v1.6 on fal today,
 * because the fal client and key are already here. Google's own model on
 * Vertex AI (`virtual-try-on-001`: personImage + productImages, output at the
 * input's resolution) is the identical contract and drops in here once a GCP
 * project exists. See docs/MODEL_MAKER_VS_DOJI_GOOGLE.md.
 */
export const TRYON_ENDPOINT = "fal-ai/fashn/tryon/v1.6";

/** Output size FASHN v1.6 returns — 2:3, the plate's own aspect. */
export const TRYON_OUTPUT = { width: 864, height: 1296 } as const;

export type TryOnCategory = "tops" | "bottoms" | "one-pieces" | "auto";
export type GarmentPhotoType = "auto" | "model" | "flat-lay";

export interface TryOnInput {
  model_image: string;
  garment_image: string;
  category: TryOnCategory;
  mode: "performance" | "balanced" | "quality";
  garment_photo_type: GarmentPhotoType;
  segmentation_free: boolean;
  output_format: "png" | "jpeg";
  num_samples: number;
  moderation_level: "none" | "permissive" | "conservative";
  seed?: number;
}

/**
 * Our shot category (lib/plate-framing.ts) → the try-on model's. A set is
 * two garments, which a single try-on cannot do — it goes in as "auto" and the
 * result is judged like any other; the editor engine stays the tool for sets.
 */
export function tryOnCategory(category: string | null | undefined): TryOnCategory {
  switch (String(category || "").trim().toLowerCase()) {
    case "top":
    case "outerwear":
      return "tops";
    case "pants":
    case "skirt":
    case "shorts":
      return "bottoms";
    case "dress":
    case "romper":
    case "jumpsuit":
      return "one-pieces";
    default:
      return "auto";
  }
}

/**
 * Which garment photo a view is painted from: the back view takes the back
 * photo when the caller sent one (the second URL is the back of the SAME
 * garment — the contract Multi Model Studio uses), every other view the front.
 */
export function garmentForView(view: PresetView, urls: readonly string[]): string {
  const list = urls.filter((u) => typeof u === "string" && u.length > 0);
  if (!list.length) throw new Error("garmentImageUrls is required");
  return view === "back" && list.length > 1 ? list[1] : list[0];
}

/**
 * A stable seed per style and view so a re-run reproduces the frame, and a
 * Redo with a fix note gets a different draw (the note is the operator asking
 * for something else). 31-bit so it fits every provider's integer seed.
 */
export function tryOnSeed(styleCode: string, view: PresetView, note = ""): number {
  const s = `${String(styleCode || "").trim().toUpperCase()}|${view}|${String(note || "").trim()}`;
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % 2147483647;
}

export function buildTryOnInput(o: {
  plateUrl: string;
  garmentUrl: string;
  category?: string | null;
  garmentPhotoType?: GarmentPhotoType;
  seed?: number;
  samples?: number;
  /** Skip the model's clothing segmentation. Our plates are real outfits, so
   * the garment the model wears must be parsed out and replaced — the first
   * bake-off (DWJ62218 on crop 22, 2026-09-05) left the plate's turtleneck
   * collar showing through the cardigan with this on. Off unless asked. */
  segmentationFree?: boolean;
}): TryOnInput {
  if (!o.plateUrl) throw new Error("plateUrl is required");
  if (!o.garmentUrl) throw new Error("garmentUrl is required");
  return {
    model_image: o.plateUrl,
    garment_image: o.garmentUrl,
    category: tryOnCategory(o.category),
    mode: "quality",
    garment_photo_type: o.garmentPhotoType || "auto",
    segmentation_free: o.segmentationFree === true,
    output_format: "png",
    num_samples: Math.min(4, Math.max(1, Math.floor(o.samples || 1))),
    moderation_level: "permissive",
    ...(typeof o.seed === "number" ? { seed: o.seed } : {}),
  };
}

let configured = false;
function ensureFal() {
  if (configured) return;
  const key = process.env.FAL_KEY;
  if (!key) throw new Error("FAL_KEY environment variable is missing.");
  fal.config({ credentials: key });
  configured = true;
}

export interface TryOnResult {
  urls: string[];
  endpoint: string;
  ms: number;
}

/** One try-on call; the first URL is the frame the panel shows. */
export async function runTryOn(input: TryOnInput): Promise<TryOnResult> {
  ensureFal();
  const started = Date.now();
  const res: any = await fal.subscribe(TRYON_ENDPOINT, { input: input as any, logs: false });
  const urls: string[] = ((res?.data?.images || res?.images || []) as any[])
    .map((im) => (im && typeof im.url === "string" ? im.url : ""))
    .filter(Boolean);
  if (!urls.length) throw new Error("try-on returned no image");
  return { urls, endpoint: TRYON_ENDPOINT, ms: Date.now() - started };
}
