import { NextResponse } from "next/server";
import { generateInspirationTags } from "@/lib/fal";

export const runtime = "nodejs";
export const maxDuration = 120;

function absoluteUrl(value: string, base: string): string | undefined {
  try {
    return new URL(value, base).toString();
  } catch {
    return undefined;
  }
}

function extractMeta(html: string, sourceUrl: string) {
  const contentFromTag = (tag: string) =>
    tag.match(/\scontent=["']([^"']+)["']/i)?.[1]?.replace(/&amp;/g, "&").trim() || "";
  const meta = (name: string) => {
    const tags = html.match(/<meta[^>]+>/gi) || [];
    for (const tag of tags) {
      if (
        new RegExp(`\\s(?:property|name)=["']${name.replace(".", "\\.")}["']`, "i").test(tag)
      ) {
        const content = contentFromTag(tag);
        if (content) return content;
      }
    }
    return "";
  };
  const pickTitle = () =>
    meta("og:title") ||
    meta("twitter:title") ||
    html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim() ||
    "";
  const title =
    pickTitle().replace(/&amp;/g, "&") || new URL(sourceUrl).hostname.replace(/^www\./, "");
  const description = meta("og:description") || meta("description");
  const image = meta("og:image") || meta("twitter:image");
  const imageUrl = image ? absoluteUrl(image, sourceUrl) : undefined;
  return {
    title,
    description,
    imageUrl,
    context: [title, description].filter(Boolean).join("\n"),
  };
}

function isProbablyImageUrl(url: string): boolean {
  return /\.(png|jpe?g|webp|gif)(\?.*)?$/i.test(url);
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const sourceUrl = String(body?.url || "").trim();
    let imageUrl = String(body?.imageUrl || "").trim();
    let title = "";
    let context = "";

    if (!imageUrl && sourceUrl) {
      const parsed = new URL(sourceUrl);
      if (isProbablyImageUrl(parsed.toString())) {
        imageUrl = parsed.toString();
      } else {
        const res = await fetch(parsed.toString(), {
          cache: "no-store",
          headers: {
            "User-Agent":
              "Mozilla/5.0 (compatible; DaviDaniStudio/1.0; inspiration library)",
          },
        });
        if (!res.ok) throw new Error(`Could not read URL: HTTP ${res.status}`);
        const html = await res.text();
        const meta = extractMeta(html, parsed.toString());
        title = meta.title;
        context = meta.context;
        imageUrl = meta.imageUrl || "";
      }
    }

    if (!imageUrl) {
      return NextResponse.json(
        { ok: false, error: "Upload an image or provide a URL with a preview image." },
        { status: 400 }
      );
    }

    const tags = await generateInspirationTags(
      imageUrl,
      [title ? `Page title: ${title}` : "", context].filter(Boolean).join("\n")
    );

    return NextResponse.json({
      ok: true,
      imageUrl,
      title: tags.title || title,
      category: tags.category,
      tags: tags.tags,
      note: tags.note,
    });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || "Failed to analyze inspiration" },
      { status: 400 }
    );
  }
}
