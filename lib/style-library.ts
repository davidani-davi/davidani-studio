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
  seoName: string;
  seoDescription: string;
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

function fallbackSeo(styleNumber: string, userStyleName: string): {
  seoName: string;
  seoDescription: string;
} {
  const name = userStyleName.trim() || `Style ${styleNumber}`;
  return {
    seoName: `${name} - ${styleNumber}`,
    seoDescription: `${name} in style ${styleNumber}, photographed for fashion ecommerce with clear product views for web merchandising, catalog copy, and team reference.`,
  };
}

export async function generateStyleSeo(input: {
  styleNumber: string;
  userStyleName: string;
  imageUrl: string;
}): Promise<{ seoName: string; seoDescription: string }> {
  const fallback = fallbackSeo(input.styleNumber, input.userStyleName);
  const key = process.env.FAL_KEY;
  if (!key) return fallback;

  try {
    fal.config({ credentials: key });
    const result: any = await fal.subscribe("fal-ai/any-llm/vision", {
      input: {
        model: "openai/gpt-4o-mini",
        image_url: input.imageUrl,
        prompt:
          `You are writing ecommerce SEO copy for a fashion wholesale/product team. ` +
          `Style number: ${input.styleNumber}. User style name: ${input.userStyleName}. ` +
          `Return strict JSON only with keys seoName and seoDescription. ` +
          `seoName should be concise, search-friendly, boutique/ecommerce-ready, and include the style number naturally. ` +
          `seoDescription should be 1-2 polished sentences describing visible garment type, silhouette, fabric/texture, details, and styling value. ` +
          `Do not invent details that are not visible.`,
      },
      logs: false,
    });
    const text = String(result?.data?.output ?? result?.output ?? result?.data ?? "");
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return fallback;
    const parsed = JSON.parse(match[0]) as Partial<typeof fallback>;
    return {
      seoName: parsed.seoName?.trim() || fallback.seoName,
      seoDescription: parsed.seoDescription?.trim() || fallback.seoDescription,
    };
  } catch (err) {
    console.warn("[style-library] SEO generation failed:", err);
    return fallback;
  }
}

export async function upsertLibraryStyle(input: {
  styleNumber: string;
  userStyleName: string;
  viewLabel: string;
  imageUrl: string;
  prompt?: string;
}): Promise<LibraryStyle> {
  const styleNumber = normalizedStyleNumber(input.styleNumber);
  const userStyleName = input.userStyleName.trim();
  const viewLabel = input.viewLabel.trim() || "view";
  if (!styleNumber) throw new Error("Style number is required.");
  if (!userStyleName) throw new Error("Style name is required.");
  if (!input.imageUrl?.trim()) throw new Error("Image URL is required.");

  const index = await readLibraryIndex();
  const existing = index.styles.find((style) => style.styleNumber === styleNumber);
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
    existing.updatedAt = nowIso();
    const seo = await generateStyleSeo({
      styleNumber,
      userStyleName,
      imageUrl: existing.views[0]?.imageUrl || input.imageUrl,
    });
    existing.seoName = seo.seoName;
    existing.seoDescription = seo.seoDescription;
    await writeLibraryIndex(index);
    return existing;
  }

  const seo = await generateStyleSeo({ styleNumber, userStyleName, imageUrl: input.imageUrl });
  const style: LibraryStyle = {
    id: `${styleNumber}-${Date.now()}`,
    styleNumber,
    userStyleName,
    seoName: seo.seoName,
    seoDescription: seo.seoDescription,
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
        style.seoName,
        style.seoDescription,
        ...style.views.map((view) => view.label),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    })
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}
