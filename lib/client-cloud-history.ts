import type { HistoryItem } from "@/components/types";
import type { CloudHistoryStudio } from "@/lib/cloud-history";

export const CLOUD_HISTORY_USER_ID = "team";
export const CLOUD_HISTORY_RETENTION_DAYS = 30;

export function mergeHistoryItems(
  primary: HistoryItem[],
  secondary: HistoryItem[],
  limit = 50
): HistoryItem[] {
  const byId = new Map<string, HistoryItem>();
  for (const item of [...primary, ...secondary]) {
    if (!item?.id || byId.has(item.id)) continue;
    byId.set(item.id, item);
  }
  return [...byId.values()]
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, limit);
}

export async function loadCloudHistory(studio: CloudHistoryStudio): Promise<HistoryItem[]> {
  const params = new URLSearchParams({
    studio,
    userId: CLOUD_HISTORY_USER_ID,
  });
  const res = await fetch(`/api/history?${params.toString()}`, { cache: "no-store" });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.ok) {
    console.warn(data?.error || `Cloud history load failed (${res.status})`);
    return [];
  }
  return Array.isArray(data.history) ? data.history : [];
}

export async function syncCloudHistory(
  studio: CloudHistoryStudio,
  history: HistoryItem[]
): Promise<void> {
  await Promise.all(
    history.slice(0, 50).map((item) =>
      fetch("/api/history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studio,
          userId: CLOUD_HISTORY_USER_ID,
          item,
          retentionDays: CLOUD_HISTORY_RETENTION_DAYS,
        }),
      }).then((res) => {
        if (!res.ok) throw new Error(`Cloud history sync failed (${res.status})`);
        return res.json().catch(() => null);
      }).then((data) => {
        if (data && data.ok === false) {
          console.warn(data.error || "Cloud history sync skipped.");
        }
      })
    )
  );
}

export async function clearCloudHistory(studio: CloudHistoryStudio): Promise<void> {
  const res = await fetch("/api/history", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      studio,
      userId: CLOUD_HISTORY_USER_ID,
    }),
  });
  if (!res.ok) throw new Error(`Cloud history clear failed (${res.status})`);
  const data = await res.json().catch(() => null);
  if (data && data.ok === false) {
    console.warn(data.error || "Cloud history clear skipped.");
  }
}
