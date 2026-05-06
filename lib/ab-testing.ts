import fs from "node:fs/promises";
import path from "node:path";
import { list, put } from "@vercel/blob";

export type AbSelection = "left" | "right" | "no_preference";

export interface AbPreferenceEvent {
  user_id: string;
  generation_id: string;
  timestamp: string;
  selected_image: AbSelection;
  prompt_used: string;
  version: "2.2";
}

export interface AbPreferenceIndex {
  events: AbPreferenceEvent[];
}

export interface AbReportSummary {
  period: "daily" | "weekly";
  generatedAt: string;
  windowStart: string;
  windowEnd: string;
  totalGenerations: number;
  leftPreferenceCount: number;
  rightPreferenceCount: number;
  noPreferenceCount: number;
  oldModelPreferencePercent: number;
  newModelPreferencePercent: number;
  noPreferencePercent: number;
  notableTrends: string[];
}

const STORE_KEY = "ab-testing/v2.2-events.json";
const LOCAL_STORE = path.join(process.cwd(), ".data", "ab-testing-v2.2.json");

function canUseBlob(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

async function readLocalIndex(): Promise<AbPreferenceIndex> {
  try {
    const raw = await fs.readFile(LOCAL_STORE, "utf8");
    const parsed = JSON.parse(raw) as AbPreferenceIndex;
    return { events: Array.isArray(parsed.events) ? parsed.events : [] };
  } catch {
    return { events: [] };
  }
}

async function writeLocalIndex(index: AbPreferenceIndex): Promise<void> {
  await fs.mkdir(path.dirname(LOCAL_STORE), { recursive: true });
  await fs.writeFile(LOCAL_STORE, JSON.stringify(index, null, 2));
}

export async function readAbPreferenceIndex(): Promise<AbPreferenceIndex> {
  if (!canUseBlob()) return readLocalIndex();

  try {
    const found = await list({ prefix: STORE_KEY, limit: 1 });
    const blob = found.blobs.find((item) => item.pathname === STORE_KEY) ?? found.blobs[0];
    if (!blob) return { events: [] };
    const res = await fetch(blob.url, { cache: "no-store" });
    if (!res.ok) return { events: [] };
    const parsed = (await res.json()) as AbPreferenceIndex;
    return { events: Array.isArray(parsed.events) ? parsed.events : [] };
  } catch (err) {
    console.warn("[ab-testing] blob read failed, using local fallback:", err);
    return readLocalIndex();
  }
}

export async function writeAbPreferenceIndex(index: AbPreferenceIndex): Promise<void> {
  const sorted = {
    events: [...index.events].sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
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
    console.warn("[ab-testing] blob write failed, using local fallback:", err);
    await writeLocalIndex(sorted);
  }
}

export async function upsertAbPreferenceEvent(
  event: AbPreferenceEvent
): Promise<AbPreferenceEvent> {
  const index = await readAbPreferenceIndex();
  const nextEvents = [
    event,
    ...index.events.filter((item) => item.generation_id !== event.generation_id),
  ].slice(0, 5000);
  await writeAbPreferenceIndex({ events: nextEvents });
  return event;
}

export function summarizeAbPreferences(
  events: AbPreferenceEvent[],
  period: "daily" | "weekly",
  now = new Date()
): AbReportSummary {
  const windowMs = period === "weekly" ? 7 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
  const windowStartDate = new Date(now.getTime() - windowMs);
  const scoped = events.filter((event) => {
    const timestamp = new Date(event.timestamp).getTime();
    return event.version === "2.2" && timestamp >= windowStartDate.getTime() && timestamp <= now.getTime();
  });

  const leftPreferenceCount = scoped.filter((event) => event.selected_image === "left").length;
  const rightPreferenceCount = scoped.filter((event) => event.selected_image === "right").length;
  const noPreferenceCount = scoped.filter((event) => event.selected_image === "no_preference").length;
  const totalGenerations = scoped.length;
  const percent = (count: number) =>
    totalGenerations ? Math.round((count / totalGenerations) * 1000) / 10 : 0;

  const notableTrends: string[] = [];
  const newPercent = percent(rightPreferenceCount);
  const oldPercent = percent(leftPreferenceCount);
  if (totalGenerations === 0) {
    notableTrends.push("No V2.2 A/B preferences were collected during this window.");
  } else if (newPercent >= oldPercent + 15) {
    notableTrends.push("New prompt model is materially outperforming the current prompt model.");
  } else if (oldPercent >= newPercent + 15) {
    notableTrends.push("Current prompt model is materially outperforming the new prompt model.");
  } else {
    notableTrends.push("Preference split is close; continue collecting more comparisons.");
  }
  if (percent(noPreferenceCount) >= 25) {
    notableTrends.push("High no-preference rate suggests the visual difference may be too subtle or inconsistent.");
  }

  return {
    period,
    generatedAt: now.toISOString(),
    windowStart: windowStartDate.toISOString(),
    windowEnd: now.toISOString(),
    totalGenerations,
    leftPreferenceCount,
    rightPreferenceCount,
    noPreferenceCount,
    oldModelPreferencePercent: oldPercent,
    newModelPreferencePercent: newPercent,
    noPreferencePercent: percent(noPreferenceCount),
    notableTrends,
  };
}

export function formatAbReportEmail(summary: AbReportSummary): { subject: string; text: string } {
  const label = summary.period === "weekly" ? "Weekly" : "Daily";
  const subject = `Davi Studio V2.2 A/B ${label} Report`;
  const text = [
    subject,
    "",
    `Window: ${summary.windowStart} to ${summary.windowEnd}`,
    `Total generations with preference: ${summary.totalGenerations}`,
    `Old/current prompt preferred: ${summary.leftPreferenceCount} (${summary.oldModelPreferencePercent}%)`,
    `New prompt preferred: ${summary.rightPreferenceCount} (${summary.newModelPreferencePercent}%)`,
    `No preference: ${summary.noPreferenceCount} (${summary.noPreferencePercent}%)`,
    "",
    "Notable trends:",
    ...summary.notableTrends.map((trend) => `- ${trend}`),
  ].join("\n");
  return { subject, text };
}
