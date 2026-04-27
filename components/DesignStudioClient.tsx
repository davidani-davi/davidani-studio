"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import ImageLightbox, { ZoomButton } from "@/components/ImageLightbox";
import TopTabs from "@/components/TopTabs";
import type { UploadedImage } from "@/components/types";
import { resizeIfNeeded } from "@/lib/image-resize";
import type { ProductDesignConcept, ProductDesignResult } from "@/lib/fal";
import type { InspirationSource } from "@/lib/inspiration-library";

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
  "Build a balanced mini line",
  "Push bestseller DNA",
  "More bestseller-driven",
  "More visually bold",
  "More wearable",
  "Less similar to original",
  "More boutique",
  "More FW26",
];

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

const designerIdeaChips = [
  "washed red denim with western details",
  "more FW26 but still commercial",
  "make it balloon shaped",
  "soft romantic boutique version",
  "less embellished, more everyday",
  "same idea but better for Faire",
];

const DESIGN_STUDIO_INSPIRATION_KEY = "davidani:design-studio:inspiration-stem";

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

function scoreLabel(value?: number) {
  const n = Math.max(0, Math.min(10, Math.round(value || 0)));
  return n ? `${n}/10` : "-";
}

function sourceImage(source: InspirationSource): string {
  if (source.imageUrl) return source.imageUrl;
  return /\.(png|jpe?g|webp|gif)(\?.*)?$/i.test(source.url) ? source.url : "";
}

function tagText(source: InspirationSource): string {
  return source.tags?.length ? source.tags.join(", ") : source.category;
}

function uniqueMoodboardTags(sources: InspirationSource[]): string[] {
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
    .slice(0, 18)
    .map(([tag]) => tag);
}

export default function DesignStudioClient() {
  const inputRef = useRef<HTMLInputElement>(null);
  const inspirationInputRef = useRef<HTMLInputElement>(null);
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
  const [renderingIndex, setRenderingIndex] = useState<number | null>(null);
  const [inspirations, setInspirations] = useState<InspirationSource[]>([]);
  const [inspirationOpen, setInspirationOpen] = useState(false);
  const [savingInspiration, setSavingInspiration] = useState(false);
  const [savingGeneratedIndex, setSavingGeneratedIndex] = useState<number | null>(null);
  const [analyzingInspiration, setAnalyzingInspiration] = useState(false);
  const [draggingInspiration, setDraggingInspiration] = useState(false);
  const [moodboardOpen, setMoodboardOpen] = useState(false);
  const [moodboardQuery, setMoodboardQuery] = useState("");
  const [moodboardTag, setMoodboardTag] = useState("All");
  const [moodboardDensity, setMoodboardDensity] = useState<"large" | "dense">("large");
  const [stemSource, setStemSource] = useState<InspirationSource | null>(null);
  const [stemInstruction, setStemInstruction] = useState("");
  const [designerIdea, setDesignerIdea] = useState("");
  const [newInspiration, setNewInspiration] = useState({
    title: "",
    url: "",
    imageUrl: "",
    category: "",
    tags: "",
    note: "",
  });

  const selectedUpload = useMemo(
    () => uploads.find((u) => u.url === selectedUrl) ?? null,
    [uploads, selectedUrl]
  );
  const moodboardTags = useMemo(() => uniqueMoodboardTags(inspirations), [inspirations]);
  const filteredInspirations = useMemo(() => {
    const query = moodboardQuery.trim().toLowerCase();
    const activeTag = moodboardTag.toLowerCase();
    return inspirations.filter((source) => {
      const tags = source.tags || [];
      const haystack = `${source.title} ${source.category} ${source.note} ${tags.join(
        " "
      )} ${source.url}`.toLowerCase();
      const matchesQuery = !query || haystack.includes(query);
      const matchesTag =
        moodboardTag === "All" ||
        tags.some((tag) => tag.toLowerCase() === activeTag) ||
        source.category.toLowerCase() === activeTag;
      return matchesQuery && matchesTag;
    });
  }, [inspirations, moodboardQuery, moodboardTag]);

  async function loadInspirations() {
    try {
      const data = await fetchJson("Load inspirations", "/api/design-studio/inspirations");
      setInspirations(data.sources || []);
    } catch (err: any) {
      setError(err?.message || "Failed to load inspirations");
    }
  }

  useEffect(() => {
    void loadInspirations();
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(DESIGN_STUDIO_INSPIRATION_KEY);
      if (!raw) return;
      localStorage.removeItem(DESIGN_STUDIO_INSPIRATION_KEY);
      const payload = JSON.parse(raw) as {
        refinement?: string;
        imageUrl?: string;
        title?: string;
      };
      if (payload.refinement) setRefinement(payload.refinement);
      if (payload.imageUrl) {
        setUploads((list) =>
          list.some((item) => item.url === payload.imageUrl)
            ? list
            : [
                ...list,
                {
                  name: payload.title || "Inspiration source",
                  url: payload.imageUrl!,
                },
              ]
        );
        setSelectedUrl(payload.imageUrl);
        setResult(null);
        setTechpack("");
      }
    } catch {
      localStorage.removeItem(DESIGN_STUDIO_INSPIRATION_KEY);
    }
  }, []);

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

  async function addInspirationFiles(files: FileList) {
    setAnalyzingInspiration(true);
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
      setNewInspiration((item) => ({
        ...item,
        url: imageUrl,
        imageUrl,
      }));
      await analyzeInspiration({ imageUrl, url: imageUrl });
    } catch (err: any) {
      setError(err?.message || "Inspiration upload failed");
    } finally {
      setAnalyzingInspiration(false);
      setDraggingInspiration(false);
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

  function handleInspirationDrop(e: React.DragEvent) {
    e.preventDefault();
    setDraggingInspiration(false);
    if (e.dataTransfer.files.length) void addInspirationFiles(e.dataTransfer.files);
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

  function useInspirationAsUpload(source: InspirationSource) {
    const image = sourceImage(source);
    if (!image) return null;
    setUploads((list) =>
      list.some((item) => item.url === image)
        ? list
        : [...list, { name: source.title || "Inspiration source", url: image }]
    );
    setSelectedUrl(image);
    setResult(null);
    setTechpack("");
    return image;
  }

  async function generateConcepts(nextRefinement = refinement, imageOverride?: string) {
    const imageUrl = imageOverride || selectedUrl;
    if (!imageUrl) return;
    setGenerating(true);
    setError(null);
    setCopied(null);
    setTechpack("");
    try {
      const data = await fetchJson("Generate product visuals", "/api/design-studio/concepts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageUrl, refinement: nextRefinement }),
      });
      setResult(data.result || null);
    } catch (err: any) {
      setError(err?.message || "Product visual generation failed");
    } finally {
      setGenerating(false);
    }
  }

  async function applyStem(generateNow: boolean, useSourceImage = false) {
    if (!stemSource) return;
    const nextRefinement = buildStemRefinement(stemSource, stemInstruction.trim());
    setRefinement(nextRefinement);
    setMoodboardOpen(false);
    setStemSource(null);
    setStemInstruction("");

    const image = useSourceImage ? useInspirationAsUpload(stemSource) : selectedUrl;
    if (generateNow) {
      if (!image) {
        setError("Select a product image first, or use the inspiration image as the source.");
        return;
      }
      await generateConcepts(nextRefinement, image);
    }
  }

  async function recreateWithDesignerIdea() {
    const idea = designerIdea.trim();
    if (!idea) return;
    const nextRefinement = [
      `Designer idea: ${idea}.`,
      result?.detectedCategory ? `Keep the category as ${result.detectedCategory}.` : "",
      "Use the idea to create fresh, sellable boutique product concepts. Do not simply recolor the current outputs unless the idea specifically asks for color. Make the new set feel meaningfully improved and commercially useful.",
    ]
      .filter(Boolean)
      .join(" ");
    setRefinement(nextRefinement);
    await generateConcepts(nextRefinement);
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

  async function retryVisual(index: number) {
    if (!result || !selectedUrl) return;
    const concept = result.concepts[index];
    setRenderingIndex(index);
    setError(null);
    try {
      const data = await fetchJson("Render product visual", "/api/design-studio/render", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          concept,
          detectedCategory: result.detectedCategory,
          imageUrl: selectedUrl,
        }),
      });
      setResult((current) => {
        if (!current) return current;
        return {
          ...current,
          concepts: current.concepts.map((item, itemIndex) =>
            itemIndex === index
              ? { ...item, visualUrl: data.visualUrl, visualError: undefined }
              : item
          ),
        };
      });
    } catch (err: any) {
      setResult((current) => {
        if (!current) return current;
        return {
          ...current,
          concepts: current.concepts.map((item, itemIndex) =>
            itemIndex === index
              ? { ...item, visualError: err?.message || "Visual render failed" }
              : item
          ),
        };
      });
      setError(err?.message || "Visual render failed");
    } finally {
      setRenderingIndex(null);
    }
  }

  async function analyzeInspiration(input: Partial<typeof newInspiration> = newInspiration) {
    const url = (input.url || "").trim();
    const imageUrl = (input.imageUrl || "").trim();
    if (!url && !imageUrl) return null;
    setAnalyzingInspiration(true);
    setError(null);
    try {
      const data = await fetchJson("Analyze inspiration", "/api/design-studio/inspirations/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, imageUrl }),
      });
      setNewInspiration((item) => ({
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
      setAnalyzingInspiration(false);
    }
  }

  async function saveInspiration() {
    setSavingInspiration(true);
    setError(null);
    try {
      let item = newInspiration;
      if (!item.tags.trim() && (item.url.trim() || item.imageUrl.trim())) {
        const analyzed = await analyzeInspiration(item);
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
      setInspirations((items) => [
        data.source,
        ...items.filter((item) => item.id !== data.source.id),
      ]);
      setNewInspiration({ title: "", url: "", imageUrl: "", category: "", tags: "", note: "" });
      setMoodboardOpen(true);
    } catch (err: any) {
      setError(err?.message || "Failed to save inspiration");
    } finally {
      setSavingInspiration(false);
    }
  }

  async function saveGeneratedInspiration(concept: ProductDesignConcept, index: number) {
    if (!concept.visualUrl || !result) return;
    setSavingGeneratedIndex(index);
    setError(null);
    try {
      const note = [
        concept.assortmentRole,
        concept.customerReasonToBuy,
        concept.bestsellerDNA?.length
          ? `DNA: ${concept.bestsellerDNA.join(", ")}`
          : "",
        concept.keyFeatures.length ? `Features: ${concept.keyFeatures.join(", ")}` : "",
      ]
        .filter(Boolean)
        .join(" | ");
      const data = await fetchJson("Save generated inspiration", "/api/design-studio/inspirations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: concept.productName,
          url: concept.visualUrl,
          imageUrl: concept.visualUrl,
          category: result.detectedCategory || concept.assortmentRole || "Generated design",
          tags: [
            result.detectedCategory,
            concept.assortmentRole,
            ...(concept.bestsellerDNA || []),
            ...concept.keyFeatures,
          ].filter(Boolean),
          note,
        }),
      });
      setInspirations((items) => [
        data.source,
        ...items.filter((item) => item.id !== data.source.id),
      ]);
      setInspirationOpen(true);
    } catch (err: any) {
      setError(err?.message || "Failed to save generated inspiration");
    } finally {
      setSavingGeneratedIndex(null);
    }
  }

  async function deleteInspiration(id: string) {
    setError(null);
    try {
      await fetchJson(
        "Delete inspiration",
        `/api/design-studio/inspirations?id=${encodeURIComponent(id)}`,
        { method: "DELETE" }
      );
      setInspirations((items) => items.filter((item) => item.id !== id));
    } catch (err: any) {
      setError(err?.message || "Failed to delete inspiration");
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
            V1.5
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
                <section className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-widest text-neutral-500">
                        Designer Idea
                      </p>
                      <h2 className="mt-1 font-serif text-2xl leading-none text-neutral-950">
                        Tell AI what to recreate next.
                      </h2>
                      <p className="mt-1 max-w-xl text-xs leading-relaxed text-neutral-500">
                        Write your own product thought, trend instinct, buyer note, or styling
                        direction. The AI will turn it into a fresh set of visuals.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void recreateWithDesignerIdea()}
                      disabled={!selectedUrl || generating || !designerIdea.trim()}
                      className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-neutral-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-neutral-800 disabled:opacity-50"
                    >
                      {generating ? <Spinner /> : IconSparkle}
                      Recreate
                    </button>
                  </div>

                  <textarea
                    value={designerIdea}
                    onChange={(event) => setDesignerIdea(event.target.value)}
                    rows={3}
                    placeholder="Example: make this barrel jean feel more FW26 with a washed berry color, subtle western seam lines, and a boutique-friendly novelty detail."
                    className="mt-4 w-full resize-none rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm leading-relaxed outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                  />

                  <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
                    {designerIdeaChips.map((chip) => (
                      <button
                        key={chip}
                        type="button"
                        onClick={() =>
                          setDesignerIdea((current) =>
                            current.trim() ? `${current.trim()}, ${chip}` : chip
                          )
                        }
                        className="shrink-0 rounded-full border border-neutral-200 bg-white px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-neutral-600 hover:bg-neutral-50"
                      >
                        {chip}
                      </button>
                    ))}
                  </div>
                </section>

                <div className="flex flex-col gap-2 rounded-xl border border-neutral-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-neutral-500">
                      {result.detectedCategory}
                    </p>
                    <p className="mt-1 text-sm font-semibold text-neutral-900">
                      {result.customerWorld}
                    </p>
                    {result.assortmentStrategy ? (
                      <p className="mt-1 max-w-xl text-xs leading-relaxed text-neutral-500">
                        {result.assortmentStrategy}
                      </p>
                    ) : null}
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

                {result.bestsellerDNA?.length ? (
                  <div className="rounded-xl border border-neutral-200 bg-white p-4">
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-neutral-500">
                      Bestseller DNA
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {result.bestsellerDNA.map((item) => (
                        <span
                          key={item}
                          className="rounded-full bg-neutral-100 px-2 py-1 text-[10px] font-semibold text-neutral-600"
                        >
                          {item}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}

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
                          <div className="flex h-full items-center justify-center px-5 text-center text-xs text-neutral-500">
                            {renderingIndex === index ? (
                              <span className="inline-flex items-center gap-2">
                                <Spinner />
                                Rendering
                              </span>
                            ) : concept.visualError ? (
                              "Renderer is busy. Retry this visual."
                            ) : (
                              "Visual pending"
                            )}
                          </div>
                        )}
                      </button>
                      <div className="p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">
                              {concept.assortmentRole || `Option ${index + 1}`}
                            </p>
                            <h2 className="mt-1 text-base font-semibold text-neutral-950">
                              {concept.productName}
                            </h2>
                            <p className="mt-1 text-xs font-medium text-brand-700">
                              {concept.customerMood}
                            </p>
                            {concept.customerReasonToBuy ? (
                              <p className="mt-2 text-xs leading-relaxed text-neutral-500">
                                {concept.customerReasonToBuy}
                              </p>
                            ) : null}
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

                        {concept.commercialScores && (
                          <div className="mt-3 grid grid-cols-5 gap-1.5">
                            {[
                              ["Com", concept.commercialScores.commerciality],
                              ["New", concept.commercialScores.novelty],
                              ["Fit", concept.commercialScores.brandFit],
                              ["Make", concept.commercialScores.productionEase],
                              ["Risk", concept.commercialScores.risk],
                            ].map(([label, value]) => (
                              <div
                                key={label}
                                className="rounded-lg bg-neutral-50 px-2 py-1.5 text-center"
                              >
                                <p className="text-[9px] font-bold uppercase tracking-wider text-neutral-400">
                                  {label}
                                </p>
                                <p className="mt-0.5 text-[11px] font-semibold text-neutral-700">
                                  {scoreLabel(Number(value))}
                                </p>
                              </div>
                            ))}
                          </div>
                        )}

                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {[...(concept.bestsellerDNA || []), ...concept.keyFeatures]
                            .slice(0, 5)
                            .map((feature) => (
                            <span
                              key={feature}
                              className="rounded-full bg-neutral-100 px-2 py-1 text-[10px] font-semibold text-neutral-600"
                            >
                              {feature}
                            </span>
                          ))}
                        </div>

                        <div className="mt-4 grid grid-cols-2 gap-2">
                          {!concept.visualUrl && (
                            <button
                              type="button"
                              onClick={() => void retryVisual(index)}
                              disabled={renderingIndex !== null}
                              className="col-span-2 inline-flex items-center justify-center gap-2 rounded-lg border border-neutral-200 px-3 py-2 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
                            >
                              {renderingIndex === index ? <Spinner /> : null}
                              Retry Visual
                            </button>
                          )}
                          {concept.visualUrl && (
                            <button
                              type="button"
                              onClick={() => void saveGeneratedInspiration(concept, index)}
                              disabled={savingGeneratedIndex !== null}
                              className="col-span-2 inline-flex items-center justify-center gap-2 rounded-lg border border-neutral-200 px-3 py-2 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
                            >
                              {savingGeneratedIndex === index ? <Spinner /> : null}
                              Save Inspiration
                            </button>
                          )}
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

      {stemSource && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4">
          <div className="grid max-h-[92vh] w-full max-w-5xl overflow-hidden rounded-2xl bg-white shadow-2xl lg:grid-cols-[minmax(280px,0.78fr)_1fr]">
            <div className="bg-neutral-100">
              {sourceImage(stemSource) ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={sourceImage(stemSource)}
                  alt={stemSource.title}
                  className="h-full min-h-[320px] w-full object-cover"
                />
              ) : (
                <div className="flex h-full min-h-[320px] items-center justify-center p-6 text-center text-sm text-neutral-500">
                  This saved source does not have an image preview, but its tags can still guide
                  the design direction.
                </div>
              )}
            </div>
            <div className="flex max-h-[92vh] flex-col">
              <div className="border-b border-neutral-200 px-5 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-neutral-500">
                      Stem From Inspiration
                    </p>
                    <h2 className="mt-1 font-serif text-3xl leading-none text-neutral-950">
                      What should this become?
                    </h2>
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
                  {stemSource.note ? (
                    <p className="mt-2 text-xs leading-relaxed text-neutral-500">
                      {stemSource.note}
                    </p>
                  ) : null}
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
                <p className="text-xs font-semibold uppercase tracking-widest text-neutral-500">
                  Quick Designer Directions
                </p>
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
                  <span className="text-xs font-semibold uppercase tracking-widest text-neutral-500">
                    Or write your own direction
                  </span>
                  <textarea
                    value={stemInstruction}
                    onChange={(event) => setStemInstruction(event.target.value)}
                    rows={4}
                    placeholder="Example: turn this into a barrel jean with a softer FW26 color story and a more premium boutique detail."
                    className="mt-2 w-full resize-none rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm leading-relaxed outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                  />
                </label>

                <div className="mt-4 rounded-xl bg-neutral-50 p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-neutral-500">
                    How it will work
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-neutral-600">
                    The AI will use this image as inspiration DNA only. It will not copy the saved
                    design exactly; it will create fresh, sellable product directions from the
                    instruction you choose.
                  </p>
                </div>
              </div>

              <div className="grid gap-2 border-t border-neutral-200 p-5 sm:grid-cols-3">
                <button
                  type="button"
                  onClick={() => void applyStem(false)}
                  className="rounded-xl border border-neutral-200 px-3 py-2.5 text-sm font-semibold text-neutral-700 hover:bg-neutral-50"
                >
                  Set Direction
                </button>
                <button
                  type="button"
                  onClick={() => void applyStem(true, false)}
                  disabled={!selectedUrl || generating}
                  className="rounded-xl border border-neutral-200 px-3 py-2.5 text-sm font-semibold text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
                >
                  Apply to Product
                </button>
                <button
                  type="button"
                  onClick={() => void applyStem(true, true)}
                  disabled={!sourceImage(stemSource) || generating}
                  className="rounded-xl bg-neutral-900 px-3 py-2.5 text-sm font-semibold text-white hover:bg-neutral-800 disabled:opacity-50"
                >
                  Use Inspo as Source
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

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
