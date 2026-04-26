import fs from "node:fs/promises";
import path from "node:path";
import { fal } from "@fal-ai/client";
import { list, put } from "@vercel/blob";

export interface LibraryView {
  id: string;
  label: string;
  imageUrl: string;
  prompt?: string;
  createdAt: string;
}

export interface LibraryStyle {
  id: string;
  styleNumber: string;
  userStyleName: string;
  color: string;
  seoName: string;
  seoDescription: string;
  garmentType?: string;
  silhouette?: string;
  fabric?: string;
  season?: string;
  vibeTags?: string[];
  seoTags?: string[];
  faireBullets?: string[];
  libraryTags?: string[];
  createdAt: string;
  updatedAt: string;
  views: LibraryView[];
}

export interface LibraryIndex {
  styles: LibraryStyle[];
}

const STORE_KEY = "style-library/index.json";
const LOCAL_STORE = path.join(process.cwd(), ".data", "style-library.json");

function normalizedStyleNumber(value: string): string {
  return value.trim().toUpperCase().replace(/\s+/g, "");
}

function normalizedColor(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function nowIso(): string {
  return new Date().toISOString();
}

function canUseBlob(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

async function readLocalIndex(): Promise<LibraryIndex> {
  try {
    const raw = await fs.readFile(LOCAL_STORE, "utf8");
    const parsed = JSON.parse(raw) as LibraryIndex;
    return { styles: Array.isArray(parsed.styles) ? parsed.styles : [] };
  } catch {
    return { styles: [] };
  }
}

async function writeLocalIndex(index: LibraryIndex): Promise<void> {
  await fs.mkdir(path.dirname(LOCAL_STORE), { recursive: true });
  await fs.writeFile(LOCAL_STORE, JSON.stringify(index, null, 2));
}

export async function readLibraryIndex(): Promise<LibraryIndex> {
  if (!canUseBlob()) return readLocalIndex();

  try {
    const found = await list({ prefix: STORE_KEY, limit: 1 });
    const blob = found.blobs.find((item) => item.pathname === STORE_KEY) ?? found.blobs[0];
    if (!blob) return { styles: [] };
    const res = await fetch(blob.url, { cache: "no-store" });
    if (!res.ok) return { styles: [] };
    const parsed = (await res.json()) as LibraryIndex;
    return { styles: Array.isArray(parsed.styles) ? parsed.styles : [] };
  } catch (err) {
    console.warn("[style-library] blob read failed, using local fallback:", err);
    return readLocalIndex();
  }
}

export async function writeLibraryIndex(index: LibraryIndex): Promise<void> {
  const sorted = {
    styles: [...index.styles].sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    ),
  };

  if (!canUseBlob()) {
    await writeLocalIndex(sorted);
    return;
  }

  try {
    await put(STORE_KEY, JSON.stringify(sorted, null, 2), {
      access: "public",
      contentType: "application/json",
      allowOverwrite: true,
    });
  } catch (err) {
    console.warn("[style-library] blob write failed, using local fallback:", err);
    await writeLocalIndex(sorted);
  }
}

type StyleIntelligence = {
  seoName: string;
  seoDescription: string;
  garmentType: string;
  silhouette: string;
  fabric: string;
  season: string;
  vibeTags: string[];
  seoTags: string[];
  faireBullets: string[];
  libraryTags: string[];
};

function cleanList(value: unknown, limit = 12): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .slice(0, limit);
}

function fallbackSeo(styleNumber: string, color: string): StyleIntelligence {
  return {
    seoName: `${color} Fashion Style - ${styleNumber}`,
    seoDescription: `${color} fashion style ${styleNumber}. Regenerate SEO after upload to create a garment-specific Faire title and description from the product image.`,
    garmentType: "Fashion style",
    silhouette: "Visible garment silhouette",
    fabric: "Visible fabric",
    season: "Seasonless",
    vibeTags: [],
    seoTags: [styleNumber, color].filter(Boolean),
    faireBullets: [],
    libraryTags: [styleNumber, color].filter(Boolean),
  };
}

function extractTextFromVisionResponse(value: unknown): string {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    return value.map(extractTextFromVisionResponse).filter(Boolean).join("\n");
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    for (const key of ["output", "response", "text", "content", "message"]) {
      const text = extractTextFromVisionResponse(obj[key]);
      if (text) return text;
    }
  }
  return "";
}

function parseSeoJson(text: string, fallback: StyleIntelligence): StyleIntelligence | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const candidate = fenced || text.match(/\{[\s\S]*\}/)?.[0] || text;
  try {
    const parsed = JSON.parse(candidate) as Partial<{
      seoName: string;
      seoDescription: string;
      garmentType: string;
      silhouette: string;
      fabric: string;
      season: string;
      vibeTags: string[];
      seoTags: string[];
      faireBullets: string[];
      libraryTags: string[];
    }>;
    if (!parsed.seoName?.trim() || !parsed.seoDescription?.trim()) return null;
    return {
      seoName: parsed.seoName.trim(),
      seoDescription: parsed.seoDescription.trim(),
      garmentType: parsed.garmentType?.trim() || fallback.garmentType,
      silhouette: parsed.silhouette?.trim() || fallback.silhouette,
      fabric: parsed.fabric?.trim() || fallback.fabric,
      season: parsed.season?.trim() || fallback.season,
      vibeTags: cleanList(parsed.vibeTags, 8),
      seoTags: cleanList(parsed.seoTags, 12),
      faireBullets: cleanList(parsed.faireBullets, 5),
      libraryTags: cleanList(parsed.libraryTags, 16),
    };
  } catch {
    return null;
  }
}

function applyStyleIntelligence(style: LibraryStyle, intelligence: StyleIntelligence) {
  style.seoName = intelligence.seoName;
  style.seoDescription = intelligence.seoDescription;
  style.garmentType = intelligence.garmentType;
  style.silhouette = intelligence.silhouette;
  style.fabric = intelligence.fabric;
  style.season = intelligence.season;
  style.vibeTags = intelligence.vibeTags;
  style.seoTags = intelligence.seoTags;
  style.faireBullets = intelligence.faireBullets;
  style.libraryTags = intelligence.libraryTags;
}

export async function generateStyleSeo(input: {
  styleNumber: string;
  color: string;
  imageUrl: string;
}): Promise<StyleIntelligence> {
  const fallback = fallbackSeo(input.styleNumber, input.color);
  const key = process.env.FAL_KEY;
  if (!key) return fallback;

  try {
    fal.config({ credentials: key });
    const result: any = await fal.subscribe("fal-ai/any-llm/vision", {
      input: {
        model: "anthropic/claude-3.7-sonnet",
        system_prompt:
          "You are a senior ecommerce fashion copywriter for Faire wholesale listings. You must analyze the garment visible in the image and write accurate, sellable product copy. Never describe the model, pose, background, photography, or team workflow. Never use generic filler.",
        image_url: input.imageUrl,
        prompt:
          `Analyze only the garment being sold in this image. Style number: ${input.styleNumber}. Color: ${input.color}. ` +
          `Return strict JSON only with keys "seoName", "seoDescription", "garmentType", "silhouette", "fabric", "season", "vibeTags", "seoTags", "faireBullets", and "libraryTags". ` +
          `seoName: Faire-ready SEO title, 55-90 characters, include color, garment type, key detail, and style number. ` +
          `seoDescription: 2-4 polished sentences ready to paste into Faire. Describe the visible garment type, silhouette, closure, fabric/texture, trim, embroidery/patches/graphics, pockets, cuffs, hem, and styling value when visible. ` +
          `garmentType, silhouette, fabric, and season: short accurate phrases for filtering. ` +
          `vibeTags: 4-8 boutique trend/search phrases such as western, coquette, oversized, denim, crochet, resort, minimalist, festival, preppy, boho, romantic, streetwear. ` +
          `seoTags: 8-12 Faire/search tags a wholesale ecommerce team can paste or use for merchandising. ` +
          `faireBullets: 3-5 short product selling bullets, each under 90 characters, based only on visible garment details. ` +
          `libraryTags: 8-16 short internal filter tags including garment category, color, fabric, silhouette, season, and vibe. ` +
          `Do not mention the model, face, body, photo, image, background, catalog, ecommerce, web team, or "photographed". ` +
          `Do not invent brand names, fiber content, exact measurements, season, or hidden back details. If uncertain, use visible-safe wording like "appears" sparingly.`,
      },
      logs: false,
    });
    const data = result?.data ?? result;
    const text = extractTextFromVisionResponse(data);
    const parsed = parseSeoJson(text, fallback);
    return parsed || fallback;
  } catch (err) {
    console.warn("[style-library] SEO generation failed:", err);
    return fallback;
  }
}

export async function upsertLibraryStyle(input: {
  styleNumber: string;
  color: string;
  viewLabel: string;
  imageUrl: string;
  prompt?: string;
}): Promise<LibraryStyle> {
  const styleNumber = normalizedStyleNumber(input.styleNumber);
  const color = normalizedColor(input.color);
  const userStyleName = `${styleNumber} ${color}`.trim();
  const viewLabel = input.viewLabel.trim() || "view";
  if (!styleNumber) throw new Error("Style number is required.");
  if (!color) throw new Error("Color is required.");
  if (!input.imageUrl?.trim()) throw new Error("Image URL is required.");

  const index = await readLibraryIndex();
  const existing = index.styles.find(
    (style) =>
      style.styleNumber === styleNumber &&
      normalizedColor(style.color || "").toLowerCase() === color.toLowerCase()
  );
  const createdAt = nowIso();

  if (existing) {
    const duplicate = existing.views.some((view) => view.imageUrl === input.imageUrl);
    if (!duplicate) {
      existing.views.push({
        id: `${slug(viewLabel) || "view"}-${Date.now()}`,
        label: viewLabel,
        imageUrl: input.imageUrl,
        prompt: input.prompt,
        createdAt,
      });
    }
    existing.userStyleName = userStyleName;
    existing.color = color;
    existing.updatedAt = nowIso();
    const seo = await generateStyleSeo({
      styleNumber,
      color,
      imageUrl: existing.views[0]?.imageUrl || input.imageUrl,
    });
    applyStyleIntelligence(existing, seo);
    await writeLibraryIndex(index);
    return existing;
  }

  const seo = await generateStyleSeo({ styleNumber, color, imageUrl: input.imageUrl });
  const style: LibraryStyle = {
    id: `${styleNumber}-${slug(color)}-${Date.now()}`,
    styleNumber,
    userStyleName,
    color,
    seoName: seo.seoName,
    seoDescription: seo.seoDescription,
    garmentType: seo.garmentType,
    silhouette: seo.silhouette,
    fabric: seo.fabric,
    season: seo.season,
    vibeTags: seo.vibeTags,
    seoTags: seo.seoTags,
    faireBullets: seo.faireBullets,
    libraryTags: seo.libraryTags,
    createdAt,
    updatedAt: createdAt,
    views: [
      {
        id: `${slug(viewLabel) || "view"}-${Date.now()}`,
        label: viewLabel,
        imageUrl: input.imageUrl,
        prompt: input.prompt,
        createdAt,
      },
    ],
  };

  index.styles.push(style);
  await writeLibraryIndex(index);
  return style;
}

export async function regenerateLibraryStyleSeo(styleId: string): Promise<LibraryStyle> {
  const index = await readLibraryIndex();
  const style = index.styles.find((item) => item.id === styleId);
  if (!style) throw new Error("Library style not found.");
  const imageUrl = style.views[0]?.imageUrl;
  if (!imageUrl) throw new Error("Library style has no image to analyze.");

  const seo = await generateStyleSeo({
    styleNumber: style.styleNumber,
    color: style.color || "",
    imageUrl,
  });
  applyStyleIntelligence(style, seo);
  style.updatedAt = nowIso();
  await writeLibraryIndex(index);
  return style;
}

export async function updateLibraryStyle(input: {
  styleId: string;
  styleNumber: string;
  color: string;
  seoName: string;
  seoDescription: string;
  garmentType?: string;
  silhouette?: string;
  fabric?: string;
  season?: string;
  vibeTags?: string[];
  seoTags?: string[];
  faireBullets?: string[];
  libraryTags?: string[];
  views: Array<{ id: string; label: string }>;
}): Promise<LibraryStyle> {
  const index = await readLibraryIndex();
  const style = index.styles.find((item) => item.id === input.styleId);
  if (!style) throw new Error("Library style not found.");

  const styleNumber = normalizedStyleNumber(input.styleNumber);
  const color = normalizedColor(input.color);
  const seoName = input.seoName.trim();
  const seoDescription = input.seoDescription.trim();

  if (!styleNumber) throw new Error("Style number is required.");
  if (!color) throw new Error("Color is required.");
  if (!seoName) throw new Error("SEO title is required.");
  if (!seoDescription) throw new Error("SEO description is required.");

  const viewLabels = new Map(
    input.views
      .filter((view) => view.id)
      .map((view) => [view.id, view.label.trim() || "view"] as const)
  );

  style.styleNumber = styleNumber;
  style.color = color;
  style.userStyleName = `${styleNumber} ${color}`.trim();
  style.seoName = seoName;
  style.seoDescription = seoDescription;
  style.garmentType = input.garmentType?.trim() || style.garmentType;
  style.silhouette = input.silhouette?.trim() || style.silhouette;
  style.fabric = input.fabric?.trim() || style.fabric;
  style.season = input.season?.trim() || style.season;
  style.vibeTags = cleanList(input.vibeTags, 8);
  style.seoTags = cleanList(input.seoTags, 12);
  style.faireBullets = cleanList(input.faireBullets, 5);
  style.libraryTags = cleanList(input.libraryTags, 16);
  style.views = style.views.map((view) => ({
    ...view,
    label: viewLabels.get(view.id) || view.label,
  }));
  style.updatedAt = nowIso();

  await writeLibraryIndex(index);
  return style;
}

export function filterLibraryStyles(
  index: LibraryIndex,
  query: string | null,
  styleNumber: string | null
): LibraryStyle[] {
  const q = query?.trim().toLowerCase() || "";
  const num = styleNumber ? normalizedStyleNumber(styleNumber) : "";
  return index.styles
    .filter((style) => {
      if (num && !style.styleNumber.includes(num)) return false;
      if (!q) return true;
      const haystack = [
        style.styleNumber,
        style.userStyleName,
        style.color,
        style.seoName,
        style.seoDescription,
        style.garmentType,
        style.silhouette,
        style.fabric,
        style.season,
        ...(style.vibeTags || []),
        ...(style.seoTags || []),
        ...(style.faireBullets || []),
        ...(style.libraryTags || []),
        ...style.views.map((view) => view.label),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    })
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}
