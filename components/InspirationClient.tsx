"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import ImageLightbox from "@/components/ImageLightbox";
import TopTabs from "@/components/TopTabs";
import { resizeIfNeeded } from "@/lib/image-resize";
import type { InspirationSource } from "@/lib/inspiration-library";

const DESIGN_STUDIO_INSPIRATION_KEY = "davidani:design-studio:inspiration-stem";

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

const Spinner = ({ className = "h-4 w-4" }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={`${className} animate-spin`}>
    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" fill="none" />
    <path d="M12 2a10 10 0 0110 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" fill="none" />
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

const stemOptions = [
  "Make this more FW26",
  "Change the color story",
  "Make the silhouette more balloon shaped",
  "Make it more boutique and sellable",
  "Make it younger and Gen Z friendly",
  "Make it softer and more romantic",
  "Make it more casual everyday",
  "Add a novelty detail without making it costume-like",
];

function sourceImage(source: InspirationSource): string {
  if (source.imageUrl) return source.imageUrl;
  return /\.(png|jpe?g|webp|gif)(\?.*)?$/i.test(source.url) ? source.url : "";
}

function safeFileName(value: string) {
  return `${value.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "") || "inspiration"}.png`;
}

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

function uniqueTags(sources: InspirationSource[]): string[] {
  const counts = new Map<string, number>();
  for (const source of sources) {
    const tags = source.tags?.length ? source.tags : [source.category].filter(Boolean);
    for (const tag of tags) {
      const clean = tag.trim().toLowerCase();
      if (clean) counts.set(clean, (counts.get(clean) || 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 24)
    .map(([tag]) => tag);
}

function buildStemRefinement(source: InspirationSource, instruction: string) {
  const tags = source.tags?.length ? source.tags.join(", ") : source.category;
  return [
    `Use this saved inspiration as a creative launchpad, not as something to copy: ${source.title}.`,
    source.category ? `Inspiration category: ${source.category}.` : "",
    tags ? `Inspiration tags: ${tags}.` : "",
    source.note ? `Why it was saved: ${source.note}.` : "",
    instruction
      ? `Designer direction: ${instruction}.`
      : "Designer direction: create a fresh, commercially sellable evolution from this inspiration.",
    "Do not recreate the original saved image exactly. Extract the useful design DNA and make new boutique-ready product ideas.",
  ]
    .filter(Boolean)
    .join(" ");
}

export default function InspirationClient() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [sources, setSources] = useState<InspirationSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [query, setQuery] = useState("");
  const [activeTag, setActiveTag] = useState("All");
  const [density, setDensity] = useState<"large" | "dense">("large");
  const [preview, setPreview] = useState<string | null>(null);
  const [stemSource, setStemSource] = useState<InspirationSource | null>(null);
  const [stemInstruction, setStemInstruction] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState({
    title: "",
    url: "",
    imageUrl: "",
    category: "",
    tags: "",
    note: "",
  });

  const tags = useMemo(() => uniqueTags(sources), [sources]);
  const filteredSources = useMemo(() => {
    const q = query.trim().toLowerCase();
    const tag = activeTag.toLowerCase();
    return sources.filter((source) => {
      const sourceTags = source.tags || [];
      const haystack = `${source.title} ${source.category} ${source.note} ${sourceTags.join(" ")} ${source.url}`.toLowerCase();
      const matchesQuery = !q || haystack.includes(q);
      const matchesTag =
        activeTag === "All" ||
        source.category.toLowerCase() === tag ||
        sourceTags.some((item) => item.toLowerCase() === tag);
      return matchesQuery && matchesTag;
    });
  }, [activeTag, query, sources]);

  async function loadSources() {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchJson("Load inspirations", "/api/design-studio/inspirations");
      setSources(data.sources || []);
    } catch (err: any) {
      setError(err?.message || "Failed to load inspirations");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadSources();
  }, []);

  function hasImageFiles(e: React.DragEvent) {
    return Array.from(e.dataTransfer.items).some((item) => item.type.startsWith("image/"));
  }

  async function addFiles(files: FileList) {
    setAnalyzing(true);
    setError(null);
    try {
      const first = files[0];
      if (!first) return;
      const resized = await resizeIfNeeded(first);
      const form = new FormData();
      form.append("files", resized);
      const uploaded = await fetchJson("Upload inspiration", "/api/upload", {
        method: "POST",
        body: form,
      });
      const imageUrl = uploaded.uploads?.[0]?.url;
      if (!imageUrl) throw new Error("Upload succeeded but no image URL returned");
      setDraft((item) => ({ ...item, url: imageUrl, imageUrl }));
      await analyzeDraft({ url: imageUrl, imageUrl });
    } catch (err: any) {
      setError(err?.message || "Inspiration upload failed");
    } finally {
      setAnalyzing(false);
      setDragging(false);
    }
  }

  async function analyzeDraft(input: Partial<typeof draft> = draft) {
    const url = (input.url || "").trim();
    const imageUrl = (input.imageUrl || "").trim();
    if (!url && !imageUrl) return null;
    setAnalyzing(true);
    setError(null);
    try {
      const data = await fetchJson("Analyze inspiration", "/api/design-studio/inspirations/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, imageUrl }),
      });
      setDraft((item) => ({
        ...item,
        url: item.url || url || data.imageUrl,
        imageUrl: data.imageUrl || imageUrl,
        title: item.title || data.title || "",
        category: data.category || item.category,
        tags: Array.isArray(data.tags) ? data.tags.join(", ") : item.tags,
        note: item.note || data.note || "",
      }));
      return data;
    } catch (err: any) {
      setError(err?.message || "Failed to analyze inspiration");
      return null;
    } finally {
      setAnalyzing(false);
    }
  }

  async function saveDraft() {
    setSaving(true);
    setError(null);
    try {
      let item = draft;
      if (!item.tags.trim() && (item.url.trim() || item.imageUrl.trim())) {
        const analyzed = await analyzeDraft(item);
        if (analyzed) {
          item = {
            ...item,
            url: item.url || analyzed.imageUrl || "",
            imageUrl: analyzed.imageUrl || item.imageUrl,
            title: item.title || analyzed.title || "",
            category: analyzed.category || item.category,
            tags: Array.isArray(analyzed.tags) ? analyzed.tags.join(", ") : item.tags,
            note: item.note || analyzed.note || "",
          };
        }
      }
      const data = await fetchJson("Save inspiration", "/api/design-studio/inspirations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...item,
          tags: item.tags.split(",").map((tag) => tag.trim()).filter(Boolean),
        }),
      });
      setSources((items) => [data.source, ...items.filter((source) => source.id !== data.source.id)]);
      setDraft({ title: "", url: "", imageUrl: "", category: "", tags: "", note: "" });
    } catch (err: any) {
      setError(err?.message || "Failed to save inspiration");
    } finally {
      setSaving(false);
    }
  }

  async function deleteSource(id: string) {
    setError(null);
    try {
      await fetchJson(
        "Delete inspiration",
        `/api/design-studio/inspirations?id=${encodeURIComponent(id)}`,
        { method: "DELETE" }
      );
      setSources((items) => items.filter((source) => source.id !== id));
    } catch (err: any) {
      setError(err?.message || "Failed to delete inspiration");
    }
  }

  function sendToDesignStudio(useImage: boolean) {
    if (!stemSource) return;
    const imageUrl = sourceImage(stemSource);
    const payload = {
      refinement: buildStemRefinement(stemSource, stemInstruction.trim()),
      imageUrl: useImage ? imageUrl : "",
      title: stemSource.title,
    };
    localStorage.setItem(DESIGN_STUDIO_INSPIRATION_KEY, JSON.stringify(payload));
    window.location.href = "/design-studio";
  }

  return (
    <main className="flex min-h-screen flex-col bg-neutral-50">
      <header className="flex flex-col gap-3 border-b border-neutral-200 bg-white px-4 py-3 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-neutral-900 text-xs font-bold text-white">
            D
          </div>
          <span className="text-sm font-semibold">Davi &amp; Dani Photo Studio</span>
          <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-neutral-600">
            V1.3
          </span>
          <TopTabs active="inspiration" />
        </div>
        <div className="flex items-center gap-3 text-xs text-neutral-500 lg:justify-end">
          <span>{sources.length} saved</span>
          <span>·</span>
          <span>Active: {saving || analyzing ? 1 : 0}</span>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 lg:grid-cols-[360px_1fr]">
        <aside className="border-b border-neutral-200 bg-white p-5 lg:border-b-0 lg:border-r">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-neutral-500">
              Inspiration Library
            </p>
            <h1 className="mt-1 font-serif text-4xl leading-none text-neutral-950">
              Collect. Tag. Stem.
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-neutral-500">
              Save visual references here, let AI tag them, then send any idea into Design Studio.
            </p>
          </div>

          <div className="mt-5 grid gap-3">
            <div
              className={`rounded-xl border border-dashed p-5 text-center transition ${
                dragging ? "border-brand-500 bg-brand-50 text-brand-700" : "border-neutral-200 bg-neutral-50 text-neutral-500"
              }`}
              onDragEnter={(e) => {
                if (!hasImageFiles(e)) return;
                e.preventDefault();
                setDragging(true);
              }}
              onDragOver={(e) => {
                if (!hasImageFiles(e)) return;
                e.preventDefault();
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false);
              }}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                if (e.dataTransfer.files.length) void addFiles(e.dataTransfer.files);
              }}
            >
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                disabled={analyzing || saving}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-neutral-800 shadow-sm ring-1 ring-neutral-200 hover:bg-neutral-50 disabled:opacity-50"
              >
                {analyzing ? <Spinner /> : IconUpload}
                Drop or upload image
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
              <p className="mt-3 text-xs leading-relaxed">
                AI tags garment type, mood, trend, season, and design signals.
              </p>
            </div>

            <input
              value={draft.url}
              onChange={(e) => setDraft((item) => ({ ...item, url: e.target.value }))}
              placeholder="Paste product page or image URL"
              className="rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-brand-500"
            />
            <div className="grid grid-cols-2 gap-2">
              <input
                value={draft.title}
                onChange={(e) => setDraft((item) => ({ ...item, title: e.target.value }))}
                placeholder="Title"
                className="rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-brand-500"
              />
              <input
                value={draft.tags}
                onChange={(e) => setDraft((item) => ({ ...item, tags: e.target.value }))}
                placeholder="AI tags"
                className="rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-brand-500"
              />
            </div>
            {draft.imageUrl ? (
              <button
                type="button"
                onClick={() => setPreview(draft.imageUrl)}
                className="group relative aspect-[4/3] overflow-hidden rounded-xl bg-neutral-100"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={draft.imageUrl} alt={draft.title || "Inspiration preview"} className="h-full w-full object-cover" />
              </button>
            ) : null}
            <textarea
              value={draft.note}
              onChange={(e) => setDraft((item) => ({ ...item, note: e.target.value }))}
              rows={3}
              placeholder="AI note or your note: why save this?"
              className="resize-none rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-brand-500"
            />
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => void analyzeDraft()}
                disabled={analyzing || (!draft.url.trim() && !draft.imageUrl.trim())}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-neutral-200 px-3 py-2 text-sm font-semibold text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
              >
                {analyzing ? <Spinner /> : IconSparkle}
                AI Tag
              </button>
              <button
                type="button"
                onClick={() => void saveDraft()}
                disabled={saving || analyzing || !draft.url.trim()}
                className="rounded-lg bg-neutral-900 px-3 py-2 text-sm font-semibold text-white hover:bg-neutral-800 disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </aside>

        <section className="min-w-0 bg-neutral-50 p-5">
          <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm">
            <div className="border-b border-neutral-100 bg-gradient-to-b from-white to-neutral-50 px-4 py-4">
              <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-base font-semibold text-neutral-950">Moodboard</p>
                    <span className="rounded-full bg-neutral-900 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-white">
                      {sources.length} saved
                    </span>
                    {filteredSources.length !== sources.length ? (
                      <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-neutral-500">
                        {filteredSources.length} showing
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 max-w-2xl text-xs leading-relaxed text-neutral-500">
                    Click Stem on any saved reference to send a creative direction into Design Studio.
                  </p>
                </div>
                <div className="rounded-full bg-neutral-100 p-1">
                  {(["large", "dense"] as const).map((item) => (
                    <button
                      key={item}
                      type="button"
                      onClick={() => setDensity(item)}
                      className={`rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-wider transition ${
                        density === item ? "bg-white text-neutral-950 shadow-sm" : "text-neutral-500 hover:text-neutral-800"
                      }`}
                    >
                      {item}
                    </button>
                  ))}
                </div>
              </div>
              <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(220px,360px)_1fr]">
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search western, barrel jeans, 4th of july..."
                  className="h-10 rounded-xl border border-neutral-200 bg-white px-3 text-sm outline-none focus:border-brand-500"
                />
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {["All", ...tags].map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => setActiveTag(tag)}
                      className={`shrink-0 rounded-full border px-3 py-2 text-[10px] font-semibold uppercase tracking-wider transition ${
                        activeTag === tag
                          ? "border-neutral-900 bg-neutral-900 text-white"
                          : "border-neutral-200 bg-white text-neutral-600 hover:border-neutral-300"
                      }`}
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {loading ? (
              <div className="p-10 text-center text-sm text-neutral-500">Loading inspiration...</div>
            ) : sources.length === 0 ? (
              <div className="m-4 rounded-xl border border-dashed border-neutral-200 bg-neutral-50 p-10 text-center">
                <p className="text-sm font-semibold text-neutral-800">Your first inspiration image will appear here.</p>
                <p className="mt-2 text-sm text-neutral-500">Upload an image or paste a product link to start the shared moodboard.</p>
              </div>
            ) : filteredSources.length === 0 ? (
              <div className="m-4 rounded-xl border border-dashed border-neutral-200 bg-neutral-50 p-10 text-center">
                <p className="text-sm font-semibold text-neutral-800">No matches yet.</p>
                <p className="mt-2 text-sm text-neutral-500">Try a broader search or switch the tag filter back to All.</p>
              </div>
            ) : (
              <div
                className={`grid max-h-[calc(100vh-260px)] overflow-y-auto p-4 ${
                  density === "large"
                    ? "grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3"
                    : "grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5"
                }`}
              >
                {filteredSources.map((source) => {
                  const image = sourceImage(source);
                  return (
                    <article key={source.id} className="group overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
                      <div className="relative">
                        <button
                          type="button"
                          onClick={() => image && setPreview(image)}
                          className={`block w-full bg-neutral-100 ${density === "large" ? "aspect-[4/5]" : "aspect-square"}`}
                        >
                          {image ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={image} alt={source.title} className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]" />
                          ) : (
                            <div className="flex h-full items-center justify-center p-4 text-center text-xs text-neutral-400">
                              Link saved without image preview
                            </div>
                          )}
                        </button>
                        {image ? (
                          <div className="absolute inset-x-2 bottom-2 flex justify-end gap-1 opacity-0 transition group-hover:opacity-100">
                            <button
                              type="button"
                              onClick={() => {
                                setStemSource(source);
                                setStemInstruction("");
                              }}
                              className="rounded-full bg-brand-500 px-2.5 py-1 text-[10px] font-semibold text-white shadow-sm backdrop-blur hover:bg-brand-600"
                            >
                              Stem
                            </button>
                            <button
                              type="button"
                              onClick={() => setPreview(image)}
                              className="rounded-full bg-white/90 px-2.5 py-1 text-[10px] font-semibold text-neutral-800 shadow-sm backdrop-blur hover:bg-white"
                            >
                              View
                            </button>
                            <button
                              type="button"
                              onClick={() => downloadImage(image, safeFileName(source.title))}
                              className="rounded-full bg-neutral-950/90 px-2.5 py-1 text-[10px] font-semibold text-white shadow-sm backdrop-blur hover:bg-neutral-950"
                            >
                              Download
                            </button>
                          </div>
                        ) : null}
                      </div>
                      <div className={density === "large" ? "p-3" : "p-2.5"}>
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-xs font-semibold text-neutral-950">{source.title}</p>
                            <p className="mt-0.5 truncate text-[10px] text-neutral-500">{source.category}</p>
                          </div>
                          <div className="flex shrink-0 items-center gap-1">
                            <button
                              type="button"
                              onClick={() => {
                                setStemSource(source);
                                setStemInstruction("");
                              }}
                              className="rounded-full bg-neutral-100 px-2 py-1 text-[10px] font-semibold text-neutral-700 hover:bg-brand-50 hover:text-brand-700"
                            >
                              Stem
                            </button>
                            <button
                              type="button"
                              onClick={() => void deleteSource(source.id)}
                              className="rounded-full px-2 py-1 text-[10px] font-semibold text-neutral-400 hover:bg-red-50 hover:text-red-600"
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                        {source.tags?.length ? (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {source.tags.slice(0, density === "large" ? 8 : 4).map((tag) => (
                              <span key={tag} className="rounded-full bg-neutral-100 px-2 py-0.5 text-[9px] font-semibold text-neutral-600">
                                {tag}
                              </span>
                            ))}
                          </div>
                        ) : null}
                        {density === "large" && source.note ? (
                          <p className="mt-2 line-clamp-2 text-[11px] leading-relaxed text-neutral-500">{source.note}</p>
                        ) : null}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      </div>

      {stemSource && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4">
          <div className="grid max-h-[92vh] w-full max-w-5xl overflow-hidden rounded-2xl bg-white shadow-2xl lg:grid-cols-[minmax(280px,0.78fr)_1fr]">
            <div className="bg-neutral-100">
              {sourceImage(stemSource) ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={sourceImage(stemSource)} alt={stemSource.title} className="h-full min-h-[320px] w-full object-cover" />
              ) : (
                <div className="flex h-full min-h-[320px] items-center justify-center p-6 text-center text-sm text-neutral-500">
                  This saved source does not have an image preview, but its tags can still guide the design direction.
                </div>
              )}
            </div>
            <div className="flex max-h-[92vh] flex-col">
              <div className="border-b border-neutral-200 px-5 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-neutral-500">Stem From Inspiration</p>
                    <h2 className="mt-1 font-serif text-3xl leading-none text-neutral-950">What should this become?</h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setStemSource(null);
                      setStemInstruction("");
                    }}
                    className="rounded-full border border-neutral-200 px-3 py-1.5 text-xs font-semibold text-neutral-600 hover:bg-neutral-50"
                  >
                    Close
                  </button>
                </div>
                <div className="mt-3">
                  <p className="text-sm font-semibold text-neutral-900">{stemSource.title}</p>
                  <p className="mt-1 text-xs leading-relaxed text-neutral-500">
                    {[stemSource.category, stemSource.tags?.join(", ")].filter(Boolean).join(" · ")}
                  </p>
                  {stemSource.note ? <p className="mt-2 text-xs leading-relaxed text-neutral-500">{stemSource.note}</p> : null}
                </div>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
                <p className="text-xs font-semibold uppercase tracking-widest text-neutral-500">Quick Designer Directions</p>
                <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {stemOptions.map((option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => setStemInstruction(option)}
                      className={`rounded-xl border px-3 py-2 text-left text-xs font-semibold transition ${
                        stemInstruction === option
                          ? "border-brand-500 bg-brand-50 text-brand-700"
                          : "border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50"
                      }`}
                    >
                      {option}
                    </button>
                  ))}
                </div>
                <label className="mt-4 block">
                  <span className="text-xs font-semibold uppercase tracking-widest text-neutral-500">Or write your own direction</span>
                  <textarea
                    value={stemInstruction}
                    onChange={(event) => setStemInstruction(event.target.value)}
                    rows={4}
                    placeholder="Example: turn this into a barrel jean with a softer FW26 color story and a more premium boutique detail."
                    className="mt-2 w-full resize-none rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm leading-relaxed outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                  />
                </label>
              </div>
              <div className="grid gap-2 border-t border-neutral-200 p-5 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => sendToDesignStudio(false)}
                  className="rounded-xl border border-neutral-200 px-3 py-2.5 text-sm font-semibold text-neutral-700 hover:bg-neutral-50"
                >
                  Send Direction
                </button>
                <button
                  type="button"
                  onClick={() => sendToDesignStudio(true)}
                  disabled={!sourceImage(stemSource)}
                  className="rounded-xl bg-neutral-900 px-3 py-2.5 text-sm font-semibold text-white hover:bg-neutral-800 disabled:opacity-50"
                >
                  Use Image in Design Studio
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {preview && <ImageLightbox src={preview} alt="Inspiration preview" onClose={() => setPreview(null)} />}

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
