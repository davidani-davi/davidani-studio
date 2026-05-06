"use client";

import type { HistoryItem } from "@/components/types";
import { logTeamActivity } from "@/components/activity-store";

export type StudioJobStatus = "queued" | "analyzing" | "generating" | "saving" | "done" | "failed";
export type StudioJobKind = "image" | "model" | "model-beta" | "prompt" | "techpack" | "library";

export interface StudioJob {
  id: string;
  kind: StudioJobKind;
  label: string;
  status: StudioJobStatus;
  startedAt: number;
  updatedAt: number;
  historyKey?: string;
  currentIdKey?: string;
  resultId?: string;
  error?: string;
}

interface StartJobOptions {
  id?: string;
  kind: StudioJobKind;
  label: string;
  historyKey?: string;
  currentIdKey?: string;
}

interface JobTaskResult {
  historyItem?: HistoryItem;
  historyKey?: string;
  currentIdKey?: string;
}

const JOBS_KEY = "davidani_global_generation_jobs_v1";
const MAX_JOBS = 30;
const CLOUD_JOBS_USER_ID = "team";
const STUDIO_LABELS: Record<StudioJobKind, string> = {
  image: "Image Studio",
  model: "Single Model Studio",
  "model-beta": "Multi Model Studio",
  prompt: "Prompt Studio",
  techpack: "Techpack Studio",
  library: "Library",
};

type Listener = () => void;
const listeners = new Set<Listener>();

function emit() {
  listeners.forEach((listener) => listener());
  window.dispatchEvent(new CustomEvent("davidani:generation-jobs-updated"));
}

function safeReadJobs(): StudioJob[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(JOBS_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function safeWriteJobs(jobs: StudioJob[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(JOBS_KEY, JSON.stringify(jobs.slice(0, MAX_JOBS)));
}

function normalizeJobs(jobs: StudioJob[]): StudioJob[] {
  const byId = new Map<string, StudioJob>();
  for (const job of jobs) {
    if (!job?.id) continue;
    const existing = byId.get(job.id);
    if (!existing || job.updatedAt >= existing.updatedAt) {
      byId.set(job.id, job);
    }
  }
  return [...byId.values()].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, MAX_JOBS);
}

function syncJobToCloud(job: StudioJob) {
  if (typeof window === "undefined") return;
  void fetch("/api/jobs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      job: {
        ...job,
        userId: CLOUD_JOBS_USER_ID,
      },
    }),
  })
    .then((res) => res.json().catch(() => null))
    .then((data) => {
      if (data && data.ok === false) console.warn(data.error || "Cloud job sync skipped.");
    })
    .catch((err) => console.warn("Cloud job sync failed:", err));
}

function deleteJobFromCloud(id?: string) {
  if (typeof window === "undefined") return;
  void fetch("/api/jobs", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      userId: CLOUD_JOBS_USER_ID,
      id,
    }),
  })
    .then((res) => res.json().catch(() => null))
    .then((data) => {
      if (data && data.ok === false) console.warn(data.error || "Cloud job delete skipped.");
    })
    .catch((err) => console.warn("Cloud job delete failed:", err));
}

export function readStudioJobs(): StudioJob[] {
  return safeReadJobs();
}

export async function hydrateStudioJobsFromCloud(): Promise<StudioJob[]> {
  if (typeof window === "undefined") return [];
  const params = new URLSearchParams({ userId: CLOUD_JOBS_USER_ID });
  const res = await fetch(`/api/jobs?${params.toString()}`, { cache: "no-store" });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.ok) {
    console.warn(data?.error || `Cloud jobs load failed (${res.status})`);
    return safeReadJobs();
  }
  const cloudJobs = Array.isArray(data.jobs) ? (data.jobs as StudioJob[]) : [];
  const next = normalizeJobs([...cloudJobs, ...safeReadJobs()]);
  safeWriteJobs(next);
  emit();
  return next;
}

export function subscribeStudioJobs(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function activeStudioJobCount(): number {
  return safeReadJobs().filter((job) =>
    ["queued", "analyzing", "generating", "saving"].includes(job.status)
  ).length;
}

export function upsertStudioJob(job: StudioJob) {
  const jobs = safeReadJobs().filter((item) => item.id !== job.id);
  safeWriteJobs(normalizeJobs([job, ...jobs]));
  syncJobToCloud(job);
  emit();
}

export function updateStudioJob(id: string, patch: Partial<StudioJob>) {
  const jobs = safeReadJobs();
  let updated: StudioJob | null = null;
  const next = jobs.map((job) =>
    job.id === id ? (updated = { ...job, ...patch, updatedAt: Date.now() }) : job
  );
  safeWriteJobs(normalizeJobs(next));
  if (updated) syncJobToCloud(updated);
  emit();
}

export function removeStudioJob(id: string) {
  safeWriteJobs(safeReadJobs().filter((job) => job.id !== id));
  deleteJobFromCloud(id);
  emit();
}

export function clearInactiveStudioJobs() {
  safeWriteJobs(
    safeReadJobs().filter((job) =>
      ["queued", "analyzing", "generating", "saving"].includes(job.status)
    )
  );
  deleteJobFromCloud();
  emit();
}

function persistHistoryItem(historyKey: string, item: HistoryItem): HistoryItem[] {
  const existing = (() => {
    try {
      return JSON.parse(localStorage.getItem(historyKey) || "[]") as HistoryItem[];
    } catch {
      return [];
    }
  })().filter((run) => run.id !== item.id);
  const next = [item, ...existing].slice(0, 50);
  localStorage.setItem(historyKey, JSON.stringify(next));
  window.dispatchEvent(
    new CustomEvent("davidani:history-updated", {
      detail: { historyKey, currentId: item.id },
    })
  );
  return next;
}

export function startStudioJob(
  options: StartJobOptions,
  task: (helpers: {
    id: string;
    setStatus: (status: StudioJobStatus, patch?: Partial<StudioJob>) => void;
  }) => Promise<JobTaskResult | void>
): string {
  const id = options.id || (crypto.randomUUID?.() || String(Date.now())).replace(/-/g, "");
  const now = Date.now();
  upsertStudioJob({
    id,
    kind: options.kind,
    label: options.label,
    status: "queued",
    startedAt: now,
    updatedAt: now,
    historyKey: options.historyKey,
    currentIdKey: options.currentIdKey,
  });

  void (async () => {
    const setStatus = (status: StudioJobStatus, patch: Partial<StudioJob> = {}) =>
      updateStudioJob(id, { status, ...patch });
    try {
      const result = await task({ id, setStatus });
      const historyItem = result?.historyItem;
      const historyKey = result?.historyKey || options.historyKey;
      const currentIdKey = result?.currentIdKey || options.currentIdKey;

      if (historyItem && historyKey) {
        setStatus("saving");
        persistHistoryItem(historyKey, historyItem);
        if (currentIdKey) localStorage.setItem(currentIdKey, historyItem.id);
        setStatus("done", { resultId: historyItem.id, error: undefined });
        logTeamActivity({
          studio: options.kind,
          action: `generated ${options.label}`,
          target: STUDIO_LABELS[options.kind],
          metadata: { resultId: historyItem.id },
        });
      } else {
        setStatus("done");
        logTeamActivity({
          studio: options.kind,
          action: `completed ${options.label}`,
          target: STUDIO_LABELS[options.kind],
        });
      }
    } catch (err: any) {
      setStatus("failed", { error: err?.message || "Generation failed" });
      logTeamActivity({
        studio: options.kind,
        action: `hit an error in ${options.label}`,
        target: STUDIO_LABELS[options.kind],
        metadata: { error: err?.message || "Generation failed" },
      });
    }
  })();

  return id;
}
