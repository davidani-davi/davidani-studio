"use client";

import { useEffect, useRef, useState } from "react";
import StudioHeader from "@/components/StudioHeader";
import { resizeIfNeeded } from "@/lib/image-resize";
import {
  estimateRunMs,
  formatRemaining,
  getSampleCount,
  recordRunTiming,
} from "@/lib/faire-seo/timing";
import {
  CORE_EXTRACTION_FIELDS,
  DEFAULT_FAIRE_SCHEMA,
  emptyScore,
  type ExtractedField,
  type FaireSeoResult,
  type FaireUploadedAsset,
} from "@/lib/faire-seo/schema";

const STORAGE_KEY = "davidani_faire_seo_sessions_v1";
const SCHEMA_KEY = "davidani_faire_schema_v1";
const TREND_KEYWORDS_KEY = "davidani_faire_trending_keywords_v1";

function defaultFields(): ExtractedField[] {
  return CORE_EXTRACTION_FIELDS.map((field) => ({
    ...field,
    value: "",
    confidence: "missing",
    source: "missing",
  }));
}

function defaultResult(): FaireSeoResult {
  return {
    listingId: "",
    styleNumber: "",
    plusStyleNumber: "",
    extractedFields: [],
    optimizedFields: {},
    originalTitle: "",
    optimizedTitle: "",
    plusOptimizedTitle: "",
    originalDescription: "",
    optimizedDescription: "",
    plusOptimizedDescription: "",
    metadataSelections: {},
    seoKeywordStrategy: [],
    productDetailRecommendations: [],
    imageOrder: [],
    beforeScore: emptyScore(),
    afterScore: emptyScore(),
    scoreRationale: [],
    finalCopySheet: "",
    updatedAt: new Date().toISOString(),
  };
}

async function fetchJson(label: string, input: string, init?: RequestInit): Promise<any> {
  const res = await fetch(input, init);
  const raw = await res.text();
  let data: any;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    throw new Error(`${label}: server returned non-JSON (${res.status}).`);
  }
  if (!res.ok) throw new Error(`${label}: ${data?.error || `HTTP ${res.status}`}`);
  return data;
}

async function readNdjson<T>(
  label: string,
  input: string,
  init: RequestInit,
  onProgress: (message: string) => void
): Promise<T> {
  const res = await fetch(input, init);
  if (!res.ok || !res.body) {
    const text = await res.text();
    throw new Error(`${label}: ${text || `HTTP ${res.status}`}`);
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
      if (event.type === "progress") onProgress(event.message);
      if (event.type === "error") throw new Error(event.error);
      if (event.type === "complete") return event;
    }
  }

  throw new Error(`${label}: stream ended before completion.`);
}

async function sha256(file: File) {
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function loadSchema() {
  try {
    const saved = localStorage.getItem(SCHEMA_KEY);
    return saved ? JSON.parse(saved) : DEFAULT_FAIRE_SCHEMA;
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
    const next = [result, ...existing.filter((item) => item.listingId !== result.listingId)].slice(
      0,
      30
    );
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* best effort */
  }
}

function inferAssetRole(file: File, index: number): FaireUploadedAsset["role"] {
  const name = file.name.toLowerCase();
  if (name.includes("trend") || name.includes("keyword") || name.includes("insider")) {
    return "trending_keyword_reference";
  }
  if (name.includes("plus")) return "plus_screenshot";
  if (name.includes("screenshot") || name.includes("screen shot") || index === 0) {
    return "listing_screenshot";
  }
  if (name.includes("color")) return "colorway_photo";
  if (name.includes("detail") || name.includes("close")) return "detail_shot";
  if (name.includes("set") || name.includes("matching")) return "matching_set_photo";
  return "product_photo";
}

function copyText(text: string) {
  navigator.clipboard?.writeText(text);
}

function resultJson(assets: FaireUploadedAsset[], fields: ExtractedField[], result: FaireSeoResult) {
  return JSON.stringify({ assets, extractedFields: fields, result }, null, 2);
}

function mergeExtractedFields(base: ExtractedField[], incoming: ExtractedField[]) {
  const incomingById = new Map(incoming.map((field) => [field.id, field]));
  return base.map((field) => {
    const next = incomingById.get(field.id);
    if (!next?.value?.trim()) return field;
    if (field.value.trim() && field.confidence === "high") return field;
    return next;
  });
}

function normalizeSectionTitle(title: string) {
  return title.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function normalizeSectionBody(title: string, body: string) {
  const trimmed = body.trim();
  if (!trimmed) return "";
  if (/^(Features|Perfect For)$/i.test(title)) {
    return trimmed
      .split(/\n|•|;\s*|,\s+(?=[a-z0-9])/i)
      .map((item) => item.replace(/^[-•\s]+/, "").trim())
      .filter(Boolean)
      .map((item) => `• ${item}`)
      .join("\n");
  }
  if (/^Description$/i.test(title)) {
    return trimmed
      .replace(/\s*(?<=\.)\s+(?=(These|Designed|Plus-size|This|A|The)\b)/g, "\n\n")
      .trim();
  }
  return trimmed;
}

function splitDescription(description: string) {
  const sections: Record<string, string> = {};
  let active = "Description";
  const normalized = description
    .replace(/\r\n/g, "\n")
    .replace(/\s+(Features|Perfect For|Fabric|Model):/gi, "\n$1:");
  const lines = normalized.split("\n");

  for (const line of lines) {
    const trimmed = line.trim();
    const match = trimmed.match(/^(Features|Perfect For|Fabric|Model):\s*(.*)$/i);
    if (match) {
      active = normalizeSectionTitle(match[1]);
      sections[active] = [sections[active], match[2]].filter(Boolean).join("\n");
      continue;
    }
    sections[active] = [sections[active], line].filter(Boolean).join("\n");
  }

  return Object.entries(sections)
    .map(([title, body]) => ({ title, body: normalizeSectionBody(title, body) }))
    .filter((section) => section.body);
}

function textareaRows(value: string, area?: boolean) {
  const visualRows = value
    .split("\n")
    .reduce((rows, line) => rows + Math.max(1, Math.ceil(line.length / 92)), 0);
  return Math.min(area ? 14 : 6, Math.max(area ? 4 : 2, visualRows));
}

function fieldLabel(id: string) {
  const schemaField = DEFAULT_FAIRE_SCHEMA.find((field) => field.id === id);
  if (schemaField) return schemaField.label;
  return id.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function extractedValue(fields: ExtractedField[], id: string) {
  return fields.find((field) => field.id === id)?.value.trim() || "";
}

function keyValueLines(values: Record<string, unknown>) {
  return Object.entries(values)
    .filter(([, value]) =>
      Array.isArray(value) ? value.length : value !== "" && value !== undefined && value !== null
    )
    .map(([key, value]) => `${fieldLabel(key)}: ${Array.isArray(value) ? value.join(", ") : value}`)
    .join("\n");
}

export default function FaireSeoClient() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const trendInputRef = useRef<HTMLInputElement>(null);
  const runIdRef = useRef(0);
  const [schema, setSchema] = useState(DEFAULT_FAIRE_SCHEMA);
  const [assets, setAssets] = useState<FaireUploadedAsset[]>([]);
  const [fields, setFields] = useState<ExtractedField[]>(defaultFields);
  const [result, setResult] = useState<FaireSeoResult>(defaultResult);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [working, setWorking] = useState(false);
  const [status, setStatus] = useState("Drop images to start.");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [activeListing, setActiveListing] = useState<"regular" | "plus">("regular");
  const [trendKeywords, setTrendKeywords] = useState("");
  const [faireUrl, setFaireUrl] = useState("");
  const [importingUrl, setImportingUrl] = useState(false);
  const [runStartedAt, setRunStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [estimateMs, setEstimateMs] = useState<number>(30_000);
  const [sampleCount, setSampleCount] = useState(0);

  useEffect(() => {
    setEstimateMs(estimateRunMs());
    setSampleCount(getSampleCount());
  }, []);

  useEffect(() => {
    if (runStartedAt === null) return;
    const id = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(id);
  }, [runStartedAt]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setSchema(loadSchema());
      setTrendKeywords(loadTrendKeywords());
    }
  }, []);

  async function optimizeListing(nextAssets: FaireUploadedAsset[]) {
    const runId = ++runIdRef.current;
    setWorking(true);
    setError(null);
    setStatus("Analyzing images and Faire screenshot...");
    const startedAt = Date.now();
    setRunStartedAt(startedAt);
    setNow(startedAt);

    try {
      const seedFields = fields;
      const optimization = await readNdjson<{
        type: "complete";
        fields: ExtractedField[];
        result: FaireSeoResult;
      }>(
        "Faire optimization",
        "/api/faire-seo/optimize",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            assets: nextAssets,
            schema,
            seedFields,
            tone: "fast automatic Faire SEO optimization",
            trendKeywords,
          }),
        },
        setStatus
      );
      if (runId !== runIdRef.current) return;

      const mergedFields = mergeExtractedFields(optimization.fields, seedFields);
      setFields(mergedFields);
      const next = { ...optimization.result, extractedFields: mergedFields };
      setResult(next);
      persistSession(next);
      const elapsed = Date.now() - startedAt;
      recordRunTiming(elapsed);
      setEstimateMs(estimateRunMs());
      setSampleCount(getSampleCount());
      setStatus(`Optimized Faire listing ready in ${Math.round(elapsed / 1000)}s.`);
    } catch (err: any) {
      if (runId === runIdRef.current) {
        setError(err?.message || "Faire SEO optimization failed.");
        setStatus("Upload images and try again.");
      }
    } finally {
      if (runId === runIdRef.current) {
        setWorking(false);
        setRunStartedAt(null);
      }
    }
  }

  async function importFaireUrl() {
    const trimmed = faireUrl.trim();
    if (!trimmed) return;
    setImportingUrl(true);
    setError(null);
    setStatus("Importing Faire preview link...");
    try {
      const data = await fetchJson("Import Faire URL", "/api/faire-seo/import-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: trimmed }),
      });
      const importedAssets = (data.assets || []) as FaireUploadedAsset[];
      const importedFields = (data.fields || []) as ExtractedField[];
      setAssets((current) => {
        const existing = new Set(current.map((asset) => asset.hash || asset.url));
        const fresh = importedAssets.filter((asset) => !existing.has(asset.hash || asset.url));
        return [...current, ...fresh];
      });
      setFields((current) => mergeExtractedFields(current, importedFields));
      setStatus(
        `Imported Faire listing${importedAssets.length ? ` with ${importedAssets.length} image${importedAssets.length === 1 ? "" : "s"}` : ""}. Generate when ready.`
      );
    } catch (err: any) {
      setError(err?.message || "Could not import Faire URL.");
      setStatus("Paste a public Faire product preview link and try again.");
    } finally {
      setImportingUrl(false);
    }
  }

  async function addFiles(files: FileList | File[], forcedRole?: FaireUploadedAsset["role"]) {
    const list = Array.from(files).filter((file) => file.type.startsWith("image/"));
    if (!list.length) return;
    setUploading(true);
    setError(null);
    setStatus("Uploading images...");

    try {
      const hashes = await Promise.all(list.map((file) => sha256(file)));
      const resized = await Promise.all(list.map((file) => resizeIfNeeded(file)));
      const form = new FormData();
      resized.forEach((file) => form.append("files", file));
      const data = await fetchJson("Upload", "/api/upload", { method: "POST", body: form });

      const added: FaireUploadedAsset[] = (data.uploads || []).map((upload: any, index: number) => ({
        id: `${Date.now()}-${index}-${hashes[index].slice(0, 8)}`,
        name: String(upload.name || list[index]?.name || "upload.png"),
        url: String(upload.url),
        hash: hashes[index],
        role: forcedRole || inferAssetRole(list[index], assets.length + index),
      }));

      setAssets((current) => [...current, ...added]);
      setStatus(`${assets.length + added.length} image${assets.length + added.length === 1 ? "" : "s"} ready. Add more or generate when ready.`);
    } catch (err: any) {
      setError(err?.message || "Upload failed.");
      setStatus("Upload images and try again.");
    } finally {
      setUploading(false);
      setDragging(false);
    }
  }

  async function addTrendKeywordFiles(files: FileList | File[]) {
    const list = Array.from(files);
    if (!list.length) return;
    const imageFiles = list.filter((file) => file.type.startsWith("image/"));
    const textFiles = list.filter((file) => !file.type.startsWith("image/"));

    try {
      const textChunks = await Promise.all(textFiles.map((file) => file.text()));
      if (textChunks.length) {
        const next = [trendKeywords, ...textChunks].filter(Boolean).join("\n\n").trim();
        setTrendKeywords(next);
        localStorage.setItem(TREND_KEYWORDS_KEY, next);
        setStatus("Trending keyword reference saved for future listings.");
      }
      if (imageFiles.length) {
        await addFiles(imageFiles, "trending_keyword_reference");
        setStatus("Trending keyword image uploaded. It will be considered during generation.");
      }
    } catch (err: any) {
      setError(err?.message || "Trending keyword upload failed.");
    }
  }

  function updateTrendKeywords(value: string) {
    setTrendKeywords(value);
    try {
      localStorage.setItem(TREND_KEYWORDS_KEY, value);
    } catch {
      /* ignore */
    }
  }

  function removeAsset(id: string) {
    const nextAssets = assets.filter((asset) => asset.id !== id);
    setAssets(nextAssets);
    if (!nextAssets.length) {
      runIdRef.current += 1;
      setFields(defaultFields());
      setResult(defaultResult());
      setStatus("Drop images to start.");
      setError(null);
    } else {
      setStatus(`${nextAssets.length} image${nextAssets.length === 1 ? "" : "s"} ready. Generate when ready.`);
    }
  }

  function updateResult<K extends keyof FaireSeoResult>(key: K, value: FaireSeoResult[K]) {
    setResult((current) => {
      const next = { ...current, [key]: value, updatedAt: new Date().toISOString() };
      persistSession(next);
      return next;
    });
  }

  function markCopied(label: string, text: string) {
    copyText(text);
    setCopied(label);
    window.setTimeout(() => setCopied(null), 1200);
  }

  const hasResult = Boolean(result.finalCopySheet || result.optimizedTitle || result.optimizedDescription);
  const regularDescriptionSections = splitDescription(result.optimizedDescription);
  const plusDescriptionSections = splitDescription(result.plusOptimizedDescription);
  const hasPlusListing = Boolean(
    result.plusOptimizedTitle || result.plusOptimizedDescription || result.plusStyleNumber || extractedValue(fields, "plusStyleNumber")
  );
  const isPlusActive = activeListing === "plus" && hasPlusListing;
  const activeTitle = isPlusActive ? result.plusOptimizedTitle : result.optimizedTitle;
  const activeDescription = isPlusActive ? result.plusOptimizedDescription : result.optimizedDescription;
  const activeListingLabel = isPlusActive ? "Plus" : "Regular";
  const activeDescriptionSections = isPlusActive ? plusDescriptionSections : regularDescriptionSections;
  const productType = extractedValue(fields, "productCategory") || extractedValue(fields, "garmentType");
  const productOptionsText = [
    [
      "Style number",
      isPlusActive
        ? result.plusStyleNumber || extractedValue(fields, "plusStyleNumber")
        : result.styleNumber || extractedValue(fields, "styleNumber"),
    ],
    ["Colors", extractedValue(fields, "colorNames")],
    ["Product options", extractedValue(fields, "productOptions")],
    ["Price / MSRP", extractedValue(fields, "priceMsrp")],
  ]
    .filter(([, value]) => value)
    .map(([label, value]) => `${label}: ${value}`)
    .join("\n");
  const productDetailsText = keyValueLines(result.metadataSelections);
  const seoKeywordText = result.seoKeywordStrategy.join("\n");
  const uploadNotesText = [
    productType ? `Product type: ${productType}` : "",
    productDetailsText,
    productOptionsText,
    seoKeywordText ? `Tags / keywords:\n${seoKeywordText}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  return (
    <main className="min-h-screen bg-neutral-50 text-neutral-950">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(event) => {
          if (event.target.files) addFiles(event.target.files);
          event.currentTarget.value = "";
        }}
      />
      <input
        ref={trendInputRef}
        type="file"
        accept="image/*,.txt,.csv,.md"
        multiple
        className="hidden"
        onChange={(event) => {
          if (event.target.files) addTrendKeywordFiles(event.target.files);
          event.currentTarget.value = "";
        }}
      />

      <StudioHeader
        active="faire-seo"
        title="Faire SEO Optimization"
        subtitle="Upload images. Get a paste-ready Faire listing."
        badge="FAST"
        metrics={[
          { label: "Images", value: assets.length },
          { label: "Status", value: working ? "AI" : hasResult ? "Ready" : "Idle" },
        ]}
      />

      <div className="mx-auto grid max-w-[1380px] gap-5 px-4 py-5 xl:grid-cols-[420px_minmax(0,1fr)]">
        <section className="space-y-4">
          <div
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              addFiles(event.dataTransfer.files);
            }}
            className={`rounded-lg border border-dashed bg-white p-6 shadow-sm ${
              dragging ? "border-neutral-950" : "border-neutral-300"
            }`}
          >
            <p className="text-xs font-bold uppercase text-neutral-500">Faire Listing Optimizer</p>
            <h2 className="mt-3 text-2xl font-semibold leading-tight text-neutral-950">
              Upload everything, then generate.
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-neutral-500">
              Paste a public Faire preview link, or upload screenshots and product images. When the set is ready,
              generate the optimized listing.
            </p>
            <a
              href="/faire-seo/batch"
              className="mt-3 inline-block rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-xs font-semibold text-neutral-900 hover:bg-neutral-50"
            >
              Batch mode (paste many URLs) →
            </a>
            <div className="mt-5 rounded-lg border border-neutral-200 bg-neutral-50 p-3">
              <label className="text-xs font-bold uppercase text-neutral-500" htmlFor="faire-product-url">
                Faire product preview link
              </label>
              <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                <input
                  id="faire-product-url"
                  value={faireUrl}
                  onChange={(event) => setFaireUrl(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") importFaireUrl();
                  }}
                  placeholder="https://www.faire.com/product/p_..."
                  className="min-w-0 flex-1 rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm"
                />
                <button
                  onClick={importFaireUrl}
                  disabled={!faireUrl.trim() || importingUrl || uploading || working}
                  className="rounded-md border border-neutral-300 bg-white px-4 py-2 text-sm font-semibold text-neutral-900 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {importingUrl ? "Importing..." : "Import URL"}
                </button>
              </div>
            </div>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading || importingUrl || working}
              className="mt-5 w-full rounded-md bg-neutral-950 px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {uploading ? "Uploading..." : working ? "Optimizing..." : "Upload Images"}
            </button>
            <button
              onClick={() => optimizeListing(assets)}
              disabled={!assets.length || uploading || importingUrl || working}
              className="mt-3 w-full rounded-md border border-neutral-300 bg-white px-4 py-3 text-sm font-semibold text-neutral-900 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {working ? "Generating..." : "Generate Optimized Listing"}
            </button>
            <p className="mt-3 text-sm font-semibold text-neutral-800">{status}</p>
            {working && runStartedAt !== null ? (
              <p className="mt-1 text-xs text-neutral-500">
                {(() => {
                  const elapsed = now - runStartedAt;
                  const remaining = estimateMs - elapsed;
                  const elapsedSec = Math.max(0, Math.round(elapsed / 1000));
                  if (sampleCount === 0) {
                    return `Elapsed ${elapsedSec}s — learning your typical run time...`;
                  }
                  if (remaining > 0) {
                    return `ETA ${formatRemaining(remaining)} (elapsed ${elapsedSec}s, from last ${Math.min(sampleCount, 15)} runs)`;
                  }
                  return `Elapsed ${elapsedSec}s — running longer than usual, hang tight.`;
                })()}
              </p>
            ) : null}
            {error ? <p className="mt-2 text-sm font-semibold text-red-700">{error}</p> : null}
          </div>

          {assets.length ? (
            <div className="rounded-lg border border-neutral-200 bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-neutral-950">Uploaded Images</h3>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading || working}
                  className="rounded-md border border-neutral-200 px-3 py-2 text-xs font-semibold text-neutral-700 disabled:opacity-50"
                >
                  Add More
                </button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {assets.map((asset) => (
                  <div key={asset.id} className="overflow-hidden rounded-lg border border-neutral-200">
                    <img src={asset.url} alt={asset.name} className="h-36 w-full object-cover" />
                    <div className="p-2">
                      <p className="truncate text-xs font-semibold text-neutral-800">{asset.name}</p>
                      <p className="mt-1 text-[11px] text-neutral-500">
                        {asset.role.replace(/_/g, " ")}
                      </p>
                      <button
                        onClick={() => removeAsset(asset.id)}
                        className="mt-2 text-[11px] font-semibold text-red-700"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div className="rounded-lg border border-neutral-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-neutral-950">Friday Trend Keywords</h3>
                <p className="mt-1 text-xs leading-relaxed text-neutral-500">
                  Optional Faire Insider reference. Saved locally for future listings.
                </p>
              </div>
              <button
                onClick={() => trendInputRef.current?.click()}
                disabled={uploading || working}
                className="rounded-md border border-neutral-200 px-3 py-2 text-xs font-semibold text-neutral-700 disabled:opacity-50"
              >
                Upload List
              </button>
            </div>
            <textarea
              value={trendKeywords}
              onChange={(event) => updateTrendKeywords(event.target.value)}
              placeholder="Paste trending keywords here, or upload a screenshot/txt/csv file."
              className="min-h-[130px] w-full rounded-md border border-neutral-200 bg-neutral-50 p-3 text-sm leading-relaxed"
            />
          </div>
        </section>

        <section className="space-y-4">
          {!hasResult ? (
            <div className="grid min-h-[520px] place-items-center rounded-lg border border-neutral-200 bg-white p-8 text-center shadow-sm">
              <div className="max-w-md">
                <p className="text-xs font-bold uppercase text-neutral-500">Output</p>
                <h2 className="mt-3 text-xl font-semibold text-neutral-950">
                  Your optimized Faire listing will appear here.
                </h2>
                <p className="mt-3 text-sm leading-relaxed text-neutral-500">
                  No workflow steps, no manual extraction screen. Upload images and this page will produce the final listing.
                </p>
              </div>
            </div>
          ) : (
            <>
              <OutputPanel
                title={`${activeListingLabel} Faire Paste Order`}
                action={
                  <div className="flex flex-wrap gap-2">
                    <SmallButton
                      onClick={() => markCopied("copy", result.finalCopySheet)}
                      label={copied === "copy" ? "Copied" : "Copy to Faire"}
                    />
                    <SmallButton
                      onClick={() => markCopied("json", resultJson(assets, fields, result))}
                      label={copied === "json" ? "Copied" : "Export JSON"}
                    />
                  </div>
                }
              >
                {hasPlusListing ? (
                  <div className="mb-4 inline-flex rounded-full border border-neutral-200 bg-neutral-50 p-1">
                    {(["regular", "plus"] as const).map((tab) => {
                      const active = activeListing === tab;
                      return (
                        <button
                          key={tab}
                          onClick={() => setActiveListing(tab)}
                          className={`rounded-full px-4 py-2 text-sm font-semibold ${
                            active
                              ? "bg-neutral-950 text-white"
                              : "text-neutral-600 hover:bg-white hover:text-neutral-950"
                          }`}
                        >
                          {tab === "regular" ? "Regular Listing" : "Plus Listing"}
                        </button>
                      );
                    })}
                  </div>
                ) : null}
                <div className="grid gap-4">
                  <FaireStep
                    number="1"
                    title="Basic Information"
                    note={`Paste these into the ${activeListingLabel.toLowerCase()} Faire listing’s Name and Description fields first.`}
                  >
                    <CopyBlock
                      title="Name"
                      value={activeTitle}
                      copied={copied === `${activeListing}-title`}
                      onCopy={() => markCopied(`${activeListing}-title`, activeTitle)}
                      onChange={(value) =>
                        isPlusActive
                          ? updateResult("plusOptimizedTitle", value)
                          : updateResult("optimizedTitle", value)
                      }
                    />
                    <CopyBlock
                      title="Description"
                      value={activeDescription}
                      area
                      copied={copied === `${activeListing}-description`}
                      onCopy={() => markCopied(`${activeListing}-description`, activeDescription)}
                      onChange={(value) =>
                        isPlusActive
                          ? updateResult("plusOptimizedDescription", value)
                          : updateResult("optimizedDescription", value)
                      }
                    />
                  </FaireStep>

                  <FaireStep
                    number="2"
                    title="Images"
                    note={`Reorder ${activeListingLabel.toLowerCase()} listing images to match this top-to-bottom recommendation.`}
                  >
                    <CopyBlock
                      title="Image Order"
                      value={result.imageOrder.join("\n")}
                      area
                      copied={copied === "image-order"}
                      onCopy={() => markCopied("image-order", result.imageOrder.join("\n"))}
                    />
                  </FaireStep>

                  <FaireStep
                    number="3"
                    title="Product Type"
                    note="Use the closest Faire product type. Leave it alone if Faire already picked the correct category."
                  >
                    <CopyBlock
                      title="Recommended Product Type"
                      value={productType || "Needs confirmation"}
                      copied={copied === "product-type"}
                      onCopy={() => markCopied("product-type", productType || "Needs confirmation")}
                    />
                  </FaireStep>

                  <FaireStep
                    number="4"
                    title="Product Details"
                    note="Apply only accurate Faire-supported fields. Blank is better than wrong."
                  >
                    <CopyBlock
                      title="Faire Details"
                      value={productDetailsText || "No accurate product details selected."}
                      area
                      copied={copied === "details"}
                      onCopy={() => markCopied("details", productDetailsText || "No accurate product details selected.")}
                    />
                  </FaireStep>
                </div>
              </OutputPanel>

              <div className="grid gap-4 lg:grid-cols-2">
                <OutputPanel title="Scorecard">
                  <ScoreSummary result={result} />
                </OutputPanel>
                <OutputPanel title="Listing Notes">
                  <textarea
                    value={uploadNotesText || "No notes generated."}
                    readOnly
                    rows={textareaRows(uploadNotesText || "No notes generated.", true)}
                    className="w-full resize-y rounded-md border border-neutral-200 bg-neutral-50 p-4 text-sm leading-relaxed"
                  />
                </OutputPanel>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <OutputPanel title="Full Copy Sheet">
                  <textarea
                    value={result.finalCopySheet}
                    onChange={(event) => updateResult("finalCopySheet", event.target.value)}
                    className="min-h-[220px] w-full rounded-md border border-neutral-200 bg-neutral-50 p-4 font-mono text-sm leading-relaxed"
                  />
                </OutputPanel>
                <OutputPanel title="Parsed Description Sections">
                  <div className="grid gap-3">
                    {activeDescriptionSections.map((section, index) => (
                      <div key={`${section.title}-${index}`} className="rounded-md border border-neutral-200 bg-neutral-50 p-3">
                        <p className="text-xs font-bold uppercase text-neutral-500">{section.title}</p>
                        <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-neutral-800">
                          {section.body}
                        </p>
                      </div>
                    ))}
                  </div>
                </OutputPanel>
              </div>
            </>
          )}
        </section>
      </div>
    </main>
  );
}

function OutputPanel({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-neutral-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-neutral-950">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function FaireStep({
  number,
  title,
  note,
  children,
}: {
  number: string;
  title: string;
  note: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-neutral-200 bg-neutral-50 p-3">
      <div className="mb-3 flex gap-3">
        <div className="grid h-8 w-8 flex-none place-items-center rounded-full bg-neutral-950 font-mono text-xs font-bold text-white">
          {number}
        </div>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-neutral-950">{title}</h3>
          <p className="mt-1 text-xs leading-relaxed text-neutral-500">{note}</p>
        </div>
      </div>
      <div className="grid gap-3">{children}</div>
    </section>
  );
}

function SmallButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className="rounded-md border border-neutral-200 bg-white px-3 py-2 text-xs font-semibold text-neutral-700 hover:bg-neutral-100"
    >
      {label}
    </button>
  );
}

function CopyBlock({
  title,
  value,
  copied,
  onCopy,
  onChange,
  area,
}: {
  title: string;
  value: string;
  copied: boolean;
  onCopy: () => void;
  onChange?: (value: string) => void;
  area?: boolean;
}) {
  const rows = textareaRows(value, area);
  return (
    <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h3 className="text-xs font-bold uppercase text-neutral-500">{title}</h3>
        <SmallButton onClick={onCopy} label={copied ? "Copied" : "Copy"} />
      </div>
      {onChange ? (
        area ? (
          <textarea
            value={value}
            rows={rows}
            onChange={(event) => onChange(event.target.value)}
            className="w-full resize-y whitespace-pre-wrap rounded-md border border-neutral-200 bg-white p-3 text-sm leading-relaxed"
          />
        ) : (
          <textarea
            value={value}
            rows={rows}
            onChange={(event) => onChange(event.target.value)}
            className="w-full resize-y rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm font-semibold leading-relaxed"
          />
        )
      ) : (
        <textarea
          value={value}
          readOnly
          rows={rows}
          onFocus={(event) => event.currentTarget.select()}
          className="w-full resize-y whitespace-pre-wrap rounded-md border border-neutral-200 bg-white p-3 text-sm leading-relaxed text-neutral-800"
        />
      )}
    </div>
  );
}

function EditableText({
  label,
  value,
  onChange,
  area,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  area?: boolean;
}) {
  return (
    <label className="mb-4 block last:mb-0">
      <span className="mb-2 block text-xs font-semibold text-neutral-600">{label}</span>
      {area ? (
        <textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="min-h-[260px] w-full rounded-md border border-neutral-200 bg-neutral-50 p-4 text-sm leading-relaxed"
        />
      ) : (
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="w-full rounded-md border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm font-semibold"
        />
      )}
    </label>
  );
}

function ListBlock({ items }: { items: string[] }) {
  if (!items.length) return <p className="text-sm text-neutral-500">No recommendation generated.</p>;
  return (
    <ol className="space-y-2 text-sm leading-relaxed text-neutral-700">
      {items.map((item, index) => (
        <li key={`${item}-${index}`} className="rounded-md border border-neutral-200 bg-neutral-50 p-3">
          {item}
        </li>
      ))}
    </ol>
  );
}

function KeyValueList({ values }: { values: FaireSeoResult["metadataSelections"] }) {
  const entries = Object.entries(values).filter(([, value]) =>
    Array.isArray(value) ? value.length : value !== "" && value !== undefined && value !== null
  );
  if (!entries.length) return <p className="text-sm text-neutral-500">No accurate details selected.</p>;
  return (
    <div className="space-y-2">
      {entries.map(([key, value]) => (
        <div key={key} className="rounded-md border border-neutral-200 bg-neutral-50 p-3">
          <p className="text-xs font-semibold uppercase text-neutral-500">{key.replace(/_/g, " ")}</p>
          <p className="mt-1 text-sm text-neutral-800">
            {Array.isArray(value) ? value.join(", ") : String(value)}
          </p>
        </div>
      ))}
    </div>
  );
}

function ScoreSummary({ result }: { result: FaireSeoResult }) {
  const before = result.beforeScore.overallFaireOptimization;
  const after = result.afterScore.overallFaireOptimization;
  return (
    <div>
      <div className="rounded-md border border-neutral-200 bg-neutral-50 p-4">
        <p className="text-xs font-semibold uppercase text-neutral-500">Overall Faire Optimization</p>
        <p className="mt-2 font-mono text-2xl font-semibold text-neutral-950">
          {before} → {after}
        </p>
      </div>
      {result.scoreRationale.length ? (
        <ul className="mt-3 space-y-2 text-sm leading-relaxed text-neutral-700">
          {result.scoreRationale.slice(0, 4).map((item) => (
            <li key={item} className="rounded-md border border-neutral-200 bg-neutral-50 p-3">
              {item}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
