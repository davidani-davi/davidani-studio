import { NextResponse } from "next/server";
import {
  generateProductDesignConcepts,
} from "@/lib/fal";
import { renderDesignVisual } from "@/lib/design-studio-render";
import {
  filterInspirationSources,
  readInspirationIndex,
  type InspirationSource,
} from "@/lib/inspiration-library";

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

type ResearchSource = {
  title: string;
  url: string;
  note?: string;
  approved?: boolean;
};

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

async function fetchTrendResearch(categoryHint = ""): Promise<{
  text: string;
  signals: string[];
  sources: { title: string; url: string }[];
}> {
  const inspirationIndex = await readInspirationIndex();
  const approvedSources = filterInspirationSources(inspirationIndex.sources, categoryHint).map(
    (source: InspirationSource): ResearchSource => ({
      title: `Approved: ${source.title}`,
      url: source.url,
      note: [source.category, source.note].filter(Boolean).join(" - "),
      approved: true,
    })
  );
  const researchSources: ResearchSource[] = [...approvedSources, ...RESEARCH_SOURCES];

  const pages = await Promise.allSettled(
    researchSources.map(async (source) => {
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
    .filter(
      (
        page
      ): page is PromiseFulfilledResult<{
        title: string;
        url: string;
        note?: string;
        approved?: boolean;
        text: string;
      }> => page.status === "fulfilled"
    )
    .map((page) => page.value);
  const signals = ok.flatMap((page) => extractSignals(page.text)).slice(0, 24);
  const text = ok
    .map(
      (page) =>
        `${page.title} (${page.url})${page.note ? `\nSaved note: ${page.note}` : ""}\n${
          page.text
        }`
    )
    .join("\n\n")
    .slice(0, 9000);

  return {
    text,
    signals,
    sources: ok.map(({ title, url }) => ({ title, url })),
  };
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

    const research = await fetchTrendResearch(typeof refinement === "string" ? refinement : "");
    const result = await generateProductDesignConcepts(
      imageUrl,
      typeof refinement === "string" ? refinement : undefined,
      research.text
    );

    const visualResults = await Promise.allSettled(
      result.concepts.map((concept) =>
        renderDesignVisual({
          concept,
          detectedCategory: result.detectedCategory,
          imageUrl,
        })
      )
    );

    result.concepts = result.concepts.map((concept, index) => ({
      ...concept,
      visualUrl:
        visualResults[index]?.status === "fulfilled"
          ? visualResults[index].value
          : undefined,
      visualError:
        visualResults[index]?.status === "rejected"
          ? String(visualResults[index].reason?.message || visualResults[index].reason)
          : undefined,
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
