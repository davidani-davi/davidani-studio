"use client";

import { useMemo, useRef, useState } from "react";
import ImageLightbox, { ZoomButton } from "@/components/ImageLightbox";
import TopTabs from "@/components/TopTabs";
import type { UploadedImage } from "@/components/types";
import { resizeIfNeeded } from "@/lib/image-resize";
import type { ProductDesignResult } from "@/lib/fal";

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
  "Make it more dramatic",
  "Make it simpler",
  "More boutique",
  "Less similar to original",
  "More features",
  "Same category, different fit",
  "Try again with no repeated themes",
];

function conceptText(result: ProductDesignResult): string {
  return result.concepts
    .map(
      (concept, index) =>
        `${index + 1}. ${concept.productName}\nCustomer Mood: ${
          concept.customerMood
        }\nDescription: ${concept.productDescription}\nKey Features:\n${concept.keyFeatures
          .map((feature) => `- ${feature}`)
          .join("\n")}\nDesign Difference From Source: ${
          concept.designDifferenceFromSource
        }\nImage Generation Prompt: ${concept.imageGenerationPrompt}`
    )
    .join("\n\n");
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
    }
  }

  async function generateConcepts(nextRefinement = refinement) {
    if (!selectedUrl) return;
    setGenerating(true);
    setError(null);
    setCopied(null);
    try {
      const data = await fetchJson("Generate product concepts", "/api/design-studio/concepts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageUrl: selectedUrl, refinement: nextRefinement }),
      });
      setResult(data.result || null);
    } catch (err: any) {
      setError(err?.message || "Product design generation failed");
    } finally {
      setGenerating(false);
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
          <span>Concepts: {result?.concepts.length ?? 0}</span>
          <span>·</span>
          <span>Active: {uploading || generating ? 1 : 0}</span>
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
                Direction
              </h2>
            </div>
            <textarea
              value={refinement}
              onChange={(event) => setRefinement(event.target.value)}
              disabled={generating}
              rows={5}
              placeholder="Optional direction, e.g. more elevated, younger customer, less boho, more fall delivery..."
              className="w-full resize-none rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm outline-none transition placeholder:text-neutral-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 disabled:cursor-not-allowed disabled:bg-neutral-50 disabled:text-neutral-400"
            />
            <div className="mt-3 grid gap-2">
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
              <h1 className="text-sm font-semibold text-neutral-900">Product Design Generator</h1>
              <p className="text-[11px] text-neutral-500">
                Creates three new sellable concepts in the same category as the upload.
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
              {generating ? "Designing" : result ? "Ready" : "Waiting"}
            </span>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
            {!result ? (
              <div className="flex min-h-[420px] items-center justify-center rounded-xl border border-dashed border-neutral-300 bg-white px-5 text-center">
                <div className="max-w-md">
                  <p className="text-sm font-semibold text-neutral-800">
                    Upload a product image to generate new design directions.
                  </p>
                  <p className="mt-2 text-sm leading-relaxed text-neutral-500">
                    The tool keeps the product category intact, then creates distinct boutique
                    concepts with different fits, stories, construction, trims, and customer appeal.
                  </p>
                </div>
              </div>
            ) : (
              <div className="grid gap-4">
                <div className="rounded-xl border border-neutral-200 bg-white p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-widest text-neutral-500">
                        Detected Category
                      </p>
                      <p className="mt-1 text-sm font-semibold text-neutral-900">
                        {result.detectedCategory}
                      </p>
                      <p className="mt-1 text-xs text-neutral-500">{result.customerWorld}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => copyText("all", conceptText(result))}
                      className="inline-flex items-center justify-center gap-2 rounded-lg border border-neutral-200 px-3 py-2 text-xs font-semibold text-neutral-700 hover:bg-neutral-50"
                    >
                      {IconCopy}
                      {copied === "all" ? "Copied" : "Copy All"}
                    </button>
                  </div>
                </div>

                <div className="grid gap-4 xl:grid-cols-3">
                  {result.concepts.map((concept, index) => (
                    <article
                      key={`${concept.productName}-${index}`}
                      className="flex min-w-0 flex-col rounded-xl border border-neutral-200 bg-white shadow-sm"
                    >
                      <div className="border-b border-neutral-100 p-4">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">
                          Concept {index + 1}
                        </p>
                        <h2 className="mt-2 text-base font-semibold text-neutral-950">
                          {concept.productName}
                        </h2>
                        <p className="mt-1 text-sm font-medium text-brand-700">
                          {concept.customerMood}
                        </p>
                      </div>
                      <div className="grid flex-1 gap-4 p-4">
                        <p className="text-sm leading-relaxed text-neutral-700">
                          {concept.productDescription}
                        </p>
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-widest text-neutral-500">
                            Key Features
                          </p>
                          <ul className="mt-2 space-y-1 text-sm leading-relaxed text-neutral-700">
                            {concept.keyFeatures.map((feature) => (
                              <li key={feature}>- {feature}</li>
                            ))}
                          </ul>
                        </div>
                        <div className="rounded-lg bg-neutral-50 p-3">
                          <p className="text-[10px] font-semibold uppercase tracking-widest text-neutral-500">
                            Difference
                          </p>
                          <p className="mt-1 text-xs leading-relaxed text-neutral-600">
                            {concept.designDifferenceFromSource}
                          </p>
                        </div>
                        <div>
                          <div className="mb-2 flex items-center justify-between gap-2">
                            <p className="text-[10px] font-semibold uppercase tracking-widest text-neutral-500">
                              Image Prompt
                            </p>
                            <button
                              type="button"
                              onClick={() =>
                                copyText(`prompt-${index}`, concept.imageGenerationPrompt)
                              }
                              className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 px-2 py-1 text-[10px] font-semibold text-neutral-700 hover:bg-neutral-50"
                            >
                              {IconCopy}
                              {copied === `prompt-${index}` ? "Copied" : "Copy"}
                            </button>
                          </div>
                          <textarea
                            value={concept.imageGenerationPrompt}
                            readOnly
                            rows={8}
                            className="prompt-mono w-full resize-y rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs leading-relaxed text-neutral-700 outline-none"
                          />
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
                  Generating
                </>
              ) : (
                <>
                  {IconSparkle}
                  Generate Concepts
                </>
              )}
            </button>
          </div>
        </section>

        <aside className="hidden w-80 shrink-0 overflow-y-auto border-l border-neutral-200 bg-neutral-50 p-5 xl:block">
          <div className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-neutral-500">
            Source
          </div>
          <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
            {selectedUpload ? (
              <button
                type="button"
                onClick={() => setPreviewSrc(selectedUpload.url)}
                className="block w-full"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={selectedUpload.url}
                  alt={selectedUpload.name}
                  className="aspect-[4/5] w-full object-cover"
                />
              </button>
            ) : (
              <div className="flex aspect-[4/5] items-center justify-center text-xs text-neutral-400">
                No product selected
              </div>
            )}
          </div>

          {result?.qualityChecklist?.length ? (
            <div className="mt-4 rounded-lg border border-neutral-200 bg-white p-4">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-neutral-500">
                Quality Check
              </p>
              <ul className="mt-2 space-y-1 text-xs leading-relaxed text-neutral-600">
                {result.qualityChecklist.map((item) => (
                  <li key={item}>- {item}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </aside>
      </div>

      {previewSrc && (
        <ImageLightbox
          src={previewSrc}
          alt="Uploaded product preview"
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
