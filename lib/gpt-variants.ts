import sharp from "sharp";
import type { PresetView } from "./models-registry";

/**
 * GPT Image 2 variants for the model-shots run (2026-09-05).
 *
 * David judged the six-style bake-off: the v1 prompt pipeline on GPT Image 2
 * beat both the try-on engine and nano-banana-2. That run used fal's
 * `openai/gpt-image-2/edit` with no size asked for (auto → 1200×1792) and the
 * full 1,348-word prompt. Three variants isolate one change each so the next
 * judgement says WHICH change helped:
 *
 *   native4k  the same prompt, output asked for at 2048×3072 (2:3, both edges
 *             multiples of 16, 6.3 MP under the model's 8.3 MP cap) — the
 *             deliverable is 2000×3000, so no upsampling on the way out.
 *   lean      the same size, the prompt replaced by a ~150-word brief built
 *             from the garment contract: which photo is the person, which is
 *             the garment, what to change, what to keep. No L1–L5 prose.
 *   masked    the same prompt as native4k, plus a mask that marks the clothing
 *             region to repaint (white) and everything else to keep (black).
 *             The mask is the difference between the plate and the try-on
 *             engine's result on it — the try-on changes only the garment, so
 *             its footprint IS the region a garment occupies on this plate.
 *             The plate goes in upscaled to 2048×3072 with a mask of the same
 *             size, because the edit returns the input's size when masked.
 */
export type GptVariant = "auto" | "native4k" | "lean" | "masked";

export const GPT_NATIVE_SIZE = { width: 2048, height: 3072 } as const;

export function gptVariantOf(v: unknown): GptVariant {
  return v === "native4k" || v === "lean" || v === "masked" ? v : "auto";
}

/** The one part of the plate a variant may change, from the shot category. */
export function bodyRegionFor(category: string | null | undefined): string {
  switch (String(category || "").trim().toLowerCase()) {
    case "top":
    case "outerwear":
      return "what she wears on her upper body";
    case "pants":
    case "skirt":
    case "shorts":
      return "what she wears on her lower body";
    case "dress":
    case "romper":
    case "jumpsuit":
      return "her whole outfit";
    default:
      return "the garment she wears";
  }
}

const VIEW_LINE: Record<PresetView, string> = {
  front: "This is the front view.",
  side: "This is the side view: the garment as it reads from the side of the pose in photo 1.",
  back: "This is the back view: the garment's back, as photo 1 already shows the model from behind.",
  full: "This is the full-length view.",
} as Record<PresetView, string>;

/**
 * The lean brief. Roles of the photos, the garment as the contract names it,
 * what to change, what to keep, which view. Everything the 1,348-word stack
 * says eighteen times about hems is said once.
 */
export function leanBrief(o: {
  garment: string;
  features?: string;
  category?: string | null;
  view: PresetView;
  hasBackPhoto?: boolean;
  note?: string;
}): string {
  const garment = String(o.garment || "").trim().replace(/\.$/, "");
  const features = String(o.features || "").trim().replace(/\.$/, "");
  const region = bodyRegionFor(o.category);
  const photos = o.hasBackPhoto
    ? "Photo 1 is a real studio photograph of our model. Photo 2 is the front of the garment to put on her and photo 3 is its back."
    : "Photo 1 is a real studio photograph of our model. Photo 2 is the garment to put on her.";
  const parts = [
    photos,
    `Replace only ${region} with the garment in photo 2, exactly as it is: ${garment}.`,
    features ? `Details to carry over: ${features}.` : "",
    "Fit and drape it the way it hangs in the garment photo: the same length, sleeve length, closure, neckline, print scale and colour. Do not shorten, crop, tuck or restyle it to match what she wore before.",
    "Keep every other pixel of photo 1 as it is: her face, hair, skin, hands, jewellery, pose, the clothing that is not being replaced, the cream backdrop, the lighting, the camera and the crop.",
    VIEW_LINE[o.view] || VIEW_LINE.front,
    o.note ? `Operator correction for this view: ${String(o.note).trim()}.` : "",
    "Output one photograph, nothing else: no text, no collage, no alternate views.",
  ].filter(Boolean);
  return parts.join(" ");
}

/**
 * A repaint mask from the try-on's footprint. Pixels where the try-on result
 * differs from the plate by more than `threshold` (max channel delta, 0–255)
 * are the garment; the region is grown by `growPx` and feathered so the edit
 * has room for a longer hem or a fuller sleeve than the try-on drew. White =
 * repaint, black = keep. Returned at `size` (the size the plate goes in at).
 */
export async function garmentMaskFromDiff(
  plate: Buffer,
  tryon: Buffer,
  o: { size: { width: number; height: number }; threshold?: number; growPx?: number; featherPx?: number }
): Promise<Buffer> {
  const { width, height } = o.size;
  const threshold = o.threshold ?? 28;
  const grow = o.growPx ?? Math.round(height * 0.02);
  const feather = o.featherPx ?? Math.max(2, Math.round(height * 0.004));
  // compare at a working size — the diff needs no more than ~1 MP
  const w = Math.min(width, 800);
  const h = Math.round((height * w) / width);
  const a = await sharp(plate).resize(w, h, { fit: "fill" }).removeAlpha().raw().toBuffer();
  const b = await sharp(tryon).resize(w, h, { fit: "fill" }).removeAlpha().raw().toBuffer();
  let m: Uint8Array = new Uint8Array(w * h);
  for (let i = 0, p = 0; i < m.length; i++, p += 3) {
    const d = Math.max(Math.abs(a[p] - b[p]), Math.abs(a[p + 1] - b[p + 1]), Math.abs(a[p + 2] - b[p + 2]));
    m[i] = d > threshold ? 255 : 0;
  }
  // grow (separable max filter) at the working size — sharp's own blur and
  // threshold do not compose on a one-channel buffer, so this stays in JS
  m = dilate(m, w, h, Math.max(1, Math.round((grow * w) / width)));
  // up to the asked size, nearest neighbour, then feather (separable box blur)
  const full: Uint8Array = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    const sy = Math.min(h - 1, Math.floor((y * h) / height)) * w;
    for (let x = 0; x < width; x++) full[y * width + x] = m[sy + Math.min(w - 1, Math.floor((x * w) / width))];
  }
  const soft = boxBlur(full, width, height, Math.max(1, feather));
  return sharp(Buffer.from(soft.buffer, soft.byteOffset, soft.byteLength), { raw: { width, height, channels: 1 } }).png().toBuffer();
}

function dilate(m: Uint8Array, w: number, h: number, r: number): Uint8Array {
  const tmp = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      let v = 0;
      for (let k = Math.max(0, x - r); k <= Math.min(w - 1, x + r) && !v; k++) v = m[row + k];
      tmp[row + x] = v;
    }
  }
  const out = new Uint8Array(w * h);
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      let v = 0;
      for (let k = Math.max(0, y - r); k <= Math.min(h - 1, y + r) && !v; k++) v = tmp[k * w + x];
      out[y * w + x] = v;
    }
  }
  return out;
}

function boxBlur(m: Uint8Array, w: number, h: number, r: number): Uint8Array {
  const pass = (src: Uint8Array, dst: Uint8Array, stride: number, len: number, lines: number, lineStride: number) => {
    const n = 2 * r + 1;
    for (let l = 0; l < lines; l++) {
      const base = l * lineStride;
      let sum = 0;
      for (let k = -r; k <= r; k++) sum += src[base + Math.min(len - 1, Math.max(0, k)) * stride];
      for (let i = 0; i < len; i++) {
        dst[base + i * stride] = Math.round(sum / n);
        const add = Math.min(len - 1, i + r + 1), drop = Math.max(0, i - r);
        sum += src[base + add * stride] - src[base + drop * stride];
      }
    }
  };
  const tmp = new Uint8Array(w * h), out = new Uint8Array(w * h);
  pass(m, tmp, 1, w, h, w);   // horizontal: lines are rows
  pass(tmp, out, w, h, w, 1); // vertical: lines are columns
  return out;
}

/** Share of a mask that is "repaint" — a sanity number for the response. */
export async function maskCoverage(mask: Buffer): Promise<number> {
  const { data, info } = await sharp(mask).greyscale().raw().toBuffer({ resolveWithObject: true });
  let on = 0;
  for (let i = 0; i < data.length; i++) if (data[i] > 127) on++;
  return data.length ? on / (info.width * info.height) : 0;
}
