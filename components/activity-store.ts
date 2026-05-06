"use client";

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

const ACTIVITY_KEY = "davidani_team_activity_v1";
const ACTOR_KEY = "davidani_team_actor_v1";
const TEAM_USER_ID = "team";
const MAX_LOCAL_EVENTS = 200;

type Listener = () => void;
const listeners = new Set<Listener>();

function emit() {
  listeners.forEach((listener) => listener());
  window.dispatchEvent(new CustomEvent("davidani:activity-updated"));
}

function normalizeEvents(events: ActivityEvent[]): ActivityEvent[] {
  const byId = new Map<string, ActivityEvent>();
  for (const event of events) {
    if (!event?.id) continue;
    byId.set(event.id, event);
  }
  return [...byId.values()].sort((a, b) => b.createdAt - a.createdAt).slice(0, MAX_LOCAL_EVENTS);
}

function safeReadActivity(): ActivityEvent[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(ACTIVITY_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function safeWriteActivity(events: ActivityEvent[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(ACTIVITY_KEY, JSON.stringify(normalizeEvents(events)));
}

export function readActivityFeed(): ActivityEvent[] {
  return safeReadActivity();
}

export function subscribeActivityFeed(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getActivityActor(): string {
  if (typeof window === "undefined") return "Team";
  return localStorage.getItem(ACTOR_KEY) || "Team";
}

export function setActivityActor(actor: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem(ACTOR_KEY, actor.trim() || "Team");
  emit();
}

export async function hydrateActivityFeedFromCloud(): Promise<ActivityEvent[]> {
  if (typeof window === "undefined") return [];
  const params = new URLSearchParams({ userId: TEAM_USER_ID });
  const res = await fetch(`/api/activity?${params.toString()}`, { cache: "no-store" });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.ok) {
    console.warn(data?.error || `Activity feed load failed (${res.status})`);
    return safeReadActivity();
  }
  const cloudEvents = Array.isArray(data.events) ? (data.events as ActivityEvent[]) : [];
  const next = normalizeEvents([...cloudEvents, ...safeReadActivity()]);
  safeWriteActivity(next);
  emit();
  return next;
}

export function logTeamActivity(input: {
  studio: ActivityStudio;
  action: string;
  target?: string;
  metadata?: ActivityEvent["metadata"];
}) {
  if (typeof window === "undefined") return;
  const event: ActivityEvent = {
    id: crypto.randomUUID?.() || String(Date.now()),
    userId: TEAM_USER_ID,
    actor: getActivityActor(),
    studio: input.studio,
    action: input.action,
    target: input.target,
    createdAt: Date.now(),
    metadata: input.metadata,
  };
  safeWriteActivity([event, ...safeReadActivity()]);
  emit();
  void fetch("/api/activity", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(event),
  })
    .then((res) => res.json().catch(() => null))
    .then((data) => {
      if (data && data.ok === false) console.warn(data.error || "Activity feed sync skipped.");
    })
    .catch((err) => console.warn("Activity feed sync failed:", err));
}

export function clearActivityFeed() {
  if (typeof window === "undefined") return;
  safeWriteActivity([]);
  emit();
  void fetch("/api/activity", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId: TEAM_USER_ID }),
  }).catch((err) => console.warn("Activity feed clear failed:", err));
}
