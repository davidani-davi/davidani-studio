import fs from "node:fs/promises";
import path from "node:path";
import { list, put } from "@vercel/blob";

export type CloudStudioJobStatus = "queued" | "analyzing" | "generating" | "saving" | "done" | "failed";
export type CloudStudioJobKind = "image" | "model" | "model-beta" | "prompt" | "techpack" | "library";

export interface CloudStudioJob {
  id: string;
  kind: CloudStudioJobKind;
  label: string;
  status: CloudStudioJobStatus;
  startedAt: number;
  updatedAt: number;
  userId: string;
  historyKey?: string;
  currentIdKey?: string;
  resultId?: string;
  error?: string;
}

interface CloudJobsIndex {
  jobs: CloudStudioJob[];
}

const STORE_KEY = "cloud-jobs/index.json";
const LOCAL_STORE = process.env.VERCEL
  ? path.join("/tmp", "cloud-jobs.json")
  : path.join(process.cwd(), ".data", "cloud-jobs.json");
const DAY_MS = 24 * 60 * 60 * 1000;
const ACTIVE_RETENTION_DAYS = 3;
const INACTIVE_RETENTION_DAYS = 14;
const MAX_JOBS_PER_USER = 300;

const ACTIVE_STATUSES = new Set<CloudStudioJobStatus>([
  "queued",
  "analyzing",
  "generating",
  "saving",
]);

function canUseBlob(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

function normalizeIndex(value: unknown): CloudJobsIndex {
  const jobs = (value as Partial<CloudJobsIndex> | undefined)?.jobs;
  return {
    jobs: Array.isArray(jobs)
      ? jobs.filter((job): job is CloudStudioJob =>
          Boolean(job?.id && job.kind && job.status && job.startedAt && job.updatedAt)
        )
      : [],
  };
}

async function readLocalIndex(): Promise<CloudJobsIndex> {
  try {
    const raw = await fs.readFile(LOCAL_STORE, "utf8");
    return normalizeIndex(JSON.parse(raw));
  } catch {
    return { jobs: [] };
  }
}

async function writeLocalIndex(index: CloudJobsIndex): Promise<void> {
  try {
    await fs.mkdir(path.dirname(LOCAL_STORE), { recursive: true });
    await fs.writeFile(LOCAL_STORE, JSON.stringify(index, null, 2));
  } catch (err) {
    console.warn("[cloud-jobs] local fallback write failed:", err);
  }
}

async function readRawIndex(): Promise<CloudJobsIndex> {
  if (!canUseBlob()) return readLocalIndex();

  try {
    const found = await list({ prefix: STORE_KEY, limit: 1 });
    const blob = found.blobs.find((item) => item.pathname === STORE_KEY) ?? found.blobs[0];
    if (!blob) return { jobs: [] };
    const res = await fetch(blob.url, { cache: "no-store" });
    if (!res.ok) return { jobs: [] };
    return normalizeIndex(await res.json());
  } catch (err) {
    console.warn("[cloud-jobs] blob read failed, using local fallback:", err);
    return readLocalIndex();
  }
}

async function writeRawIndex(index: CloudJobsIndex): Promise<void> {
  const sorted = {
    jobs: [...index.jobs].sort((a, b) => b.updatedAt - a.updatedAt),
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
    console.warn("[cloud-jobs] blob write failed, using local fallback:", err);
    await writeLocalIndex(sorted);
  }
}

function pruneJobs(jobs: CloudStudioJob[], now = Date.now()): CloudStudioJob[] {
  const activeCutoff = now - ACTIVE_RETENTION_DAYS * DAY_MS;
  const inactiveCutoff = now - INACTIVE_RETENTION_DAYS * DAY_MS;
  const live = jobs.filter((job) => {
    const active = ACTIVE_STATUSES.has(job.status);
    return job.updatedAt > (active ? activeCutoff : inactiveCutoff);
  });
  const counts = new Map<string, number>();
  const capped: CloudStudioJob[] = [];

  for (const job of live.sort((a, b) => b.updatedAt - a.updatedAt)) {
    const key = job.userId || "team";
    const count = counts.get(key) ?? 0;
    if (count >= MAX_JOBS_PER_USER) continue;
    counts.set(key, count + 1);
    capped.push(job);
  }

  return capped;
}

export async function readCloudJobs(params: { userId?: string } = {}): Promise<CloudStudioJob[]> {
  const index = await readRawIndex();
  const pruned = pruneJobs(index.jobs);
  if (pruned.length !== index.jobs.length) {
    await writeRawIndex({ jobs: pruned });
  }
  return pruned.filter((job) => !params.userId || job.userId === params.userId);
}

export async function upsertCloudJob(input: CloudStudioJob): Promise<CloudStudioJob> {
  const index = await readRawIndex();
  const now = Date.now();
  const existing = index.jobs.find((job) => job.id === input.id);
  const job: CloudStudioJob = {
    ...existing,
    ...input,
    userId: input.userId || existing?.userId || "team",
    startedAt: input.startedAt || existing?.startedAt || now,
    updatedAt: input.updatedAt || now,
  };
  const next = pruneJobs([job, ...index.jobs.filter((item) => item.id !== job.id)]);
  await writeRawIndex({ jobs: next });
  return job;
}

export async function deleteCloudJob(input: { userId: string; id?: string }): Promise<void> {
  const index = await readRawIndex();
  const next = index.jobs.filter((job) => {
    if (job.userId !== input.userId) return true;
    if (!input.id) return ACTIVE_STATUSES.has(job.status);
    return job.id !== input.id;
  });
  await writeRawIndex({ jobs: pruneJobs(next) });
}

export async function cleanupCloudJobs(): Promise<{ removed: number; remaining: number }> {
  const index = await readRawIndex();
  const next = pruneJobs(index.jobs);
  await writeRawIndex({ jobs: next });
  return {
    removed: index.jobs.length - next.length,
    remaining: next.length,
  };
}
