"use client";

// Shared progress primitives for long-running studio work.
//
// Two modes:
// - Determinate: pass `fraction` (0..1) when a true signal exists — e.g.
//   XHR upload bytes. The bar tracks it directly.
// - Estimated: pass `startedAt` + `estimateMs` when the backend exposes no
//   progress (model generations). The bar eases toward an asymptote
//   (~82% at the estimate, ~97% at 2x) — honest about uncertainty, never
//   claims 100% before the result lands.

import { useEffect, useState } from "react";

export function formatClock(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

// fetch() cannot observe request-body progress; XMLHttpRequest can. Reports
// true bytes-sent progress via onProgress, resolves with the parsed JSON
// body using the same error contract as fetchJson.
export function uploadWithProgress(
  label: string,
  url: string,
  form: FormData,
  onProgress?: (fraction: number) => void
): Promise<any> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && e.total > 0) onProgress?.(e.loaded / e.total);
    };
    xhr.onload = () => {
      let data: any = null;
      try {
        data = xhr.responseText ? JSON.parse(xhr.responseText) : null;
      } catch {
        reject(new Error(`${label}: server returned non-JSON (${xhr.status})`));
        return;
      }
      if (xhr.status < 200 || xhr.status >= 300) {
        reject(new Error(`${label}: ${data?.error || `HTTP ${xhr.status}`}`));
        return;
      }
      resolve(data);
    };
    xhr.onerror = () => reject(new Error(`${label}: network error`));
    xhr.send(form);
  });
}

export function ProgressBar({
  label,
  fraction,
  startedAt,
  estimateMs,
  compact,
  className,
}: {
  label?: string;
  /** Determinate mode: true progress 0..1 (e.g. upload bytes). */
  fraction?: number;
  /** Estimated mode: run start (ms epoch); requires estimateMs. */
  startedAt?: number;
  estimateMs?: number;
  compact?: boolean;
  className?: string;
}) {
  const estimated = fraction === undefined;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!estimated) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [estimated]);

  const elapsed = Math.max(0, now - (startedAt ?? now));
  const pct = estimated
    ? Math.min(0.98, 1 - Math.pow(2, (-elapsed / Math.max(1000, estimateMs ?? 60_000)) * 2.5)) * 100
    : Math.min(1, Math.max(0, fraction)) * 100;

  const track = (
    <div className={`relative w-full overflow-hidden rounded-full bg-neutral-200 ${compact ? "h-0.5" : "h-1"}`}>
      <div
        className="relative h-full overflow-hidden rounded-full bg-neutral-900 transition-[width] duration-500 ease-out motion-reduce:transition-none"
        style={{ width: `${pct}%` }}
      >
        <div className="absolute inset-0 -translate-x-full animate-[shimmer_2.4s_ease-out_infinite] bg-gradient-to-r from-transparent via-white/25 to-transparent motion-reduce:hidden" />
      </div>
    </div>
  );

  if (compact) return track;
  return (
    <div className={`w-full space-y-2 ${className ?? ""}`}>
      <div className="flex items-baseline justify-between text-[10px] font-semibold uppercase tracking-widest text-neutral-500">
        <span>
          {label ?? "Working"} · {Math.round(pct)}%
        </span>
        {estimated && estimateMs ? (
          <span className="font-normal normal-case tracking-normal tabular-nums text-neutral-400">
            {formatClock(elapsed)} / ~{formatClock(estimateMs)}
          </span>
        ) : null}
      </div>
      {track}
    </div>
  );
}
