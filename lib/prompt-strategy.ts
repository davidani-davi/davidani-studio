import type { ModelId } from "./models";

function stripNegativePrompt(prompt: string): string {
  return prompt.replace(/\s*Negative prompt:[\s\S]*$/i, "").trim();
}

function normalizeWhitespace(prompt: string): string {
  return prompt.replace(/[ \t]+/g, " ").replace(/\s+\n/g, "\n").trim();
}

const GARMENT_SOURCE_FIREWALL =
  "Garment source firewall: the first image may control model identity, body, pose, camera, framing, lighting, and background only. " +
  "Do not borrow any garment category, silhouette, crop point, body length, sleeve length, hem position, neckline, waistband exposure, fabric, color, trim, print, or styling from the first image's existing clothing. " +
  "Every garment feature must come from the uploaded garment reference image or explicit text instructions. If the first image shows a cropped top, cropped jacket, short hem, exposed waistband, tucked styling, or different garment length, ignore those old garment features completely unless the uploaded garment itself has the same feature.";

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

export function optimizePromptForModel(modelId: ModelId, prompt: string): string {
  if (modelId === "gpt-image") {
    return optimizeForGptImage(prompt);
  }
  if (modelId === "nano-banana") {
    return optimizeForNanoBanana(prompt);
  }
  return prompt;
}
