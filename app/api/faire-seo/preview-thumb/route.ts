export const runtime = "nodejs";
export const maxDuration = 15;

function decodeHtml(value = "") {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function meta(html: string, name: string) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return decodeHtml(
    html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)["']`, "i"))?.[1] ||
      html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escaped}["']`, "i"))?.[1] ||
      ""
  );
}

function firstFaireImage(html: string): string {
  for (const match of html.matchAll(/<img\b[^>]*>/g)) {
    const tag = match[0];
    const alt = decodeHtml(tag.match(/\balt=["']([^"']*)["']/i)?.[1] || "");
    if (!/Davi|DJ|PJ|Wholesale/i.test(alt)) continue;
    const src = tag.match(/\bsrc=["']([^"']+)["']/i)?.[1] || "";
    if (src && /^https:\/\/cdn\.faire\.com\//.test(src)) {
      return decodeHtml(src.replace(/height=\d+/g, "height=300").replace(/width=\d+/g, "width=300"));
    }
  }
  return "";
}

export async function POST(req: Request) {
  try {
    const { url } = (await req.json()) as { url?: string };
    if (!url || !/^https:\/\/(www\.)?faire\.com\/product\//i.test(url)) {
      return Response.json({ ok: false, error: "Invalid Faire URL" }, { status: 400 });
    }
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124 Safari/537.36",
      },
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`Faire ${res.status}`);
    const html = await res.text();
    const thumbnail = firstFaireImage(html) || meta(html, "og:image");
    const title = meta(html, "og:title") || "";
    return Response.json({ ok: true, url, thumbnail, title });
  } catch (err: any) {
    return Response.json(
      { ok: false, error: err?.message || "Preview failed" },
      { status: 500 }
    );
  }
}
