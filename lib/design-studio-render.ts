import { type ProductDesignConcept } from "@/lib/fal";
import { generateViaKie } from "@/lib/kie";

export function designVisualPrompt(
  concept: ProductDesignConcept,
  detectedCategory: string
): string {
  return (
    `${concept.imageGenerationPrompt}\n\n` +
    `Render one clean commercial boutique product visual for "${concept.productName}" as the ${
      concept.assortmentRole || "assortment"
    } option. ` +
    `Garment category must stay ${detectedCategory}. Show the full garment clearly on a simple warm neutral studio background. ` +
    `No text, labels, logos, callouts, hang tags, watermarks, collage frames, or infographic elements. ` +
    `Do not recreate the uploaded product. Do not include a version that looks like the original. ` +
    `Use the uploaded image only to understand category and customer world. ` +
    (concept.customerReasonToBuy
      ? `Design reason to buy: ${concept.customerReasonToBuy}. `
      : "") +
    `Build the features into the garment: ${concept.keyFeatures.join(", ")}. ` +
    `Photorealistic ecommerce fashion product photography, boutique catalog quality.`
  );
}

export async function renderDesignVisual(input: {
  concept: ProductDesignConcept;
  detectedCategory: string;
  imageUrl: string;
}): Promise<string> {
  const result = await generateViaKie({
    prompt: designVisualPrompt(input.concept, input.detectedCategory),
    imageUrls: [input.imageUrl],
    numImages: 1,
    aspectRatio: "4:5",
    format: "png",
    model: "nano-banana-2",
  });
  const url = result.images[0]?.url;
  if (!url) throw new Error("Image renderer returned no URL.");
  return url;
}
