"use client";

import { useMemo, useRef, useState } from "react";
import TopTabs from "@/components/TopTabs";
import ImageLightbox, { ZoomButton } from "@/components/ImageLightbox";
import type { UploadedImage } from "@/components/types";
import { resizeIfNeeded } from "@/lib/image-resize";

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
  if (!res.ok) {
    throw new Error(`${label}: ${data?.error || `HTTP ${res.status}`}`);
  }
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

export default function PromptStudioClient() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploads, setUploads] = useState<UploadedImage[]>([]);
  const [selectedUrl, setSelectedUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [prompts, setPrompts] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [draggingUpload, setDraggingUpload] = useState(false);
  const [requestedColors, setRequestedColors] = useState("");

  const selectedUpload = useMemo(
    () => uploads.find((u) => u.url === selectedUrl) ?? null,
    [uploads, selectedUrl]
  );
  const promptCount = prompts.trim() ? prompts.trim().split(/\r?\n/).length : 0;

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
      setPrompts("");
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
    if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
  }

  function removeUpload(url: string) {
    setUploads((list) => list.filter((u) => u.url !== url));
    if (selectedUrl === url) {
      const remaining = uploads.filter((u) => u.url !== url);
      setSelectedUrl(remaining[0]?.url ?? null);
      setPrompts("");
    }
  }

  async function generatePrompts() {
    if (!selectedUrl) return;
    setGenerating(true);
    setCopied(false);
    setError(null);
    try {
      const data = await fetchJson("Generate recoloring prompts", "/api/prompt-studio/recoloring", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageUrl: selectedUrl, colors: requestedColors }),
      });
      setPrompts(data.prompts || "");
    } catch (err: any) {
      setError(err?.message || "Prompt generation failed");
    } finally {
      setGenerating(false);
    }
  }

  async function copyPrompts() {
    if (!prompts.trim()) return;
    await navigator.clipboard.writeText(prompts);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
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
          <TopTabs active="prompt" />
        </div>
        <div className="flex items-center gap-3 text-xs text-neutral-500 lg:justify-end">
          <span>Prompts: {promptCount}</span>
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
                  Garment image
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
                  Upload garment
                </span>
              )}
            </button>
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.length) addFiles(e.target.files);
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
                          setPrompts("");
                        }}
                        className="block h-full w-full"
                      >
                        <img
                          src={u.url}
                          alt={u.name}
                          className="h-full w-full object-cover"
                        />
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
                        ×
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
                Prompt Studio
              </h2>
            </div>
            <div className="flex overflow-hidden rounded-lg border border-neutral-200 bg-neutral-50">
              <button
                type="button"
                className="flex-1 bg-neutral-900 px-3 py-2 text-xs font-semibold text-white"
              >
                Recoloring
              </button>
            </div>

            <label className="mt-5 block text-[10px] font-semibold uppercase tracking-widest text-neutral-500">
              Requested colors
            </label>
            <textarea
              value={requestedColors}
              onChange={(e) => setRequestedColors(e.target.value)}
              disabled={generating}
              rows={3}
              placeholder="maroon, black, yellow"
              className="mt-2 w-full resize-none rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm outline-none transition placeholder:text-neutral-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 disabled:cursor-not-allowed disabled:bg-neutral-50 disabled:text-neutral-400"
            />
            <p className="mt-2 text-[11px] leading-relaxed text-neutral-500">
              Each listed color gets one prompt. Any remaining prompts are chosen by AI.
            </p>
          </section>
        </aside>

        <section className="flex min-w-0 flex-1 flex-col border-b border-neutral-200 bg-white lg:border-b-0 lg:border-r">
          <div className="flex items-center justify-between border-b border-neutral-200 px-6 py-4">
            <div>
              <h1 className="text-sm font-semibold text-neutral-900">Recoloring</h1>
              <p className="text-[11px] text-neutral-500">
                Generates 10 newline-separated recoloring prompts for ChatGPT Image 2.0.
              </p>
            </div>
            <span
              className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider ${
                generating
                  ? "bg-amber-50 text-amber-700"
                  : prompts
                  ? "bg-emerald-50 text-emerald-700"
                  : "bg-neutral-100 text-neutral-500"
              }`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  generating
                    ? "bg-amber-400 animate-pulse"
                    : prompts
                    ? "bg-emerald-500"
                    : "bg-neutral-300"
                }`}
              />
              {generating ? "Analyzing" : prompts ? "Ready" : "Waiting"}
            </span>
          </div>

          <div className="relative flex min-h-0 flex-1 flex-col">
            <textarea
              value={prompts}
              onChange={(e) => setPrompts(e.target.value)}
              placeholder="Upload a garment image, then generate recoloring prompts. The output appears here as plain text: 10 prompts, one per line."
              className="prompt-mono min-h-0 flex-1 resize-none px-6 py-5 text-[13px] leading-relaxed outline-none placeholder:text-neutral-400"
            />
            <div className="pointer-events-none absolute bottom-3 right-6 rounded-full bg-white/80 px-2 py-0.5 text-[10px] font-mono text-neutral-400 backdrop-blur">
              {promptCount} lines
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-neutral-200 bg-neutral-50 px-6 py-4">
            <div className="min-w-0 text-xs text-neutral-500">
              {selectedUpload ? (
                <span className="truncate">Selected: {selectedUpload.name}</span>
              ) : (
                <span>Select one uploaded garment image</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={copyPrompts}
                disabled={!prompts.trim()}
                className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed ${
                  prompts.trim()
                    ? "border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50"
                    : "border-neutral-200 bg-neutral-100 text-neutral-400"
                }`}
              >
                {IconCopy}
                {copied ? "Copied" : "Copy"}
              </button>
              <button
                type="button"
                onClick={generatePrompts}
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
                    Generate Prompts
                  </>
                )}
              </button>
            </div>
          </div>
        </section>

        <aside className="hidden w-80 shrink-0 overflow-y-auto bg-neutral-50 p-5 xl:block">
          <div className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-neutral-500">
            Preview
          </div>
          <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
            {selectedUpload ? (
              <button
                type="button"
                onClick={() => setPreviewSrc(selectedUpload.url)}
                className="block w-full"
              >
                <img
                  src={selectedUpload.url}
                  alt={selectedUpload.name}
                  className="aspect-[4/5] w-full object-cover"
                />
              </button>
            ) : (
              <div className="flex aspect-[4/5] items-center justify-center text-xs text-neutral-400">
                No garment selected
              </div>
            )}
          </div>
        </aside>
      </div>

      {previewSrc && (
        <ImageLightbox src={previewSrc} alt="Uploaded garment preview" onClose={() => setPreviewSrc(null)} />
      )}

      {error && (
        <div className="fixed bottom-6 right-6 max-w-sm whitespace-pre-line rounded-lg bg-red-600 px-4 py-3 text-sm text-white shadow-lg">
          <div className="flex items-start gap-2">
            <span className="font-semibold">Error:</span>
            <span className="flex-1">{error}</span>
            <button onClick={() => setError(null)} className="opacity-70 hover:opacity-100">
              ×
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
