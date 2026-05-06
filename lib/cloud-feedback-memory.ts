import fs from "node:fs/promises";
import path from "node:path";
import { list, put } from "@vercel/blob";
import type { FeedbackMemoryItem, FeedbackStudio } from "@/lib/feedback-memory";

interface CloudFeedbackIndex {
  items: FeedbackMemoryItem[];
}

const STORE_KEY = "feedback-memory/index.json";
const LOCAL_STORE = process.env.VERCEL
  ? path.join("/tmp", "feedback-memory.json")
  : path.join(process.cwd(), ".data", "feedback-memory.json");
const DAY_MS = 24 * 60 * 60 * 1000;
const RETENTION_DAYS = 90;
const MAX_ITEMS = 300;

function canUseBlob(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

function normalizeIndex(value: unknown): CloudFeedbackIndex {
  const items = (value as Partial<CloudFeedbackIndex> | undefined)?.items;
  return {
    items: Array.isArray(items)
      ? items.filter((item) => item?.id && Array.isArray(item.issueKeys))
      : [],
  };
}

function pruneItems(items: FeedbackMemoryItem[], now = Date.now()): FeedbackMemoryItem[] {
  const cutoff = now - RETENTION_DAYS * DAY_MS;
  const seen = new Set<string>();
  return items
    .filter((item) => item.createdAt > cutoff)
    .sort((a, b) => b.createdAt - a.createdAt)
    .filter((item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    })
    .slice(0, MAX_ITEMS);
}

async function readLocalIndex(): Promise<CloudFeedbackIndex> {
  try {
    const raw = await fs.readFile(LOCAL_STORE, "utf8");
    return normalizeIndex(JSON.parse(raw));
  } catch {
    return { items: [] };
  }
}

async function writeLocalIndex(index: CloudFeedbackIndex): Promise<void> {
  try {
    await fs.mkdir(path.dirname(LOCAL_STORE), { recursive: true });
    await fs.writeFile(LOCAL_STORE, JSON.stringify(index, null, 2));
  } catch (err) {
    console.warn("[feedback-memory] local write failed:", err);
  }
}

async function readRawIndex(): Promise<CloudFeedbackIndex> {
  if (!canUseBlob()) return readLocalIndex();

  try {
    const found = await list({ prefix: STORE_KEY, limit: 1 });
    const blob = found.blobs.find((item) => item.pathname === STORE_KEY) ?? found.blobs[0];
    if (!blob) return { items: [] };
    const res = await fetch(blob.url, { cache: "no-store" });
    if (!res.ok) return { items: [] };
    return normalizeIndex(await res.json());
  } catch (err) {
    console.warn("[feedback-memory] blob read failed, using local fallback:", err);
    return readLocalIndex();
  }
}

async function writeRawIndex(index: CloudFeedbackIndex): Promise<void> {
  const next = { items: pruneItems(index.items) };
  if (!canUseBlob()) {
    await writeLocalIndex(next);
    return;
  }

  try {
    await put(STORE_KEY, JSON.stringify(next, null, 2), {
      access: "public",
      contentType: "application/json",
      allowOverwrite: true,
    });
  } catch (err) {
    console.warn("[feedback-memory] blob write failed, using local fallback:", err);
    await writeLocalIndex(next);
  }
}

export async function readCloudFeedbackMemory(studio?: FeedbackStudio) {
  const index = await readRawIndex();
  const pruned = pruneItems(index.items);
  if (pruned.length !== index.items.length) await writeRawIndex({ items: pruned });
  return pruned.filter((item) => !studio || !item.studio || item.studio === studio);
}

export async function addCloudFeedbackMemory(item: FeedbackMemoryItem) {
  const index = await readRawIndex();
  await writeRawIndex({ items: [item, ...index.items] });
  return item;
}
