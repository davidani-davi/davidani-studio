import { getStyleReferenceUrl, type ProductDesignConcept } from "@/lib/fal";
import { generateViaKie } from "@/lib/kie";

function inferReferenceKind(text: string): "pants" | "other" {
  const pantsWords = [
    "pants",
    "trousers",
    "jeans",
    "shorts",
    "chinos",
    "joggers",
    "sweatpants",
    "slacks",
    "leggings",
    "khakis",
    "corduroys",
    "barrel",
    "wide-leg",
    "straight-leg",
    "cargo pant",
  ];
  return pantsWords.some((word) => new RegExp(`\\b${word}\\b`, "i").test(text))
    ? "pants"
    : "other";
}

export function designVisualPrompt(
  concept: ProductDesignConcept,
  detectedCategory: string
): string {
  return (
    `${concept.imageGenerationPrompt}\n\n` +
    `Use the first reference image as the product-photo canvas and style anchor: keep its clean catalog composition, neutral background, lighting, flat-lay/product-photo perspective, and visual polish. ` +
    `Use the uploaded product image only as category/customer-world context, not as a design template. ` +
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
  const referenceKind = inferReferenceKind(
    `${input.detectedCategory} ${input.concept.productName} ${input.concept.imageGenerationPrompt}`
  );
  const styleReferenceUrl = await getStyleReferenceUrl(referenceKind);
  const imageUrls = styleReferenceUrl
    ? [styleReferenceUrl, input.imageUrl]
    : [input.imageUrl];

  const result = await generateViaKie({
    prompt: designVisualPrompt(input.concept, input.detectedCategory),
    imageUrls,
    numImages: 1,
    aspectRatio: "4:5",
    format: "png",
    model: "nano-banana-2",
  });
  const url = result.images[0]?.url;
  if (!url) throw new Error("Image renderer returned no URL.");
  return url;
}
