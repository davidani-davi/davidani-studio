import fs from "node:fs/promises";
import path from "node:path";
import { list, put } from "@vercel/blob";

export interface InspirationSource {
  id: string;
  title: string;
  url: string;
  imageUrl?: string;
  category: string;
  tags?: string[];
  note: string;
  createdAt: string;
  updatedAt: string;
}

export interface InspirationIndex {
  sources: InspirationSource[];
}

const STORE_KEY = "design-inspiration/index.json";
const LOCAL_STORE = path.join(process.cwd(), ".data", "design-inspiration.json");

function nowIso(): string {
  return new Date().toISOString();
}

function canUseBlob(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

function normalizeUrl(value: string): string {
  const url = value.trim();
  if (!url) throw new Error("URL is required.");
  const parsed = new URL(url);
  return parsed.toString();
}

function cleanText(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

async function readLocalIndex(): Promise<InspirationIndex> {
  try {
    const raw = await fs.readFile(LOCAL_STORE, "utf8");
    const parsed = JSON.parse(raw) as InspirationIndex;
    return { sources: Array.isArray(parsed.sources) ? parsed.sources : [] };
  } catch {
    return { sources: [] };
  }
}

async function writeLocalIndex(index: InspirationIndex): Promise<void> {
  await fs.mkdir(path.dirname(LOCAL_STORE), { recursive: true });
  await fs.writeFile(LOCAL_STORE, JSON.stringify(index, null, 2));
}

export async function readInspirationIndex(): Promise<InspirationIndex> {
  if (!canUseBlob()) return readLocalIndex();

  try {
    const found = await list({ prefix: STORE_KEY, limit: 1 });
    const blob = found.blobs.find((item) => item.pathname === STORE_KEY) ?? found.blobs[0];
    if (!blob) return { sources: [] };
    const res = await fetch(blob.url, { cache: "no-store" });
    if (!res.ok) return { sources: [] };
    const parsed = (await res.json()) as InspirationIndex;
    return { sources: Array.isArray(parsed.sources) ? parsed.sources : [] };
  } catch (err) {
    console.warn("[inspiration-library] blob read failed, using local fallback:", err);
    return readLocalIndex();
  }
}

export async function writeInspirationIndex(index: InspirationIndex): Promise<void> {
  const sorted = {
    sources: [...index.sources].sort(
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
    console.warn("[inspiration-library] blob write failed, using local fallback:", err);
    await writeLocalIndex(sorted);
  }
}

export async function addInspirationSource(input: {
  title: string;
  url: string;
  imageUrl?: string;
  category: string;
  tags?: string[];
  note: string;
}): Promise<InspirationSource> {
  const url = normalizeUrl(input.url);
  const imageUrl = input.imageUrl ? normalizeUrl(input.imageUrl) : undefined;
  const title = cleanText(input.title) || new URL(url).hostname.replace(/^www\./, "");
  const category = cleanText(input.category) || "General";
  const tags = Array.isArray(input.tags)
    ? input.tags.map((tag) => cleanText(String(tag || ""))).filter(Boolean).slice(0, 16)
    : [];
  const note = cleanText(input.note);
  const index = await readInspirationIndex();
  const existing = index.sources.find((source) => source.url === url);
  const timestamp = nowIso();

  if (existing) {
    existing.title = title;
    existing.imageUrl = imageUrl;
    existing.category = category;
    existing.tags = tags;
    existing.note = note;
    existing.updatedAt = timestamp;
    await writeInspirationIndex(index);
    return existing;
  }

  const source: InspirationSource = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title,
    url,
    imageUrl,
    category,
    tags,
    note,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  index.sources.push(source);
  await writeInspirationIndex(index);
  return source;
}

export async function deleteInspirationSource(id: string): Promise<void> {
  const index = await readInspirationIndex();
  index.sources = index.sources.filter((source) => source.id !== id);
  await writeInspirationIndex(index);
}

export function filterInspirationSources(
  sources: InspirationSource[],
  categoryHint: string
): InspirationSource[] {
  const hint = categoryHint.toLowerCase();
  const categoryWords = hint.split(/[^a-z0-9]+/).filter((word) => word.length > 2);
  const scored = sources.map((source) => {
    const haystack = `${source.category} ${source.title} ${source.note} ${
      source.tags?.join(" ") || ""
    } ${source.url}`.toLowerCase();
    const score = categoryWords.filter((word) => haystack.includes(word)).length;
    const general = /general|all|trend|bestseller|brand/i.test(source.category);
    return { source, score: score + (general ? 0.25 : 0) };
  });
  return scored
    .sort((a, b) => b.score - a.score || b.source.updatedAt.localeCompare(a.source.updatedAt))
    .slice(0, 12)
    .map((item) => item.source);
}
