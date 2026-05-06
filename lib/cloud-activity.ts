import fs from "node:fs/promises";
import path from "node:path";
import { list, put } from "@vercel/blob";

export type ActivityStudio = "image" | "model" | "model-beta" | "prompt" | "techpack" | "library" | "system";

export interface ActivityEvent {
  id: string;
  userId: string;
  actor: string;
  studio: ActivityStudio;
  action: string;
  target?: string;
  createdAt: number;
  metadata?: Record<string, string | number | boolean | null>;
}

interface ActivityIndex {
  events: ActivityEvent[];
}

const STORE_KEY = "activity-feed/index.json";
const LOCAL_STORE = process.env.VERCEL
  ? path.join("/tmp", "activity-feed.json")
  : path.join(process.cwd(), ".data", "activity-feed.json");
const DAY_MS = 24 * 60 * 60 * 1000;
const RETENTION_DAYS = 14;
const MAX_EVENTS = 2000;

function canUseBlob(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

function normalizeIndex(value: unknown): ActivityIndex {
  const events = (value as Partial<ActivityIndex> | undefined)?.events;
  return {
    events: Array.isArray(events)
      ? events.filter((event): event is ActivityEvent =>
          Boolean(event?.id && event.userId && event.actor && event.studio && event.action)
        )
      : [],
  };
}

async function readLocalIndex(): Promise<ActivityIndex> {
  try {
    const raw = await fs.readFile(LOCAL_STORE, "utf8");
    return normalizeIndex(JSON.parse(raw));
  } catch {
    return { events: [] };
  }
}

async function writeLocalIndex(index: ActivityIndex): Promise<void> {
  try {
    await fs.mkdir(path.dirname(LOCAL_STORE), { recursive: true });
    await fs.writeFile(LOCAL_STORE, JSON.stringify(index, null, 2));
  } catch (err) {
    console.warn("[activity-feed] local fallback write failed:", err);
  }
}

async function readRawIndex(): Promise<ActivityIndex> {
  if (!canUseBlob()) return readLocalIndex();

  try {
    const found = await list({ prefix: STORE_KEY, limit: 1 });
    const blob = found.blobs.find((item) => item.pathname === STORE_KEY) ?? found.blobs[0];
    if (!blob) return { events: [] };
    const res = await fetch(blob.url, { cache: "no-store" });
    if (!res.ok) return { events: [] };
    return normalizeIndex(await res.json());
  } catch (err) {
    console.warn("[activity-feed] blob read failed, using local fallback:", err);
    return readLocalIndex();
  }
}

async function writeRawIndex(index: ActivityIndex): Promise<void> {
  const sorted = {
    events: [...index.events].sort((a, b) => b.createdAt - a.createdAt),
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
    console.warn("[activity-feed] blob write failed, using local fallback:", err);
    await writeLocalIndex(sorted);
  }
}

function pruneEvents(events: ActivityEvent[], now = Date.now()): ActivityEvent[] {
  const cutoff = now - RETENTION_DAYS * DAY_MS;
  return events
    .filter((event) => event.createdAt > cutoff)
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, MAX_EVENTS);
}

export async function readActivityFeed(params: { userId?: string } = {}): Promise<ActivityEvent[]> {
  const index = await readRawIndex();
  const pruned = pruneEvents(index.events);
  if (pruned.length !== index.events.length) {
    await writeRawIndex({ events: pruned });
  }
  return pruned.filter((event) => !params.userId || event.userId === params.userId);
}

export async function appendActivityEvent(
  input: Omit<ActivityEvent, "id" | "createdAt"> & Partial<Pick<ActivityEvent, "id" | "createdAt">>
): Promise<ActivityEvent> {
  const index = await readRawIndex();
  const event: ActivityEvent = {
    ...input,
    id: input.id || crypto.randomUUID?.() || String(Date.now()),
    createdAt: input.createdAt || Date.now(),
    actor: input.actor.trim() || "Team",
    userId: input.userId.trim() || "team",
  };
  const next = pruneEvents([event, ...index.events.filter((item) => item.id !== event.id)]);
  await writeRawIndex({ events: next });
  return event;
}

export async function deleteActivityFeed(input: { userId: string }): Promise<void> {
  const index = await readRawIndex();
  await writeRawIndex({
    events: pruneEvents(index.events.filter((event) => event.userId !== input.userId)),
  });
}

export async function cleanupActivityFeed(): Promise<{ removed: number; remaining: number }> {
  const index = await readRawIndex();
  const next = pruneEvents(index.events);
  await writeRawIndex({ events: next });
  return {
    removed: index.events.length - next.length,
    remaining: next.length,
  };
}
