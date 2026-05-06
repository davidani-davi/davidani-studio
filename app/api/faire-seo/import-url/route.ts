import { CORE_EXTRACTION_FIELDS, type ExtractedField, type FaireUploadedAsset } from "@/lib/faire-seo/schema";

export const runtime = "nodejs";
export const maxDuration = 60;

function decodeHtml(value = "") {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function stripTags(value = "") {
  return decodeHtml(value.replace(/<[^>]*>/g, " "));
}

function meta(html: string, name: string) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return decodeHtml(
    html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)["']`, "i"))?.[1] ||
      html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escaped}["']`, "i"))?.[1] ||
      ""
  );
}

function titleFromHtml(html: string) {
  const raw =
    meta(html, "og:title") ||
    html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ||
    "";
  return decodeHtml(raw)
    .replace(/^Wholesale\s+/i, "")
    .replace(/\s+for your store\s+-\s+Faire$/i, "")
    .replace(/\s+-\s+Faire$/i, "")
    .trim();
}

function descriptionFromHtml(html: string) {
  const block = html.match(/<h2[^>]*>\s*Description\s*<\/h2>[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/i)?.[1];
  return stripTags(block || meta(html, "description") || meta(html, "og:description"));
}

function detailText(html: string) {
  const block = html.match(/<h2[^>]*>\s*Details\s*<\/h2>[\s\S]*?(?:<hr|<h2|See \d+ product reviews)/i)?.[0] || "";
  return stripTags(block.replace(/^Details\s*/i, ""));
}

function textBetween(html: string, label: string) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = stripTags(html).match(new RegExp(`${escaped}\\s+([^\\n|]+?)(?=\\s+(?:Color|Prepack|Size Chart|Shipping|Description|Details|WSP|MSRP)|$)`, "i"));
  return match?.[1]?.trim() || "";
}

function extractSkus(title: string, description: string, details: string) {
  const all = `${title} ${description} ${details}`;
  const found = [...all.matchAll(/\b[DP][A-Z]?\d{4,6}\b/g)].map((match) => match[0]);
  const regular = found.find((sku) => !sku.startsWith("P")) || found[0] || "";
  const plus = found.find((sku) => sku.startsWith("P")) || "";
  return { regular, plus };
}

function productTypeFromTitle(title: string) {
  const match = title.match(/\b(jacket|coat|pants|dress|top|blouse|shirt|sweater|cardigan|skirt|shorts|romper|jumpsuit|vest|hoodie|sweatshirt)\b/i);
  return match ? match[1].replace(/\b\w/g, (letter) => letter.toUpperCase()) : "";
}

function imageAssets(html: string, title: string, productId: string): FaireUploadedAsset[] {
  const imgTags = [...html.matchAll(/<img\b[^>]*>/g)].map((match) => match[0]);
  const seen = new Set<string>();
  const assets: FaireUploadedAsset[] = [];

  for (const tag of imgTags) {
    const alt = decodeHtml(tag.match(/\balt=["']([^"']*)["']/i)?.[1] || "");
    if (!/Davi|DJ|PJ|Wholesale/i.test(alt)) continue;
    const src =
      tag.match(/\bsrc=["']([^"']+)["']/i)?.[1] ||
      tag.match(/\bsrcSet=["']([^"']+)["']/i)?.[1]?.split(/\s+/)[0] ||
      "";
    const url = decodeHtml(src);
    if (!url || !/^https:\/\/cdn\.faire\.com\//.test(url)) continue;
    const normalized = url.replace(/height=\d+/g, "height=1200").replace(/width=\d+/g, "width=900");
    const key = normalized.split("?")[0];
    if (seen.has(key)) continue;
    seen.add(key);
    assets.push({
      id: `${productId || "faire"}-${assets.length}`,
      name: alt || `${title || "Faire product"} image ${assets.length + 1}`,
      url: normalized,
      hash: key,
      role: assets.length === 0 ? "product_photo" : "colorway_photo",
    });
  }

  const ogImage = meta(html, "og:image");
  if (ogImage && assets.length === 0) {
    assets.push({
      id: `${productId || "faire"}-og`,
      name: `${title || "Faire product"} hero image`,
      url: ogImage,
      hash: ogImage.split("?")[0],
      role: "product_photo",
    });
  }

  return assets.slice(0, 18);
}

function fieldsFromImport(input: {
  title: string;
  description: string;
  details: string;
  regularSku: string;
  plusSku: string;
  color: string;
  price: string;
  productType: string;
}): ExtractedField[] {
  const values: Record<string, string> = {
    currentTitle: input.title,
    styleNumber: input.regularSku,
    plusStyleNumber: input.plusSku,
    currentDescription: input.description,
    colorNames: input.color,
    priceMsrp: input.price,
    existingMetadata: input.details,
    productCategory: input.productType,
    garmentType: input.productType,
    searchableProductName: input.productType,
  };

  return CORE_EXTRACTION_FIELDS.map((field) => {
    const value = values[field.id] || "";
    return {
      ...field,
      value,
      confidence: value ? "high" : "missing",
      source: value ? "inferred" : "missing",
      notes: value ? "Imported from public Faire preview link." : "",
    };
  });
}

export async function POST(req: Request) {
  try {
    const { url } = (await req.json()) as { url?: string };
    if (!url || !/^https:\/\/(www\.)?faire\.com\/product\//i.test(url)) {
      return Response.json({ ok: false, error: "Paste a valid Faire product preview URL." }, { status: 400 });
    }

    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124 Safari/537.36",
      },
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`Faire returned HTTP ${res.status}`);

    const html = await res.text();
    const productId = url.match(/\/product\/([^/?#]+)/i)?.[1] || "";
    const title = titleFromHtml(html);
    const description = descriptionFromHtml(html);
    const details = detailText(html);
    const { regular, plus } = extractSkus(title, description, details);
    const color = textBetween(html, "Color");
    const prepack = textBetween(html, "Prepack");
    const price = stripTags(html.match(/WSP[\s\S]{0,160}\$[\d.]+\s+MSRP/i)?.[0] || "").match(/\$[\d.]+\s+MSRP/i)?.[0] || "";
    const productType = productTypeFromTitle(title);
    const fields = fieldsFromImport({
      title,
      description: [description, prepack ? `Prepack: ${prepack}` : ""].filter(Boolean).join("\n"),
      details,
      regularSku: regular,
      plusSku: plus,
      color,
      price,
      productType,
    });
    const assets = imageAssets(html, title, productId);

    return Response.json({ ok: true, url, title, description, details, fields, assets });
  } catch (err: any) {
    return Response.json(
      { ok: false, error: err?.message || "Could not import Faire product URL." },
      { status: 500 }
    );
  }
}
