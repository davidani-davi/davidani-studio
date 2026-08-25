import type { ModelId } from "./models";

function stripNegativePrompt(prompt: string): string {
  return prompt.replace(/\s*Negative prompt:[\s\S]*$/i, "").trim();
}

function normalizeWhitespace(prompt: string): string {
  return prompt.replace(/[ \t]+/g, " ").replace(/\s+\n/g, "\n").trim();
}

/**
 * Which studio a prompt came from. This drives WHICH prefix gets stacked in
 * front of the prompt, and the two are near-opposites:
 *
 * - "model-swap"   → Model Studio. Image 0 is a photo of a human model; the
 *                    output must stay an on-model photo. Explicitly forbids
 *                    flat lays, because early runs kept collapsing the model
 *                    out of the frame and returning a bare garment.
 * - "product-shot" → Image Studio. Image 0 is a garment-only studio canvas and
 *                    the output must BE a flat lay. There is no model to
 *                    preserve, and the model-swap prefix's "do not output a
 *                    flat lay" line describes the exact deliverable — applying
 *                    it here put an instruction at position zero telling the
 *                    model not to make the thing we were asking for.
 *
 * Defaults to "model-swap" so callers that predate this parameter keep their
 * existing behaviour; Image Studio passes "product-shot" explicitly.
 */
export type PromptIntent = "model-swap" | "product-shot";

const GARMENT_SOURCE_FIREWALL =
  "Garment source firewall: the first image may control model identity, body, pose, camera, framing, lighting, and background only. " +
  "Do not borrow any garment category, silhouette, crop point, body length, sleeve length, hem position, neckline, waistband exposure, fabric, color, trim, print, or styling from the first image's existing clothing. " +
  "Every garment feature must come from the uploaded garment reference image or explicit text instructions. If the first image shows a cropped top, cropped jacket, short hem, exposed waistband, tucked styling, or different garment length, ignore those old garment features completely unless the uploaded garment itself has the same feature.";

/**
 * Product-shot counterpart to GARMENT_SOURCE_FIREWALL. Same job — stop the
 * canvas from dictating the garment — but with no references to model
 * identity, body, or pose, because a flat-lay canvas has none of those and
 * naming them invites the model to invent a wearer.
 */
const PRODUCT_CANVAS_FIREWALL =
  "Canvas source firewall: the first image is a studio canvas. It controls the background, lighting, shadow character, camera angle, framing, composition, and the scale and placement of the garment within the frame — and nothing else. " +
  "Do not borrow any garment category, silhouette, cut, fit, length, sleeve or leg shape, hem position, neckline, waistband, fabric, color, print, trim, or hardware from the garment shown on the canvas. " +
  "Every garment feature must come from the uploaded garment reference image or explicit text instructions. If the canvas shows a different garment type or a different silhouette, ignore those features completely.";

/**
 * Prefix for Image Studio. Affirms the flat lay instead of forbidding it.
 */
const PRODUCT_SHOT_PREFIX =
  "Edit the first image. Treat the first image as the base canvas that must be preserved for background, lighting, shadow character, camera angle, framing, composition, and garment scale within the frame. " +
  "Use every additional image only as a visual reference for the garment or product details. " +
  `${PRODUCT_CANVAS_FIREWALL} ` +
  "The output is a product-only ecommerce image: a single garment photographed by itself on a clean studio background, with no human model, no face, no hands, no body, and no visible wearer of any kind. " +
  "Output exactly one product image — not a collage, not a side-by-side, not a grid, and not a set of alternate views.";

function optimizeForProductShot(prompt: string, modelId: ModelId): string {
  const cleaned =
    modelId === "gpt-image"
      ? normalizeWhitespace(stripNegativePrompt(prompt))
      : normalizeWhitespace(prompt);
  return `${PRODUCT_SHOT_PREFIX} ${cleaned}`;
}

function optimizeForGptImage(prompt: string): string {
  const cleaned = normalizeWhitespace(stripNegativePrompt(prompt));

  const sharedPrefix =
    "Edit the first image. Treat the first image as the base image to preserve. " +
    "Use any additional input images only as reference images for the garment, silhouette, texture, and design details requested below. " +
    `${GARMENT_SOURCE_FIREWALL} ` +
    "Make only the requested wardrobe and styling edits, and preserve everything else from the first image unless the instructions below explicitly say to change it.";

  if (/^Fashion catalog garment-swap edit on a human model\./i.test(cleaned)) {
    return (
      `${sharedPrefix} ` +
      "This is a model-photo edit: preserve the model's identity, face, pose family, camera angle, background, lighting, and exposure from the first image. " +
      "Use the reference garment image only to restyle what the model is wearing. " +
      cleaned.replace(
        /^Fashion catalog garment-swap edit on a human model\.\s*/i,
        "Create a polished fashion catalog edit of the first image. "
      )
    );
  }

  if (/^Catalog garment-swap edit\./i.test(cleaned)) {
    return (
      `${sharedPrefix} ` +
      "This is a studio product-photo edit: preserve the first image's composition, framing, background, lighting, and shadow character. " +
      "Use the additional reference garment image or images only to define the replacement product. " +
      cleaned.replace(
        /^Catalog garment-swap edit\.\s*/i,
        "Create a polished e-commerce catalog edit of the first image. "
      )
    );
  }

  return `${sharedPrefix} ${cleaned}`;
}

function optimizeForNanoBanana(prompt: string): string {
  const cleaned = normalizeWhitespace(prompt);
  const sharedPrefix =
    "Edit the first image. Treat the first image as the base canvas that must be preserved for composition, subject, pose, camera angle, lighting, and background. " +
    "Use every additional image only as a visual reference for the garment or product details. " +
    `${GARMENT_SOURCE_FIREWALL} ` +
    "Do not use an additional reference image as the final layout. Do not output a standalone product photo, flat lay, hanger image, mannequin image, torso display form, or isolated garment unless the prompt explicitly asks for a product-only image. ";

  return `${sharedPrefix}${cleaned}`;
}

export function optimizePromptForModel(
  modelId: ModelId,
  prompt: string,
  intent: PromptIntent = "model-swap"
): string {
  // Product shots get the same prefix regardless of model. The model-specific
  // branches below differ only in how they talk about preserving a human
  // subject, which is irrelevant to a flat lay.
  if (intent === "product-shot") {
    return optimizeForProductShot(prompt, modelId);
  }
  if (modelId === "gpt-image") {
    return optimizeForGptImage(prompt);
  }
  if (modelId === "nano-banana") {
    return optimizeForNanoBanana(prompt);
  }
  return prompt;
}
