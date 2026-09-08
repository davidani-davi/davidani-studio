import { fal } from "@fal-ai/client";
import fs from "node:fs/promises";
import path from "node:path";
import { uploadToFal } from "./fal";
import type { PresetView } from "./models-registry";
import type { Hem, PlateFraming, ShotCategory } from "./plate-framing";
import type { KnownGarment } from "./garment-contract";

/**
 * The no-plate path (2026-09-08): GPT Image 2.5 renders the whole frame from
 * the house face references and the garment photo. No plate, no analyzer, no
 * restore — the face reference stands in for the photographed model, so any
 * pose and framing is a sentence in the prompt.
 *
 * The probe that earned this (faire-management gpt25_probe.mjs): vision and
 * celine front / side / back / garment shots, four independent renders each,
 * came back as the same woman in the same trousers on the same cream sweep in
 * 20–30 s, against ~105 s for a GPT Image 2 head swap and a plate pipeline of
 * three more renders behind it. Plates still guarantee the exact approved pose
 * and a real photographed body; this path gives speed and any pose.
 *
 * fal endpoints: openai/gpt-image-2.5/flare/edit (fast default) and
 * /sunburst/edit (precision, slower). Input shape = gpt-image-2 edit.
 */

export type HouseFace = "vision" | "celine";
export type NoPlateVariant = "flare" | "sunburst";

export const HOUSE_FACES: Record<HouseFace, { label: string }> = {
  vision: { label: "Vision" },
  celine: { label: "Celine" },
};

/** 2:3 at GPT native size (GPT_NATIVE_SIZE). 1024×1536 was the probe size; 2048×3072
 *  went live 2026-09-08 on David's ask — see the handoff for the timing. */
export const NO_PLATE_SIZE = { width: 2048, height: 3072 } as const;

/** "vision", "celine", or the picker's "face:vision" form. */
export function houseFaceOf(v: unknown): HouseFace | null {
  const s = String(v ?? "").toLowerCase().replace(/^face:/, "");
  return s === "vision" || s === "celine" ? s : null;
}

export function noPlateVariantOf(v: unknown): NoPlateVariant {
  return v === "sunburst" ? "sunburst" : "flare";
}

/** Public paths of a face's two references: neutral first, then the smile. */
export function faceRefPaths(face: HouseFace): string[] {
  return [`/models/hide/faces/${face}-face.png`, `/models/hide/faces/${face}-smile-face.png`];
}

const localFaceUrls = new Map<string, Promise<string>>();

/**
 * The references as URLs the model can fetch: the public path on Vercel, a
 * fal-storage upload in local dev (cached for the life of the process).
 */
export async function faceRefUrls(face: HouseFace, origin: string): Promise<string[]> {
  const paths = faceRefPaths(face);
  if (process.env.VERCEL) return paths.map((p) => new URL(p, origin).toString());
  return Promise.all(paths.map((p) => {
    let u = localFaceUrls.get(p);
    if (!u) {
      u = fs.readFile(path.join(process.cwd(), "public", p))
        .then((buf) => uploadToFal(new Blob([Uint8Array.from(buf)], { type: "image/png" }), path.basename(p)))
        .catch((err) => { localFaceUrls.delete(p); throw err; });
      localFaceUrls.set(p, u);
    }
    return u;
  }));
}

/** Input order the prompt relies on: faces, garment photos, then the anchor. */
export function noPlateImageUrls(faceUrls: string[], garmentUrls: string[], anchorUrl = ""): string[] {
  return [...faceUrls, ...garmentUrls, ...(anchorUrl ? [anchorUrl] : [])];
}

const HOUSE =
  "Studio photograph on a plain cream seamless paper backdrop (soft warm off-white, about rgb 249,237,226), " +
  "even soft studio light, no props, no shadow on the wall beyond a faint natural floor shadow. Photorealistic, " +
  "natural skin, catalogue photography for a womenswear wholesaler, not editorial. No text, no watermark, no logo.";

const FRAMING: Record<PlateFraming, string> = {
  full: "Full-length: her whole body from hair to shoes is in frame with a little air above her head and below " +
        "her shoes; her head is about a tenth of the frame height.",
  crop: "Framed from just above the top of her head to mid-thigh, the garment filling the frame; her head is " +
        "about a fifth of the frame height.",
  low:  "Framed from the waist down to the shoes: her head, shoulders and upper body are above the top edge and " +
        "out of frame; the bottoms fill the frame, shoes fully in view at the bottom.",
};

const VIEW: Record<PresetView, string> = {
  front: "She faces the camera squarely, standing straight, arms relaxed at her sides, feet slightly apart, a calm natural expression.",
  side:  "Exact profile: she is turned 90 degrees so the camera sees her left side, standing straight, arms relaxed, " +
         "looking straight ahead and not at the camera.",
  back:  "From directly behind: her back fully to the camera, head straight, hair falling naturally down her back, " +
         "arms relaxed at her sides.",
  full:  "She faces the camera squarely, standing straight, arms relaxed at her sides, feet slightly apart, a calm natural expression.",
};

/** What she wears besides the garment, by what the garment is. */
function styling(category: ShotCategory, hem: Hem): string {
  switch (category) {
    case "top":
      return "Style the rest plainly so the garment is the subject: plain cream straight-leg trousers and simple flat sandals.";
    case "outerwear":
      return "Worn open or closed as the product photo shows it, over a plain black ribbed tank top, with plain cream " +
             "straight-leg trousers and simple flat sandals." + (hem === "long" ? " The hem falls exactly where the product photo puts it." : "");
    case "pants":
    case "skirt":
      return "Above it a plain black ribbed tank top, tucked in, and simple flat sandals; nothing else.";
    case "dress":
    case "set":
      return "The garment is the whole outfit, with simple flat sandals; nothing added over or under it.";
    default:
      return "Style the rest in plain neutral pieces so the garment is the subject; simple flat sandals.";
  }
}

function knownLine(known: KnownGarment): string {
  const bits = [
    known.title && `"${String(known.title).trim()}"`,
    known.type && `type: ${String(known.type).trim()}`,
    known.color && `colourway: ${String(known.color).trim()}`,
    known.fabric && `fabric: ${String(known.fabric).trim()}`,
  ].filter(Boolean);
  return bits.length ? ` The garment is ${bits.join(", ")}.` : "";
}

export interface NoPlatePromptInput {
  view: PresetView;
  framing: PlateFraming;
  category: ShotCategory;
  hem: Hem;
  known: KnownGarment;
  note?: string;
  garmentCount: number;
  anchored: boolean;
}

export function noPlatePrompt(o: NoPlatePromptInput): string {
  const g0 = 3, g1 = g0 + Math.max(1, o.garmentCount) - 1;
  const garmentRefs = o.garmentCount > 1
    ? `Input images ${g0} to ${g1} are product photographs of ONE garment: image ${g0} is its front and image ${g0 + 1} its back.`
    : `Input image ${g0} is a product photograph of the garment.`;
  const parts = [
    "Input images 1 and 2 are the face references of our house model: this woman's exact face, bone structure, eyes, " +
    "brows, nose, lips, skin tone, hair colour and hairstyle (image 2 shows her smiling). She must be unmistakably the " +
    "same person; copy the likeness, not the picture — the references set nothing about pose, framing or clothing.",
    garmentRefs + " She wears exactly that garment: same colour, print, fabric, cut, length, neckline, sleeves, closures " +
    "and details, worn as designed, nothing added or removed." + knownLine(o.known),
    styling(o.category, o.hem),
    o.anchored
      ? "The LAST input image is the approved FRONT view of this same shoot: the same woman, the same garment worn the " +
        "same way, the same styling, shoes and backdrop. Only the camera angle changes for this view; match its garment " +
        "length, fit, colour and every detail."
      : "",
    VIEW[o.view],
    FRAMING[o.framing],
    HOUSE,
    o.note ? `Operator correction for this view: ${o.note}.` : "",
  ];
  return parts.filter(Boolean).join(" ");
}

let configured = false;
function ensureConfigured() {
  if (configured) return;
  const key = process.env.FAL_KEY;
  if (!key) throw new Error("FAL_KEY environment variable is missing.");
  fal.config({ credentials: key });
  configured = true;
}

export interface NoPlateRender {
  url: string;
  ms: number;
  endpoint: string;
}

export async function renderNoPlate(o: {
  prompt: string;
  imageUrls: string[];
  variant: NoPlateVariant;
  size?: { width: number; height: number };
  quality?: "auto" | "low" | "medium" | "high" | "xhigh" | "max";
}): Promise<NoPlateRender> {
  ensureConfigured();
  const endpoint = `openai/gpt-image-2.5/${o.variant}/edit`;
  const started = Date.now();
  const res = await fal.subscribe(endpoint, {
    input: {
      prompt: o.prompt,
      image_urls: o.imageUrls,
      image_size: o.size ?? { ...NO_PLATE_SIZE },
      quality: o.quality ?? "high",
      output_format: "png",
      num_images: 1,
    },
    logs: false,
  });
  const url = (res as any)?.data?.images?.[0]?.url;
  if (typeof url !== "string") throw new Error(`${endpoint} returned no image`);
  return { url, ms: Date.now() - started, endpoint };
}

export interface NoPlateShotInput {
  origin: string;
  face: HouseFace;
  variant: NoPlateVariant;
  view: PresetView;
  framing: PlateFraming;
  category: ShotCategory;
  hem: Hem;
  known: KnownGarment;
  note: string;
  garmentImageUrls: string[];
  anchorImageUrl: string;
}

/** One view, start to finish, as the /api/model-shots response body. */
export async function shootNoPlate(o: NoPlateShotInput) {
  const faces = await faceRefUrls(o.face, o.origin);
  const prompt = noPlatePrompt({
    view: o.view, framing: o.framing, category: o.category, hem: o.hem, known: o.known, note: o.note,
    garmentCount: o.garmentImageUrls.length, anchored: Boolean(o.anchorImageUrl),
  });
  const r = await renderNoPlate({
    prompt, imageUrls: noPlateImageUrls(faces, o.garmentImageUrls, o.anchorImageUrl), variant: o.variant,
  });
  console.log(`[no-plate] ${o.view} ${o.face}/${o.variant} ${r.ms}ms`);
  return {
    ok: true as const, view: o.view, url: r.url, prompt,
    engine: "gpt25" as const, face: o.face, variant: o.variant, ms: r.ms,
    humanModelId: `face:${o.face}`, poseId: "no-plate", assigned: null,
    category: o.category, hem: o.hem, framing: o.framing,
    anchored: Boolean(o.anchorImageUrl), faceAnchored: false,
    note: o.note || undefined, corrections: [] as string[],
  };
}
