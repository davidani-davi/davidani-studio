"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import ImageLightbox from "@/components/ImageLightbox";
import StudioHeader from "@/components/StudioHeader";
import { readTasteSignals, toggleTasteSignal } from "@/lib/design-memory";
import { resizeIfNeeded } from "@/lib/image-resize";
import type { InspirationSource } from "@/lib/inspiration-library";

const PROMPT_STUDIO_IMPORT_KEY = "davidani:prompt-studio:import";

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

function sourceImage(source: InspirationSource): string {
  if (source.imageUrls?.length) return source.imageUrls[0];
  if (source.imageUrl) return source.imageUrl;
  return /\.(png|jpe?g|webp|gif)(\?.*)?$/i.test(source.url) ? source.url : "";
}

function sourceImages(source: InspirationSource): string[] {
  const urls = source.imageUrls?.length
    ? source.imageUrls
    : source.imageUrl
    ? [source.imageUrl]
    : sourceImage(source)
    ? [sourceImage(source)]
    : [];
  return Array.from(new Set(urls)).filter(Boolean);
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

export default function InspirationClient() {
  const inputRef = useRef<HTMLInputElement>(null);
  const addViewsInputRef = useRef<HTMLInputElement>(null);
  const [sources, setSources] = useState<InspirationSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [query, setQuery] = useState("");
  const [activeTag, setActiveTag] = useState("All");
  const [density, setDensity] = useState<"large" | "dense">("dense");
  const [preview, setPreview] = useState<string | null>(null);
  const [addViewsTarget, setAddViewsTarget] = useState<string | null>(null);
  const [tasteVersion, setTasteVersion] = useState(0);
  const [likedTasteKeys, setLikedTasteKeys] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState({
    title: "",
    url: "",
    imageUrl: "",
    imageUrls: [] as string[],
    category: "",
    tags: "",
    note: "",
  });

  const tags = useMemo(() => uniqueTags(sources), [sources]);
  const likedKeys = useMemo(() => new Set(likedTasteKeys), [likedTasteKeys]);
  const likedCount = likedTasteKeys.length;
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
      const data = await fetchJson("Load inspirations", "/api/inspiration");
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

  useEffect(() => {
    setLikedTasteKeys(readTasteSignals().map((signal) => signal.key));
  }, [tasteVersion]);

  function hasImageFiles(e: React.DragEvent) {
    return Array.from(e.dataTransfer.items).some((item) => item.type.startsWith("image/"));
  }

  async function addFiles(files: FileList) {
    setAnalyzing(true);
    setError(null);
    try {
      const picked = Array.from(files).filter((file) => file.type.startsWith("image/"));
      if (!picked.length) return;
      const form = new FormData();
      for (const file of picked.slice(0, 12)) {
        form.append("files", await resizeIfNeeded(file));
      }
      const uploaded = await fetchJson("Upload inspiration", "/api/upload", {
        method: "POST",
        body: form,
      });
      const imageUrls = (uploaded.uploads || [])
        .map((item: { url?: string }) => item.url)
        .filter(Boolean);
      const imageUrl = imageUrls[0];
      if (!imageUrl) throw new Error("Upload succeeded but no image URL returned");
      setDraft((item) => ({
        ...item,
        url: item.url || imageUrl,
        imageUrl,
        imageUrls: Array.from(new Set([...(item.imageUrls || []), ...imageUrls])),
      }));
      await analyzeDraft({ url: imageUrl, imageUrl });
    } catch (err: any) {
      setError(err?.message || "Inspiration upload failed");
    } finally {
      setAnalyzing(false);
      setDragging(false);
    }
  }

  async function addViewsToSource(sourceId: string, files: FileList) {
    setError(null);
    setAnalyzing(true);
    try {
      const picked = Array.from(files).filter((file) => file.type.startsWith("image/"));
      if (!picked.length) return;
      const form = new FormData();
      for (const file of picked.slice(0, 12)) {
        form.append("files", await resizeIfNeeded(file));
      }
      const uploaded = await fetchJson("Upload inspiration views", "/api/upload", {
        method: "POST",
        body: form,
      });
      const imageUrls = (uploaded.uploads || [])
        .map((item: { url?: string }) => item.url)
        .filter(Boolean);
      if (!imageUrls.length) throw new Error("Upload succeeded but no image URLs returned");
      const data = await fetchJson("Save inspiration views", "/api/inspiration", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "add-images", id: sourceId, imageUrls }),
      });
      setSources((items) =>
        items.map((source) => (source.id === sourceId ? data.source : source))
      );
    } catch (err: any) {
      setError(err?.message || "Failed to add inspiration views");
    } finally {
      setAnalyzing(false);
      setAddViewsTarget(null);
      if (addViewsInputRef.current) addViewsInputRef.current.value = "";
    }
  }

  async function analyzeDraft(input: Partial<typeof draft> = draft) {
    const url = (input.url || "").trim();
    const imageUrl = (input.imageUrl || "").trim();
    if (!url && !imageUrl) return null;
    setAnalyzing(true);
    setError(null);
    try {
      const data = await fetchJson("Analyze inspiration", "/api/inspiration/analyze", {
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
      const data = await fetchJson("Save inspiration", "/api/inspiration", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...item,
          imageUrls: item.imageUrls,
          tags: item.tags.split(",").map((tag) => tag.trim()).filter(Boolean),
        }),
      });
      setSources((items) => [data.source, ...items.filter((source) => source.id !== data.source.id)]);
      setDraft({ title: "", url: "", imageUrl: "", imageUrls: [], category: "", tags: "", note: "" });
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
        `/api/inspiration?id=${encodeURIComponent(id)}`,
        { method: "DELETE" }
      );
      setSources((items) => items.filter((source) => source.id !== id));
    } catch (err: any) {
      setError(err?.message || "Failed to delete inspiration");
    }
  }

  function sendBestsellerRemix(source: InspirationSource) {
    const imageUrl = sourceImage(source);
    if (!imageUrl) {
      setError("This inspiration needs an image before it can be remixed.");
      return;
    }
    const payload = {
      tool: "bestseller-remix",
      imageUrl,
      title: `${source.title} Bestseller Remix`,
    };
    localStorage.setItem(PROMPT_STUDIO_IMPORT_KEY, JSON.stringify(payload));
    window.location.href = "/prompt-studio";
  }

  function tasteSignalForSource(source: InspirationSource) {
    return {
      key: `inspiration:${source.id}`,
      type: "inspiration" as const,
      title: source.title || "Saved inspiration",
      category: source.category,
      tags: source.tags,
      note: source.note,
      imageUrl: sourceImage(source),
    };
  }

  function toggleSourceLike(source: InspirationSource) {
    toggleTasteSignal(tasteSignalForSource(source));
    setTasteVersion((value) => value + 1);
  }

  return (
    <main className="flex min-h-screen flex-col bg-neutral-50">
      <StudioHeader
        active="inspiration"
        title="Inspiration"
        subtitle="Collect references, auto-tag them, and turn strong ideas into prompt-ready product remixes."
        metrics={[
          { label: "Saved", value: sources.length },
          { label: "Liked", value: likedCount },
          { label: "Active", value: saving || analyzing ? 1 : 0 },
        ]}
      />

      <div className="grid min-h-0 flex-1 lg:grid-cols-[360px_1fr]">
        <aside className="border-b border-neutral-200 bg-white p-5 lg:border-b-0 lg:border-r">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-neutral-500">
              Inspiration Library
            </p>
            <h1 className="mt-1 font-serif text-4xl leading-none text-neutral-950">
              Collect. Tag. Create.
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-neutral-500">
              Save visual references here, let AI tag them, then remix the strongest ideas in Prompt Studio.
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
                multiple
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
              <div className="grid grid-cols-3 gap-2">
                {(draft.imageUrls.length ? draft.imageUrls : [draft.imageUrl]).map((url, idx) => (
                  <button
                    key={`${url}-${idx}`}
                    type="button"
                    onClick={() => setPreview(url)}
                    className="group relative aspect-square overflow-hidden rounded-lg bg-neutral-100"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt={draft.title || "Inspiration preview"} className="h-full w-full object-cover" />
                    {idx === 0 && (
                      <span className="absolute left-1 top-1 rounded-full bg-white/90 px-1.5 py-0.5 text-[9px] font-semibold text-neutral-700">
                        Main
                      </span>
                    )}
                  </button>
                ))}
              </div>
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
          <input
            ref={addViewsInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(event) => {
              if (event.target.files?.length && addViewsTarget) {
                void addViewsToSource(addViewsTarget, event.target.files);
              }
            }}
          />
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
                    Use any saved reference as a design direction or bestseller remix.
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
                    ? "grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4"
                    : "grid-cols-2 gap-2.5 md:grid-cols-4 xl:grid-cols-6"
                }`}
              >
                {filteredSources.map((source) => {
                  const image = sourceImage(source);
                  const gallery = sourceImages(source);
                  const tasteSignal = tasteSignalForSource(source);
                  const liked = likedKeys.has(tasteSignal.key);
                  return (
                    <article key={source.id} className="group overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
                      <div className="relative">
                        <button
                          type="button"
                          onClick={() => image && setPreview(image)}
                          className={`block w-full bg-neutral-100 ${density === "large" ? "aspect-[3/4]" : "aspect-[4/3]"}`}
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
                              onClick={() => toggleSourceLike(source)}
                              className={`rounded-full px-2.5 py-1 text-[10px] font-semibold shadow-sm backdrop-blur ${
                                liked
                                  ? "bg-brand-500 text-white hover:bg-brand-600"
                                  : "bg-white/90 text-neutral-800 hover:bg-white"
                              }`}
                            >
                              {liked ? "Liked" : "Like"}
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
                        {gallery.length > 1 && (
                          <div className="mb-2 flex gap-1 overflow-x-auto">
                            {gallery.slice(0, 5).map((url, idx) => (
                              <button
                                key={`${source.id}-${url}`}
                                type="button"
                                onClick={() => setPreview(url)}
                                className="relative h-9 w-9 shrink-0 overflow-hidden rounded-md bg-neutral-100"
                                title={`View ${idx + 1}`}
                              >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={url} alt="" className="h-full w-full object-cover" />
                              </button>
                            ))}
                            {gallery.length > 5 && (
                              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-neutral-100 text-[10px] font-semibold text-neutral-500">
                                +{gallery.length - 5}
                              </span>
                            )}
                          </div>
                        )}
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-xs font-semibold text-neutral-950">{source.title}</p>
                            <p className="mt-0.5 truncate text-[10px] text-neutral-500">{source.category}</p>
                          </div>
                          <div className="flex shrink-0 items-center gap-1">
                            <button
                              type="button"
                              onClick={() => {
                                setAddViewsTarget(source.id);
                                window.setTimeout(() => addViewsInputRef.current?.click(), 0);
                              }}
                              className="rounded-full bg-neutral-100 px-2 py-1 text-[10px] font-semibold text-neutral-700 hover:bg-brand-50 hover:text-brand-700"
                            >
                              Add views
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
                        <div className="mt-2 grid grid-cols-2 gap-1.5">
                          <button
                            type="button"
                            onClick={() => sendBestsellerRemix(source)}
                            className="col-span-2 rounded-lg bg-neutral-950 px-2 py-1.5 text-[10px] font-semibold text-white hover:bg-neutral-800"
                          >
                            Bestseller Remix
                          </button>
                          <button
                            type="button"
                            onClick={() => toggleSourceLike(source)}
                            className={`col-span-2 rounded-lg border px-2 py-1.5 text-[10px] font-semibold ${
                              liked
                                ? "border-brand-500 bg-brand-50 text-brand-700"
                                : "border-neutral-200 text-neutral-700 hover:bg-neutral-50"
                            }`}
                          >
                            {liked ? "Liked for Taste" : "Like for Taste"}
                          </button>
                        </div>
                        {source.tags?.length ? (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {source.tags.slice(0, density === "large" ? 6 : 3).map((tag) => (
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
