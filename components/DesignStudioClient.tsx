"use client";

import { useMemo, useRef, useState } from "react";
import ImageLightbox, { ZoomButton } from "@/components/ImageLightbox";
import TopTabs from "@/components/TopTabs";
import type { UploadedImage } from "@/components/types";
import { resizeIfNeeded } from "@/lib/image-resize";
import type { ProductDesignConcept, ProductDesignResult } from "@/lib/fal";

async function fetchJson(label: string, input: string, init?: RequestInit): Promise<any> {
  const res = await fetch(input, init);
  const raw = await res.text();
  let data: any;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    const preview = raw.replace(/\s+/g, " ").slice(0, 200);
    throw new Error(
      `${label}: server returned non-JSON (${res.status}). First 200 chars: "${preview}"`
    );
  }
  if (!res.ok) throw new Error(`${label}: ${data?.error || `HTTP ${res.status}`}`);
  return data;
}

const Spinner = ({ className = "h-4 w-4" }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={`${className} animate-spin`}>
    <circle
      cx="12"
      cy="12"
      r="10"
      stroke="currentColor"
      strokeOpacity="0.25"
      strokeWidth="3"
      fill="none"
    />
    <path
      d="M12 2a10 10 0 0110 10"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      fill="none"
    />
  </svg>
);

const IconSparkle = (
  <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
    <path d="M10 2a.75.75 0 01.7.48l1.22 3.15a2 2 0 001.15 1.15l3.15 1.22a.75.75 0 010 1.4l-3.15 1.22a2 2 0 00-1.15 1.15l-1.22 3.15a.75.75 0 01-1.4 0l-1.22-3.15a2 2 0 00-1.15-1.15L3.78 9.4a.75.75 0 010-1.4l3.15-1.22a2 2 0 001.15-1.15L9.3 2.48A.75.75 0 0110 2zm6 10a.5.5 0 01.47.33l.53 1.42a1 1 0 00.58.58l1.42.53a.5.5 0 010 .94l-1.42.53a1 1 0 00-.58.58l-.53 1.42a.5.5 0 01-.94 0l-.53-1.42a1 1 0 00-.58-.58l-1.42-.53a.5.5 0 010-.94l1.42-.53a1 1 0 00.58-.58l.53-1.42A.5.5 0 0116 12z" />
  </svg>
);

const IconUpload = (
  <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
    <path d="M10 2a1 1 0 01.7.29l3 3a1 1 0 11-1.4 1.42L11 5.41V13a1 1 0 11-2 0V5.41L7.7 6.71A1 1 0 016.3 5.29l3-3A1 1 0 0110 2z" />
    <path d="M4 12a1 1 0 011 1v2h10v-2a1 1 0 112 0v2a2 2 0 01-2 2H5a2 2 0 01-2-2v-2a1 1 0 011-1z" />
  </svg>
);

const IconCopy = (
  <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
    <path d="M7 2a2 2 0 00-2 2v1H4a2 2 0 00-2 2v9a2 2 0 002 2h9a2 2 0 002-2v-1h1a2 2 0 002-2V4a2 2 0 00-2-2H7zm0 3V4h9v9h-1V7a2 2 0 00-2-2H7z" />
  </svg>
);

const refinementOptions = [
  "More bestseller-driven",
  "More visually bold",
  "More wearable",
  "Less similar to original",
  "More boutique",
  "More FW26",
];

function downloadImage(url: string, filename: string) {
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.target = "_blank";
  anchor.rel = "noopener noreferrer";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

function safeFileName(value: string) {
  return `${value.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "") || "design"}.png`;
}

export default function DesignStudioClient() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploads, setUploads] = useState<UploadedImage[]>([]);
  const [selectedUrl, setSelectedUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<ProductDesignResult | null>(null);
  const [refinement, setRefinement] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);
  const [draggingUpload, setDraggingUpload] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [techpackFor, setTechpackFor] = useState<string | null>(null);
  const [techpack, setTechpack] = useState("");

  const selectedUpload = useMemo(
    () => uploads.find((u) => u.url === selectedUrl) ?? null,
    [uploads, selectedUrl]
  );

  async function addFiles(files: FileList) {
    setUploading(true);
    setError(null);
    try {
      const resized = await Promise.all(Array.from(files).map((f) => resizeIfNeeded(f)));
      const form = new FormData();
      resized.forEach((f) => form.append("files", f));
      const data = await fetchJson("Upload", "/api/upload", { method: "POST", body: form });
      const added: UploadedImage[] = data.uploads ?? [];
      if (!added.length) throw new Error("Upload succeeded but no image URL returned");
      setUploads((list) => [...list, ...added]);
      setSelectedUrl(added[0].url);
      setResult(null);
      setTechpack("");
    } catch (err: any) {
      setError(err?.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  function hasImageFiles(e: React.DragEvent): boolean {
    return Array.from(e.dataTransfer.items).some((item) => item.type.startsWith("image/"));
  }

  function handleUploadDrop(e: React.DragEvent) {
    e.preventDefault();
    setDraggingUpload(false);
    if (e.dataTransfer.files.length) void addFiles(e.dataTransfer.files);
  }

  function removeUpload(url: string) {
    setUploads((list) => list.filter((u) => u.url !== url));
    if (selectedUrl === url) {
      const remaining = uploads.filter((u) => u.url !== url);
      setSelectedUrl(remaining[0]?.url ?? null);
      setResult(null);
      setTechpack("");
    }
  }

  async function generateConcepts(nextRefinement = refinement) {
    if (!selectedUrl) return;
    setGenerating(true);
    setError(null);
    setCopied(null);
    setTechpack("");
    try {
      const data = await fetchJson("Generate product visuals", "/api/design-studio/concepts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageUrl: selectedUrl, refinement: nextRefinement }),
      });
      setResult(data.result || null);
    } catch (err: any) {
      setError(err?.message || "Product visual generation failed");
    } finally {
      setGenerating(false);
    }
  }

  async function createTechpack(concept: ProductDesignConcept) {
    if (!concept.visualUrl) return;
    setTechpackFor(concept.productName);
    setTechpack("");
    setError(null);
    try {
      const data = await fetchJson("Create techpack", "/api/design-studio/techpack", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ concept, imageUrl: concept.visualUrl }),
      });
      setTechpack(data.techpack || "");
    } catch (err: any) {
      setError(err?.message || "Techpack generation failed");
      setTechpackFor(null);
    }
  }

  async function copyText(label: string, text: string) {
    await navigator.clipboard.writeText(text);
    setCopied(label);
    window.setTimeout(() => setCopied(null), 1400);
  }

  return (
    <main className="flex min-h-screen flex-col bg-neutral-50 lg:h-screen">
      <header className="flex flex-col gap-3 border-b border-neutral-200 bg-white px-4 py-3 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-neutral-900 text-xs font-bold text-white">
            D
          </div>
          <span className="text-sm font-semibold">Davi &amp; Dani Photo Studio</span>
          <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-neutral-600">
            V1.3
          </span>
          <TopTabs active="design" />
        </div>
        <div className="flex items-center gap-3 text-xs text-neutral-500 lg:justify-end">
          <span>Visuals: {result?.concepts.length ?? 0}</span>
          <span>·</span>
          <span>Active: {uploading || generating || techpackFor ? 1 : 0}</span>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <aside className="flex w-full shrink-0 flex-col overflow-y-auto border-b border-neutral-200 bg-white lg:w-80 lg:border-b-0 lg:border-r">
          <section
            className={`border-b border-neutral-100 p-5 transition ${
              draggingUpload ? "bg-brand-50/70" : ""
            }`}
            onDragEnter={(e) => {
              if (!hasImageFiles(e)) return;
              e.preventDefault();
              setDraggingUpload(true);
            }}
            onDragOver={(e) => {
              if (!hasImageFiles(e)) return;
              e.preventDefault();
            }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                setDraggingUpload(false);
              }
            }}
            onDrop={handleUploadDrop}
          >
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-neutral-400">{IconUpload}</span>
                <h2 className="text-[11px] font-semibold uppercase tracking-widest text-neutral-700">
                  Product image
                </h2>
              </div>
              <span className="text-[10px] text-neutral-500">
                {uploads.length ? `${uploads.length} uploaded` : "Upload to start"}
              </span>
            </div>

            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={uploading || generating}
              className={`flex aspect-[4/3] w-full items-center justify-center rounded-lg border border-dashed text-sm font-medium transition hover:border-brand-400 hover:bg-brand-50 hover:text-brand-700 disabled:cursor-not-allowed disabled:opacity-60 ${
                draggingUpload
                  ? "border-brand-500 bg-brand-50 text-brand-700"
                  : "border-neutral-300 bg-neutral-50 text-neutral-500"
              }`}
            >
              {uploading ? (
                <span className="inline-flex items-center gap-2">
                  <Spinner />
                  Uploading
                </span>
              ) : (
                <span className="inline-flex items-center gap-2">
                  {IconUpload}
                  Upload product
                </span>
              )}
            </button>
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.length) void addFiles(e.target.files);
                e.currentTarget.value = "";
              }}
            />

            {uploads.length > 0 && (
              <div className="mt-4 grid grid-cols-3 gap-2">
                {uploads.map((u) => {
                  const selected = u.url === selectedUrl;
                  return (
                    <div
                      key={u.url}
                      className={`group relative aspect-square overflow-hidden rounded-lg border ${
                        selected
                          ? "border-neutral-900 ring-2 ring-neutral-900/10"
                          : "border-neutral-200"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedUrl(u.url);
                          setResult(null);
                          setTechpack("");
                        }}
                        className="block h-full w-full"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={u.url} alt={u.name} className="h-full w-full object-cover" />
                      </button>
                      <ZoomButton
                        className="absolute bottom-1 right-1"
                        onClick={() => setPreviewSrc(u.url)}
                      />
                      <button
                        type="button"
                        onClick={() => removeUpload(u.url)}
                        className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-white/90 text-xs text-neutral-500 opacity-0 shadow-sm transition hover:text-red-600 group-hover:opacity-100"
                      >
                        x
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <section className="p-5">
            <div className="mb-3 flex items-center gap-2">
              <span className="text-neutral-400">{IconSparkle}</span>
              <h2 className="text-[11px] font-semibold uppercase tracking-widest text-neutral-700">
                Trend direction
              </h2>
            </div>
            <textarea
              value={refinement}
              onChange={(event) => setRefinement(event.target.value)}
              disabled={generating}
              rows={4}
              placeholder="Optional: FW26, younger, best-seller friendly, more novelty denim..."
              className="w-full resize-none rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm outline-none transition placeholder:text-neutral-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 disabled:cursor-not-allowed disabled:bg-neutral-50 disabled:text-neutral-400"
            />
            <div className="mt-3 grid grid-cols-2 gap-2">
              {refinementOptions.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => {
                    setRefinement(option);
                    void generateConcepts(option);
                  }}
                  disabled={!selectedUrl || uploading || generating}
                  className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-left text-xs font-semibold text-neutral-700 transition hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {option}
                </button>
              ))}
            </div>
          </section>
        </aside>

        <section className="flex min-w-0 flex-1 flex-col bg-neutral-50">
          <div className="flex items-center justify-between border-b border-neutral-200 bg-white px-6 py-4">
            <div>
              <h1 className="text-sm font-semibold text-neutral-900">Trend Design Studio</h1>
              <p className="text-[11px] text-neutral-500">
                Live trend research in, three product visuals out.
              </p>
            </div>
            <span
              className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider ${
                generating
                  ? "bg-amber-50 text-amber-700"
                  : result
                  ? "bg-emerald-50 text-emerald-700"
                  : "bg-neutral-100 text-neutral-500"
              }`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  generating
                    ? "bg-amber-400 animate-pulse"
                    : result
                    ? "bg-emerald-500"
                    : "bg-neutral-300"
                }`}
              />
              {generating ? "Researching + rendering" : result ? "Ready" : "Waiting"}
            </span>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
            {!result ? (
              <div className="flex min-h-[420px] items-center justify-center rounded-xl border border-dashed border-neutral-300 bg-white px-5 text-center">
                <div className="max-w-md">
                  <p className="text-sm font-semibold text-neutral-800">
                    Upload a product, then generate trend-backed visuals.
                  </p>
                  <p className="mt-2 text-sm leading-relaxed text-neutral-500">
                    The AI researches current public brand/bestseller signals, keeps the uploaded
                    category intact, and renders three new product ideas.
                  </p>
                </div>
              </div>
            ) : (
              <div className="grid gap-4">
                <div className="flex flex-col gap-2 rounded-xl border border-neutral-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-neutral-500">
                      {result.detectedCategory}
                    </p>
                    <p className="mt-1 text-sm font-semibold text-neutral-900">
                      {result.customerWorld}
                    </p>
                  </div>
                  {result.trendSignals?.length ? (
                    <div className="flex max-w-2xl flex-wrap gap-1.5">
                      {result.trendSignals.slice(0, 8).map((signal) => (
                        <span
                          key={signal}
                          className="rounded-full bg-neutral-100 px-2 py-1 text-[10px] font-semibold text-neutral-600"
                        >
                          {signal}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>

                <div className="grid gap-4 xl:grid-cols-3">
                  {result.concepts.map((concept, index) => (
                    <article
                      key={`${concept.productName}-${index}`}
                      className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm"
                    >
                      <button
                        type="button"
                        onClick={() => concept.visualUrl && setPreviewSrc(concept.visualUrl)}
                        className="block aspect-[4/5] w-full bg-neutral-100"
                      >
                        {concept.visualUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={concept.visualUrl}
                            alt={concept.productName}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full items-center justify-center text-xs text-neutral-400">
                            Rendering failed
                          </div>
                        )}
                      </button>
                      <div className="p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">
                              Option {index + 1}
                            </p>
                            <h2 className="mt-1 text-base font-semibold text-neutral-950">
                              {concept.productName}
                            </h2>
                            <p className="mt-1 text-xs font-medium text-brand-700">
                              {concept.customerMood}
                            </p>
                          </div>
                          {concept.visualUrl && (
                            <button
                              type="button"
                              onClick={() =>
                                downloadImage(concept.visualUrl!, safeFileName(concept.productName))
                              }
                              className="rounded-lg border border-neutral-200 px-2 py-1.5 text-[10px] font-semibold text-neutral-700 hover:bg-neutral-50"
                            >
                              Download
                            </button>
                          )}
                        </div>

                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {concept.keyFeatures.slice(0, 4).map((feature) => (
                            <span
                              key={feature}
                              className="rounded-full bg-neutral-100 px-2 py-1 text-[10px] font-semibold text-neutral-600"
                            >
                              {feature}
                            </span>
                          ))}
                        </div>

                        <div className="mt-4 grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => void createTechpack(concept)}
                            disabled={!concept.visualUrl || !!techpackFor}
                            className="inline-flex items-center justify-center gap-2 rounded-lg bg-neutral-900 px-3 py-2 text-xs font-semibold text-white hover:bg-neutral-800 disabled:opacity-50"
                          >
                            {techpackFor === concept.productName ? <Spinner /> : null}
                            Techpack
                          </button>
                          <button
                            type="button"
                            onClick={() => copyText(`prompt-${index}`, concept.imageGenerationPrompt)}
                            className="inline-flex items-center justify-center gap-2 rounded-lg border border-neutral-200 px-3 py-2 text-xs font-semibold text-neutral-700 hover:bg-neutral-50"
                          >
                            {IconCopy}
                            {copied === `prompt-${index}` ? "Copied" : "Prompt"}
                          </button>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-neutral-200 bg-white px-6 py-4">
            <div className="min-w-0 text-xs text-neutral-500">
              {selectedUpload ? (
                <span className="truncate">Selected: {selectedUpload.name}</span>
              ) : (
                <span>Select one uploaded product image</span>
              )}
            </div>
            <button
              type="button"
              onClick={() => void generateConcepts()}
              disabled={!selectedUrl || uploading || generating}
              className={`inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold shadow-sm transition disabled:cursor-not-allowed ${
                !selectedUrl || uploading || generating
                  ? "bg-neutral-300 text-neutral-500"
                  : "bg-gradient-to-b from-neutral-800 to-neutral-950 text-white hover:from-neutral-700 hover:to-neutral-900 hover:shadow-md active:scale-[0.98]"
              }`}
            >
              {generating ? (
                <>
                  <Spinner />
                  Research + Render
                </>
              ) : (
                <>
                  {IconSparkle}
                  Generate Visuals
                </>
              )}
            </button>
          </div>
        </section>
      </div>

      {techpackFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4">
          <div className="max-h-[90vh] w-full max-w-4xl overflow-hidden rounded-xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-neutral-900">Techpack</p>
                <p className="text-xs text-neutral-500">{techpackFor}</p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => techpack && copyText("techpack", techpack)}
                  disabled={!techpack}
                  className="rounded-lg border border-neutral-200 px-3 py-2 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
                >
                  {copied === "techpack" ? "Copied" : "Copy"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setTechpackFor(null);
                    setTechpack("");
                  }}
                  className="rounded-lg bg-neutral-900 px-3 py-2 text-xs font-semibold text-white hover:bg-neutral-800"
                >
                  Close
                </button>
              </div>
            </div>
            <div className="max-h-[calc(90vh-62px)] overflow-y-auto p-4">
              {techpack ? (
                <pre className="whitespace-pre-wrap rounded-lg bg-neutral-50 p-4 text-sm leading-relaxed text-neutral-800">
                  {techpack}
                </pre>
              ) : (
                <div className="flex h-60 items-center justify-center text-sm text-neutral-500">
                  <span className="inline-flex items-center gap-2">
                    <Spinner />
                    Creating manufacturer notes...
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {previewSrc && (
        <ImageLightbox
          src={previewSrc}
          alt="Design studio preview"
          onClose={() => setPreviewSrc(null)}
        />
      )}

      {error && (
        <div className="fixed bottom-6 right-6 max-w-sm whitespace-pre-line rounded-lg bg-red-600 px-4 py-3 text-sm text-white shadow-lg">
          <div className="flex items-start gap-2">
            <span className="font-semibold">Error:</span>
            <span className="flex-1">{error}</span>
            <button onClick={() => setError(null)} className="opacity-70 hover:opacity-100">
              x
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
