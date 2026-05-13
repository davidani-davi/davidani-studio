const STORAGE_KEY = "davidani_faire_seo_timings_v1";
const MAX_SAMPLES = 30;
const DEFAULT_MS = 30_000;

interface TimingSample {
  durationMs: number;
  at: number;
}

function safeRead(): TimingSample[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((s) => Number.isFinite(s?.durationMs)) : [];
  } catch {
    return [];
  }
}

function safeWrite(samples: TimingSample[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(samples.slice(-MAX_SAMPLES)));
  } catch {
    /* best effort */
  }
}

export function recordRunTiming(durationMs: number) {
  if (!Number.isFinite(durationMs) || durationMs < 1000 || durationMs > 600_000) return;
  const samples = safeRead();
  samples.push({ durationMs, at: Date.now() });
  safeWrite(samples);
}

export function estimateRunMs(): number {
  const samples = safeRead();
  if (!samples.length) return DEFAULT_MS;
  const recent = samples.slice(-15).map((s) => s.durationMs).sort((a, b) => a - b);
  const mid = Math.floor(recent.length / 2);
  return recent.length % 2 ? recent[mid] : Math.round((recent[mid - 1] + recent[mid]) / 2);
}

export function getSampleCount(): number {
  return safeRead().length;
}

export function formatRemaining(ms: number): string {
  const clamped = Math.max(0, ms);
  if (clamped < 1000) return "almost done";
  const seconds = Math.round(clamped / 1000);
  if (seconds < 60) return `~${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rem = seconds % 60;
  return rem ? `~${minutes}m ${rem}s` : `~${minutes}m`;
}

export function estimateBatchMs(
  pending: number,
  active: number,
  concurrency: number,
  inflightElapsedMs: number[]
): number {
  if (pending <= 0 && active <= 0) return 0;
  const per = estimateRunMs();
  const remainingForActive = inflightElapsedMs
    .map((elapsed) => Math.max(per - elapsed, per * 0.15))
    .sort((a, b) => a - b);
  const queueRemainingMs = pending * per;
  const lanes = Math.max(1, Math.min(concurrency, active + pending));
  return Math.round(
    (queueRemainingMs + remainingForActive.reduce((sum, ms) => sum + ms, 0)) / lanes
  );
}
