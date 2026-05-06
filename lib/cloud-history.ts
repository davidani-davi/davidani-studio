import fs from "node:fs/promises";
import path from "node:path";
import { list, put } from "@vercel/blob";
import type { HistoryItem } from "@/components/types";

export type CloudHistoryStudio = "image" | "model" | "model-beta";

export interface CloudHistoryRecord {
  id: string;
  studio: CloudHistoryStudio;
  userId: string;
  item: HistoryItem;
  createdAt: number;
  updatedAt: number;
  expiresAt: number | null;
  pinned: boolean;
}

interface CloudHistoryIndex {
  records: CloudHistoryRecord[];
}

const STORE_KEY = "cloud-history/index.json";
const LOCAL_STORE = process.env.VERCEL
  ? path.join("/tmp", "cloud-history.json")
  : path.join(process.cwd(), ".data", "cloud-history.json");
const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_RETENTION_DAYS = 30;
const MAX_UNPINNED_PER_STUDIO = 500;

function canUseBlob(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

function recordId(studio: CloudHistoryStudio, userId: string, itemId: string): string {
  return `${studio}:${userId}:${itemId}`;
}

function retentionExpiresAt(retentionDays = DEFAULT_RETENTION_DAYS): number {
  const days = Number.isFinite(retentionDays) && retentionDays > 0 ? retentionDays : DEFAULT_RETENTION_DAYS;
  return Date.now() + days * DAY_MS;
}

function normalizeIndex(value: unknown): CloudHistoryIndex {
  const records = (value as Partial<CloudHistoryIndex> | undefined)?.records;
  return {
    records: Array.isArray(records) ? records.filter((item) => item?.item?.id) : [],
  };
}

async function readLocalIndex(): Promise<CloudHistoryIndex> {
  try {
    const raw = await fs.readFile(LOCAL_STORE, "utf8");
    return normalizeIndex(JSON.parse(raw));
  } catch {
    return { records: [] };
  }
}

async function writeLocalIndex(index: CloudHistoryIndex): Promise<void> {
  try {
    await fs.mkdir(path.dirname(LOCAL_STORE), { recursive: true });
    await fs.writeFile(LOCAL_STORE, JSON.stringify(index, null, 2));
  } catch (err) {
    console.warn("[cloud-history] local fallback write failed:", err);
  }
}

async function readRawIndex(): Promise<CloudHistoryIndex> {
  if (!canUseBlob()) return readLocalIndex();

  try {
    const found = await list({ prefix: STORE_KEY, limit: 1 });
    const blob = found.blobs.find((item) => item.pathname === STORE_KEY) ?? found.blobs[0];
    if (!blob) return { records: [] };
    const res = await fetch(blob.url, { cache: "no-store" });
    if (!res.ok) return { records: [] };
    return normalizeIndex(await res.json());
  } catch (err) {
    console.warn("[cloud-history] blob read failed, using local fallback:", err);
    return readLocalIndex();
  }
}

async function writeRawIndex(index: CloudHistoryIndex): Promise<void> {
  const sorted = {
    records: [...index.records].sort((a, b) => b.updatedAt - a.updatedAt),
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
    console.warn("[cloud-history] blob write failed, using local fallback:", err);
    await writeLocalIndex(sorted);
  }
}

function pruneRecords(records: CloudHistoryRecord[], now = Date.now()): CloudHistoryRecord[] {
  const live = records.filter((record) => record.pinned || !record.expiresAt || record.expiresAt > now);
  const pinned = live.filter((record) => record.pinned);
  const unpinned = live
    .filter((record) => !record.pinned)
    .sort((a, b) => b.updatedAt - a.updatedAt);
  const capped: CloudHistoryRecord[] = [];
  const counts = new Map<string, number>();

  for (const record of unpinned) {
    const key = `${record.studio}:${record.userId}`;
    const count = counts.get(key) ?? 0;
    if (count >= MAX_UNPINNED_PER_STUDIO) continue;
    counts.set(key, count + 1);
    capped.push(record);
  }

  return [...pinned, ...capped].sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function readCloudHistory(params: {
  studio?: CloudHistoryStudio;
  userId?: string;
} = {}): Promise<CloudHistoryRecord[]> {
  const index = await readRawIndex();
  const pruned = pruneRecords(index.records);
  if (pruned.length !== index.records.length) {
    await writeRawIndex({ records: pruned });
  }
  return pruned.filter((record) => {
    if (params.studio && record.studio !== params.studio) return false;
    if (params.userId && record.userId !== params.userId) return false;
    return true;
  });
}

export async function upsertCloudHistory(input: {
  studio: CloudHistoryStudio;
  userId: string;
  item: HistoryItem;
  retentionDays?: number;
  pinned?: boolean;
}): Promise<CloudHistoryRecord> {
  const index = await readRawIndex();
  const id = recordId(input.studio, input.userId, input.item.id);
  const existing = index.records.find((record) => record.id === id);
  const pinned = input.pinned ?? existing?.pinned ?? false;
  const now = Date.now();
  const record: CloudHistoryRecord = {
    id,
    studio: input.studio,
    userId: input.userId,
    item: input.item,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    expiresAt: pinned ? null : retentionExpiresAt(input.retentionDays),
    pinned,
  };
  const next = pruneRecords([record, ...index.records.filter((item) => item.id !== id)]);
  await writeRawIndex({ records: next });
  return record;
}

export async function setCloudHistoryPinned(input: {
  studio: CloudHistoryStudio;
  userId: string;
  itemId: string;
  pinned: boolean;
  retentionDays?: number;
}): Promise<CloudHistoryRecord | null> {
  const index = await readRawIndex();
  const id = recordId(input.studio, input.userId, input.itemId);
  let updated: CloudHistoryRecord | null = null;
  const next = index.records.map((record) => {
    if (record.id !== id) return record;
    updated = {
      ...record,
      pinned: input.pinned,
      expiresAt: input.pinned ? null : retentionExpiresAt(input.retentionDays),
      updatedAt: Date.now(),
    };
    return updated;
  });
  if (!updated) return null;
  await writeRawIndex({ records: pruneRecords(next) });
  return updated;
}

export async function deleteCloudHistory(input: {
  studio: CloudHistoryStudio;
  userId: string;
  itemId?: string;
}): Promise<void> {
  const index = await readRawIndex();
  const next = index.records.filter((record) => {
    if (record.studio !== input.studio || record.userId !== input.userId) return true;
    if (!input.itemId) return false;
    return record.item.id !== input.itemId;
  });
  await writeRawIndex({ records: pruneRecords(next) });
}

export async function cleanupCloudHistory(): Promise<{ removed: number; remaining: number }> {
  const index = await readRawIndex();
  const next = pruneRecords(index.records);
  await writeRawIndex({ records: next });
  return {
    removed: index.records.length - next.length,
    remaining: next.length,
  };
}
