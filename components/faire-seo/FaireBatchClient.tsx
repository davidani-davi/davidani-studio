"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import StudioHeader from "@/components/StudioHeader";
import {
  DEFAULT_FAIRE_SCHEMA,
  type ExtractedField,
  type FaireSchemaField,
  type FaireSeoResult,
  type FaireUploadedAsset,
} from "@/lib/faire-seo/schema";
import {
  estimateBatchMs,
  estimateRunMs,
  formatRemaining,
  getSampleCount,
  recordRunTiming,
} from "@/lib/faire-seo/timing";

const STORAGE_KEY = "davidani_faire_seo_sessions_v1";
const SCHEMA_KEY = "davidani_faire_schema_v1";
const TREND_KEYWORDS_KEY = "davidani_faire_trending_keywords_v1";
const CONCURRENCY = 5;

type RowStatus = "queued" | "importing" | "optimizing" | "done" | "error";

interface BatchRow {
  id: string;
  url: string;
  status: RowStatus;
  label: string;
  sku?: string;
  plusSku?: string;
  thumbnail?: string;
  fields?: ExtractedField[];
  result?: FaireSeoResult;
  error?: string;
  startedAt?: number;
  finishedAt?: number;
  forcePlus?: boolean;
}

function urlKey(url: string) {
  return url.split("?")[0].split("#")[0];
}

function loadSchema(): FaireSchemaField[] {
  try {
    const raw = localStorage.getItem(SCHEMA_KEY);
    return raw ? JSON.parse(raw) : DEFAULT_FAIRE_SCHEMA;
  } catch {
    return DEFAULT_FAIRE_SCHEMA;
  }
}

function loadTrendKeywords() {
  try {
    return localStorage.getItem(TREND_KEYWORDS_KEY) || "";
  } catch {
    return "";
  }
}

function persistSession(result: FaireSeoResult) {
  try {
    const existing = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]") as FaireSeoResult[];
    const next = [
      result,
      ...existing.filter((item) => item.listingId !== result.listingId),
    ].slice(0, 60);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* best effort */
  }
}

function slugFromUrl(url: string) {
  return url.match(/\/product\/([^/?#]+)/i)?.[1] || url;
}

function buildVariantSheet(result: FaireSeoResult, variant: "regular" | "plus"): string {
  const sku = variant === "plus" ? result.plusStyleNumber : result.styleNumber;
  const title = variant === "plus" ? result.plusOptimizedTitle : result.optimizedTitle;
  const description =
    variant === "plus" ? result.plusOptimizedDescription : result.optimizedDescription;
  if (!title && !description) return "";
  const metadataLines = Object.entries(result.metadataSelections || {})
    .filter(([, value]) =>
      Array.isArray(value) ? value.length : value !== "" && value !== undefined && value !== null
    )
    .map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(", ") : value}`);
  const sections: string[] = [
    `${variant === "plus" ? "PLUS LISTING" : "REGULAR LISTING"}${sku ? ` — ${sku}` : ""}`,
    `\nTITLE\n${title || "(none)"}`,
    `\nDESCRIPTION\n${description || "(none)"}`,
  ];
  if (metadataLines.length) sections.push(`\nPRODUCT DETAILS\n${metadataLines.join("\n")}`);
  return sections.join("\n");
}

function hasPlusVariant(result: FaireSeoResult) {
  return Boolean(
    (result.plusStyleNumber && result.plusStyleNumber.trim()) ||
      (result.plusOptimizedTitle && result.plusOptimizedTitle.trim()) ||
      (result.plusOptimizedDescription && result.plusOptimizedDescription.trim())
  );
}

function parseUrls(raw: string) {
  const seen = new Set<string>();
  const valid: string[] = [];
  let duplicates = 0;
  let invalid = 0;
  for (const line of raw.split(/\s+/).map((piece) => piece.trim()).filter(Boolean)) {
    if (!/^https:\/\/(www\.)?faire\.com\/product\//i.test(line)) {
      invalid += 1;
      continue;
    }
    const key = line.split("?")[0].split("#")[0];
    if (seen.has(key)) {
      duplicates += 1;
      continue;
    }
    seen.add(key);
    valid.push(line);
  }
  return { urls: valid, duplicates, invalid };
}

async function readNdjson<T>(input: string, init: RequestInit): Promise<T> {
  const res = await fetch(input, init);
  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `HTTP ${res.status}`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    for (const line of lines) {
      if (!line.trim()) continue;
      const event = JSON.parse(line);
      if (event.type === "error") throw new Error(event.error);
      if (event.type === "complete") return event;
    }
  }
  throw new Error("Stream ended before completion.");
}

export default function FaireBatchClient() {
  const [schema, setSchema] = useState<FaireSchemaField[]>(DEFAULT_FAIRE_SCHEMA);
  const [trendKeywords, setTrendKeywords] = useState("");
  const [urlsText, setUrlsText] = useState("");
  const [rows, setRows] = useState<BatchRow[]>([]);
  const [running, setRunning] = useState(false);
  const [parseNote, setParseNote] = useState<string>("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [perListingMs, setPerListingMs] = useState<number>(30_000);
  const [sampleCount, setSampleCount] = useState(0);
  const [forcePlusKeys, setForcePlusKeys] = useState<Set<string>>(new Set());
  const [thumbnails, setThumbnails] = useState<Record<string, string | null>>({});
  const fetchInflightRef = useRef<Set<string>>(new Set());
  const fetchDebounceRef = useRef<number | null>(null);
  const cancelRef = useRef(false);

  const parsedPreview = useMemo(() => parseUrls(urlsText), [urlsText]);

  useEffect(() => {
    if (fetchDebounceRef.current) window.clearTimeout(fetchDebounceRef.current);
    fetchDebounceRef.current = window.setTimeout(() => {
      for (const url of parsedPreview.urls) {
        const key = urlKey(url);
        if (key in thumbnails || fetchInflightRef.current.has(key)) continue;
        fetchInflightRef.current.add(key);
        fetch("/api/faire-seo/preview-thumb", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url }),
        })
          .then((res) => res.json().catch(() => ({})))
          .then((data) => {
            setThumbnails((current) => ({ ...current, [key]: data?.thumbnail || null }));
          })
          .catch(() => {
            setThumbnails((current) => ({ ...current, [key]: null }));
          })
          .finally(() => {
            fetchInflightRef.current.delete(key);
          });
      }
    }, 500);
    return () => {
      if (fetchDebounceRef.current) window.clearTimeout(fetchDebounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parsedPreview.urls.join("|")]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setSchema(loadSchema());
      setTrendKeywords(loadTrendKeywords());
      setPerListingMs(estimateRunMs());
      setSampleCount(getSampleCount());
    }
  }, []);

  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(id);
  }, [running]);

  const counts = useMemo(() => {
    const summary = { total: rows.length, done: 0, error: 0, working: 0, queued: 0 };
    for (const row of rows) {
      if (row.status === "done") summary.done += 1;
      else if (row.status === "error") summary.error += 1;
      else if (row.status === "importing" || row.status === "optimizing") summary.working += 1;
      else if (row.status === "queued") summary.queued += 1;
    }
    return summary;
  }, [rows]);

  const batchEta = useMemo(() => {
    if (!running) return 0;
    const inflight = rows
      .filter((row) => row.status === "importing" || row.status === "optimizing")
      .map((row) => Math.max(0, now - (row.startedAt ?? now)));
    return estimateBatchMs(counts.queued, counts.working, CONCURRENCY, inflight);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, running, now, counts.queued, counts.working, perListingMs]);

  function patchRow(id: string, patch: Partial<BatchRow>) {
    setRows((current) => current.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  }

  async function processRow(row: BatchRow) {
    const startedAt = Date.now();
    try {
      patchRow(row.id, { status: "importing", error: undefined, startedAt, finishedAt: undefined });
      const importRes = await fetch("/api/faire-seo/import-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: row.url }),
      });
      const importData = await importRes.json();
      if (!importRes.ok || importData?.ok === false) {
        throw new Error(importData?.error || `Import failed (HTTP ${importRes.status})`);
      }
      const importedAssets = (importData.assets || []) as FaireUploadedAsset[];
      const importedFields = (importData.fields || []) as ExtractedField[];
      if (!importedAssets.length) {
        throw new Error("No images found on this Faire listing.");
      }
      const sku =
        importedFields.find((field) => field.id === "styleNumber")?.value?.trim() || undefined;
      const plusSku =
        importedFields.find((field) => field.id === "plusStyleNumber")?.value?.trim() || undefined;
      patchRow(row.id, {
        status: "optimizing",
        sku,
        plusSku,
        thumbnail: importedAssets[0]?.url,
        label: sku || row.label,
      });

      const optimization = await readNdjson<{
        type: "complete";
        fields: ExtractedField[];
        result: FaireSeoResult;
      }>("/api/faire-seo/optimize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assets: importedAssets,
          schema,
          seedFields: importedFields,
          tone: "fast automatic Faire SEO optimization",
          trendKeywords,
          forcePlus: Boolean(row.forcePlus),
        }),
      });

      const result = { ...optimization.result, extractedFields: optimization.fields };
      persistSession(result);
      const finishedAt = Date.now();
      recordRunTiming(finishedAt - startedAt);
      setPerListingMs(estimateRunMs());
      setSampleCount(getSampleCount());
      patchRow(row.id, {
        status: "done",
        fields: optimization.fields,
        result,
        sku: result.styleNumber || sku,
        plusSku: result.plusStyleNumber || plusSku,
        finishedAt,
      });
    } catch (err: any) {
      patchRow(row.id, { status: "error", error: err?.message || "Failed", finishedAt: Date.now() });
    }
  }

  async function runPool(initial: BatchRow[]) {
    cancelRef.current = false;
    setRunning(true);
    const queue = [...initial];
    const workers: Promise<void>[] = [];
    const launch = async () => {
      while (queue.length && !cancelRef.current) {
        const next = queue.shift()!;
        await processRow(next);
      }
    };
    for (let i = 0; i < Math.min(CONCURRENCY, queue.length); i += 1) {
      workers.push(launch());
    }
    await Promise.all(workers);
    setRunning(false);
  }

  function startBatch() {
    const { urls, duplicates, invalid } = parseUrls(urlsText);
    const notes: string[] = [];
    if (duplicates) notes.push(`${duplicates} duplicate${duplicates === 1 ? "" : "s"} removed`);
    if (invalid) notes.push(`${invalid} non-Faire URL${invalid === 1 ? "" : "s"} skipped`);
    setParseNote(notes.join(" • "));
    if (!urls.length) {
      setRows([]);
      return;
    }
    const next: BatchRow[] = urls.map((url) => ({
      id: url,
      url,
      status: "queued",
      label: slugFromUrl(url),
      forcePlus: forcePlusKeys.has(urlKey(url)),
    }));
    setRows(next);
    setExpanded(null);
    runPool(next);
  }

  function retryRow(id: string) {
    const row = rows.find((r) => r.id === id);
    if (!row) return;
    runPool([{ ...row, status: "queued", error: undefined, forcePlus: forcePlusKeys.has(urlKey(row.url)) }]);
  }

  function toggleForcePlus(url: string) {
    const key = urlKey(url);
    setForcePlusKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function retryFailed() {
    const failed = rows.filter((row) => row.status === "error");
    if (!failed.length) return;
    runPool(failed.map((row) => ({ ...row, status: "queued", error: undefined })));
  }

  function copy(text: string) {
    navigator.clipboard?.writeText(text);
  }

  function copyAllSheets(variant: "regular" | "plus" | "both") {
    const sections: string[] = [];
    for (const row of rows) {
      if (row.status !== "done" || !row.result) continue;
      if (variant === "regular" || variant === "both") {
        const sheet = buildVariantSheet(row.result, "regular");
        if (sheet) sections.push(sheet);
      }
      if ((variant === "plus" || variant === "both") && hasPlusVariant(row.result)) {
        const sheet = buildVariantSheet(row.result, "plus");
        if (sheet) sections.push(sheet);
      }
    }
    if (sections.length) copy(sections.join("\n\n========================================\n\n"));
  }

  function exportCsv() {
    const header = ["sku", "plus_sku", "title", "plus_title", "url", "status"];
    const escape = (value: string) => `"${(value || "").replace(/"/g, '""')}"`;
    const lines = [header.join(",")];
    for (const row of rows) {
      lines.push(
        [
          escape(row.sku || ""),
          escape(row.plusSku || ""),
          escape(row.result?.optimizedTitle || ""),
          escape(row.result?.plusOptimizedTitle || ""),
          escape(row.url),
          escape(row.status),
        ].join(",")
      );
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `faire-seo-batch-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  return (
    <main className="min-h-screen bg-neutral-100 pb-12">
      <StudioHeader
        active="faire-seo"
        title="Faire SEO Batch"
        subtitle="Paste Faire preview links — get optimized listings in parallel."
        badge="BATCH"
        metrics={[
          { label: "Listings", value: counts.total },
          { label: "Done", value: counts.done },
          { label: "Working", value: counts.working },
          { label: "Failed", value: counts.error },
        ]}
      />

      <div className="mx-auto grid max-w-[1380px] gap-5 px-4 py-5 xl:grid-cols-[440px_minmax(0,1fr)]">
        <section className="space-y-4">
          <div className="rounded-lg border border-neutral-300 bg-white p-5 shadow-sm">
            <p className="text-xs font-bold uppercase text-neutral-500">Batch Faire Optimizer</p>
            <h2 className="mt-3 text-xl font-semibold text-neutral-950">Paste Faire URLs</h2>
            <p className="mt-2 text-sm leading-relaxed text-neutral-500">
              One URL per line. Up to {CONCURRENCY} run in parallel. Duplicates auto-removed.
            </p>
            <textarea
              value={urlsText}
              onChange={(event) => setUrlsText(event.target.value)}
              placeholder={"https://www.faire.com/product/p_abc123\nhttps://www.faire.com/product/p_def456"}
              className="mt-4 min-h-[160px] w-full rounded-md border border-neutral-200 bg-neutral-50 p-3 font-mono text-xs leading-relaxed"
              disabled={running}
            />
            {parsedPreview.urls.length > 0 ? (
              <div className="mt-3 rounded-md border border-neutral-200 bg-neutral-50 p-2">
                <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
                  {parsedPreview.urls.length} URL{parsedPreview.urls.length === 1 ? "" : "s"} ready
                  {forcePlusKeys.size ? ` • ${forcePlusKeys.size} forced plus` : ""}
                </p>
                <ul className="grid grid-cols-4 gap-1.5 sm:grid-cols-5">
                  {parsedPreview.urls.map((url) => {
                    const key = urlKey(url);
                    const forced = forcePlusKeys.has(key);
                    const thumb = thumbnails[key];
                    const loading = !(key in thumbnails);
                    return (
                      <li key={key} className="relative">
                        <button
                          type="button"
                          onClick={() => toggleForcePlus(url)}
                          disabled={running}
                          title={
                            forced
                              ? "Forced plus — click to remove"
                              : "Click to force plus copy for this listing"
                          }
                          className={`group relative block aspect-square w-full overflow-hidden rounded border-2 bg-neutral-100 transition-all disabled:opacity-40 ${
                            forced
                              ? "border-emerald-500 ring-2 ring-emerald-200"
                              : "border-neutral-200 hover:border-neutral-400"
                          }`}
                        >
                          {thumb ? (
                            <img src={thumb} alt="" className="h-full w-full object-cover" />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-[9px] text-neutral-400">
                              {loading ? "..." : "—"}
                            </div>
                          )}
                          <span
                            className={`absolute bottom-0 left-0 right-0 px-1 py-0.5 text-[9px] font-bold uppercase tracking-wide transition-opacity ${
                              forced
                                ? "bg-emerald-500 text-white opacity-100"
                                : "bg-black/60 text-white opacity-0 group-hover:opacity-100"
                            }`}
                          >
                            {forced ? "✓ Plus" : "+ Force Plus"}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : null}
            <button
              onClick={startBatch}
              disabled={running || !urlsText.trim()}
              className="mt-3 w-full rounded-md bg-neutral-950 px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {running ? `Running (${counts.working} active)...` : "Optimize All"}
            </button>
            {running ? (
              <p className="mt-2 text-xs font-semibold text-neutral-700">
                {sampleCount === 0
                  ? `Working — learning your typical run time...`
                  : `Batch ETA ${formatRemaining(batchEta)} • ~${Math.round(perListingMs / 1000)}s per listing (from last ${Math.min(sampleCount, 15)} runs)`}
              </p>
            ) : counts.total > 0 ? (
              <p className="mt-2 text-xs text-neutral-500">
                Done — {counts.done}/{counts.total} succeeded
                {sampleCount > 0 ? ` • ~${Math.round(perListingMs / 1000)}s per listing` : ""}
              </p>
            ) : null}
            {parseNote ? <p className="mt-2 text-xs text-neutral-500">{parseNote}</p> : null}
            {counts.total > 0 ? (
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  onClick={() => copyAllSheets("regular")}
                  disabled={!counts.done}
                  className="rounded-md border border-neutral-300 bg-white px-3 py-2 text-xs font-semibold text-neutral-900 disabled:opacity-40"
                >
                  Copy all regular
                </button>
                <button
                  onClick={() => copyAllSheets("plus")}
                  disabled={!counts.done}
                  className="rounded-md border border-neutral-300 bg-white px-3 py-2 text-xs font-semibold text-neutral-900 disabled:opacity-40"
                >
                  Copy all plus
                </button>
                <button
                  onClick={() => copyAllSheets("both")}
                  disabled={!counts.done}
                  className="rounded-md border border-neutral-300 bg-white px-3 py-2 text-xs font-semibold text-neutral-900 disabled:opacity-40"
                >
                  Copy all (reg + plus)
                </button>
                <button
                  onClick={exportCsv}
                  disabled={!counts.done}
                  className="rounded-md border border-neutral-300 bg-white px-3 py-2 text-xs font-semibold text-neutral-900 disabled:opacity-40"
                >
                  Export CSV
                </button>
                <button
                  onClick={retryFailed}
                  disabled={!counts.error || running}
                  className="rounded-md border border-neutral-300 bg-white px-3 py-2 text-xs font-semibold text-neutral-900 disabled:opacity-40"
                >
                  Retry failed ({counts.error})
                </button>
              </div>
            ) : null}
          </div>

          <div className="rounded-lg border border-neutral-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-semibold text-neutral-500">
              Schema and trending keywords are loaded from your single-mode settings.
            </p>
            <a
              href="/faire-seo"
              className="mt-2 inline-block text-xs font-semibold text-neutral-900 underline"
            >
              Single listing mode →
            </a>
          </div>
        </section>

        <section className="space-y-3">
          {rows.length === 0 ? (
            <div className="grid min-h-[420px] place-items-center rounded-lg border border-neutral-200 bg-white p-8 text-center shadow-sm">
              <div className="max-w-md">
                <p className="text-xs font-bold uppercase text-neutral-500">Output</p>
                <h2 className="mt-3 text-xl font-semibold text-neutral-950">
                  Paste URLs and hit Optimize All.
                </h2>
                <p className="mt-3 text-sm leading-relaxed text-neutral-500">
                  Each row tracks its own listing — independent status, copy buttons, and retry.
                </p>
              </div>
            </div>
          ) : (
            rows.map((row) => (
              <BatchRowCard
                key={row.id}
                row={row}
                expanded={expanded === row.id}
                onToggle={() => setExpanded(expanded === row.id ? null : row.id)}
                onRetry={() => retryRow(row.id)}
                onCopy={copy}
                now={now}
                perListingMs={perListingMs}
              />
            ))
          )}
        </section>
      </div>
    </main>
  );
}

function statusBadge(status: RowStatus) {
  const map: Record<RowStatus, { label: string; className: string }> = {
    queued: { label: "Queued", className: "bg-neutral-200 text-neutral-700" },
    importing: { label: "Importing", className: "bg-amber-100 text-amber-800" },
    optimizing: { label: "Optimizing", className: "bg-blue-100 text-blue-800" },
    done: { label: "Done", className: "bg-emerald-100 text-emerald-800" },
    error: { label: "Failed", className: "bg-red-100 text-red-800" },
  };
  const info = map[status];
  return (
    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase ${info.className}`}>
      {info.label}
    </span>
  );
}

function BatchRowCard({
  row,
  expanded,
  onToggle,
  onRetry,
  onCopy,
  now,
  perListingMs,
}: {
  row: BatchRow;
  expanded: boolean;
  onToggle: () => void;
  onRetry: () => void;
  onCopy: (text: string) => void;
  now: number;
  perListingMs: number;
}) {
  const titlePreview = row.result?.optimizedTitle || row.label;
  const isActive = row.status === "importing" || row.status === "optimizing";
  const elapsedMs = isActive && row.startedAt ? now - row.startedAt : 0;
  const remainingMs = perListingMs - elapsedMs;
  const totalMs = row.startedAt && row.finishedAt ? row.finishedAt - row.startedAt : 0;
  return (
    <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-sm">
      <button
        onClick={onToggle}
        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-neutral-50"
      >
        <div className="h-12 w-12 flex-shrink-0 overflow-hidden rounded border border-neutral-200 bg-neutral-100">
          {row.thumbnail ? (
            <img src={row.thumbnail} alt="" className="h-full w-full object-cover" />
          ) : null}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-neutral-950">
              {row.sku || row.label}
            </span>
            {statusBadge(row.status)}
            {row.plusSku ? (
              <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-neutral-600">
                +{row.plusSku}
              </span>
            ) : null}
          </div>
          <p className="mt-1 truncate text-xs text-neutral-500">{titlePreview}</p>
          {isActive ? (
            <p className="mt-1 text-[11px] text-neutral-500">
              {remainingMs > 0
                ? `ETA ${formatRemaining(remainingMs)} • elapsed ${Math.round(elapsedMs / 1000)}s`
                : `Elapsed ${Math.round(elapsedMs / 1000)}s — almost done`}
            </p>
          ) : row.status === "done" && totalMs ? (
            <p className="mt-1 text-[11px] text-neutral-500">
              Done in {Math.round(totalMs / 1000)}s
            </p>
          ) : null}
          {row.error ? (
            <p className="mt-1 truncate text-xs font-semibold text-red-700">{row.error}</p>
          ) : null}
        </div>
        <span className="text-xs text-neutral-400">{expanded ? "Hide" : "Show"}</span>
      </button>

      {expanded && row.result ? (
        <div className="space-y-5 border-t border-neutral-200 bg-neutral-50 p-4">
          <div className="rounded-md border border-neutral-200 bg-white p-3">
            <p className="mb-3 text-[11px] font-bold uppercase tracking-wide text-neutral-500">
              Regular {row.result.styleNumber ? `· ${row.result.styleNumber}` : ""}
            </p>
            <div className="space-y-3">
              <OutputBlock
                label="Title"
                value={row.result.optimizedTitle}
                onCopy={onCopy}
              />
              <OutputBlock
                label="Paste-ready sheet"
                value={buildVariantSheet(row.result, "regular")}
                onCopy={onCopy}
                multiline
              />
            </div>
          </div>
          {hasPlusVariant(row.result) ? (
            <div className="rounded-md border border-neutral-200 bg-white p-3">
              <p className="mb-3 text-[11px] font-bold uppercase tracking-wide text-neutral-500">
                Plus {row.result.plusStyleNumber ? `· ${row.result.plusStyleNumber}` : ""}
              </p>
              <div className="space-y-3">
                <OutputBlock
                  label="Plus title"
                  value={row.result.plusOptimizedTitle}
                  onCopy={onCopy}
                />
                <OutputBlock
                  label="Plus paste-ready sheet"
                  value={buildVariantSheet(row.result, "plus")}
                  onCopy={onCopy}
                  multiline
                />
              </div>
            </div>
          ) : null}
          <a
            href={row.url}
            target="_blank"
            rel="noreferrer"
            className="inline-block text-xs font-semibold text-neutral-700 underline"
          >
            Open original Faire listing →
          </a>
        </div>
      ) : null}

      {expanded && row.status === "error" ? (
        <div className="border-t border-neutral-200 bg-red-50 p-4">
          <p className="text-sm font-semibold text-red-800">{row.error}</p>
          <button
            onClick={onRetry}
            className="mt-3 rounded-md border border-red-300 bg-white px-3 py-2 text-xs font-semibold text-red-800"
          >
            Retry this listing
          </button>
        </div>
      ) : null}
    </div>
  );
}

function OutputBlock({
  label,
  value,
  onCopy,
  multiline,
}: {
  label: string;
  value: string;
  onCopy: (text: string) => void;
  multiline?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  function handleCopy() {
    onCopy(value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">{label}</p>
        <button
          onClick={handleCopy}
          disabled={!value}
          className="rounded-md border border-neutral-300 bg-white px-2 py-1 text-[11px] font-semibold text-neutral-900 disabled:opacity-40"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      {multiline ? (
        <textarea
          readOnly
          value={value}
          rows={Math.min(16, Math.max(4, value.split("\n").length + 1))}
          className="w-full rounded-md border border-neutral-200 bg-white p-3 font-mono text-xs leading-relaxed"
        />
      ) : (
        <input
          readOnly
          value={value}
          className="w-full rounded-md border border-neutral-200 bg-white p-2 text-sm"
        />
      )}
    </div>
  );
}
