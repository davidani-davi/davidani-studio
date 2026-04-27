import { NextResponse } from "next/server";
import {
  generateProductDesignConcepts,
  type ProductDesignConcept,
} from "@/lib/fal";
import { generateViaKie } from "@/lib/kie";

export const runtime = "nodejs";
export const maxDuration = 300;

const RESEARCH_SOURCES = [
  {
    title: "Free People Best Sellers",
    url: "https://www.freepeople.com/best-sellers/",
  },
  {
    title: "Free People 2026 Trend Report",
    url: "https://www.freepeople.com/2026-fashion-trends-forecast-blog/",
  },
  {
    title: "Anthropologie New Clothes",
    url: "https://www.anthropologie.com/new-clothes/",
  },
  {
    title: "Aritzia Denim",
    url: "https://www.aritzia.com/us/en/clothing/pants/jeans-1",
  },
  {
    title: "Aritzia Jackets",
    url: "https://www.aritzia.com/us/en/clothing/coats-jackets/modal",
  },
];

function compactPageText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 1800);
}

function extractSignals(text: string): string[] {
  const phrases = [
    /We The Free [A-Z][A-Za-z0-9 '&-]+/g,
    /Pilcro [A-Z][A-Za-z0-9 '&-]+/g,
    /AGOLDE [A-Z][A-Za-z0-9 '&-]+/g,
    /Citizens of Humanity [A-Z][A-Za-z0-9 '&-]+/g,
    /[A-Z][A-Za-z0-9 '&-]+ Jeans/g,
    /[A-Z][A-Za-z0-9 '&-]+ Jacket/g,
    /[A-Z][A-Za-z0-9 '&-]+ Cardigan/g,
    /[A-Z][A-Za-z0-9 '&-]+ Dress/g,
  ];
  const found = new Set<string>();
  for (const pattern of phrases) {
    for (const match of text.matchAll(pattern)) {
      const value = match[0].replace(/\s+/g, " ").trim();
      if (value.length > 4 && value.length < 80) found.add(value);
    }
  }
  return [...found].slice(0, 16);
}

async function fetchTrendResearch(): Promise<{
  text: string;
  signals: string[];
  sources: { title: string; url: string }[];
}> {
  const pages = await Promise.allSettled(
    RESEARCH_SOURCES.map(async (source) => {
      const res = await fetch(source.url, {
        cache: "no-store",
        headers: {
          "User-Agent":
            "Mozilla/5.0 (compatible; DaviDaniStudio/1.0; fashion trend research)",
        },
      });
      if (!res.ok) throw new Error(`${source.title} HTTP ${res.status}`);
      const text = compactPageText(await res.text());
      return { ...source, text };
    })
  );

  const ok = pages
    .filter((page): page is PromiseFulfilledResult<{ title: string; url: string; text: string }> =>
      page.status === "fulfilled"
    )
    .map((page) => page.value);
  const signals = ok.flatMap((page) => extractSignals(page.text)).slice(0, 24);
  const text = ok
    .map((page) => `${page.title} (${page.url}): ${page.text}`)
    .join("\n\n")
    .slice(0, 6500);

  return {
    text,
    signals,
    sources: ok.map(({ title, url }) => ({ title, url })),
  };
}

function visualPrompt(concept: ProductDesignConcept, detectedCategory: string): string {
  return (
    `${concept.imageGenerationPrompt}\n\n` +
    `Render one clean commercial boutique product visual for "${concept.productName}" as the ${concept.assortmentRole || "assortment"} option. ` +
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

export async function POST(req: Request) {
  try {
    const { imageUrl, refinement } = (await req.json()) as {
      imageUrl?: string;
      refinement?: string;
    };
    if (!imageUrl || typeof imageUrl !== "string") {
      return NextResponse.json(
        { ok: false, error: "imageUrl is required" },
        { status: 400 }
      );
    }

    const research = await fetchTrendResearch();
    const result = await generateProductDesignConcepts(
      imageUrl,
      typeof refinement === "string" ? refinement : undefined,
      research.text
    );

    const visualResults = await Promise.all(
      result.concepts.map((concept) =>
        generateViaKie({
          prompt: visualPrompt(concept, result.detectedCategory),
          imageUrls: [imageUrl],
          numImages: 1,
          aspectRatio: "4:5",
          format: "png",
          model: "nano-banana-2",
        })
      )
    );

    result.concepts = result.concepts.map((concept, index) => ({
      ...concept,
      visualUrl: visualResults[index]?.images?.[0]?.url,
    }));
    result.trendSignals = research.signals;
    result.researchSources = research.sources;

    return NextResponse.json({ ok: true, result });
  } catch (err: any) {
    console.error("[api/design-studio/concepts]", err);
    return NextResponse.json(
      { ok: false, error: err?.message || "Product design generation failed" },
      { status: 500 }
    );
  }
}
