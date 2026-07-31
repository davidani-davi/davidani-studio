"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import StudioHeader from "@/components/StudioHeader";
import { PHOTOSHOOT_REFERENCES } from "@/lib/photoshoot-references";
import type { UploadedImage } from "@/components/types";
import { resizeIfNeeded } from "@/lib/image-resize";

type Reference = { id: string; label: string; url: string; builtIn?: boolean };
type Result = { id: string; reference: Reference; status: "queued" | "running" | "done" | "failed"; variationIndex: number; shotVariation?: string; url?: string; error?: string };
const REFERENCE_USAGE_KEY = "davidani:photoshoot-reference-usage:v1";

async function json(input: string, init?: RequestInit) {
  const response = await fetch(input, init);
  const data = await response.json();
  if (!response.ok) throw new Error(data?.error || `HTTP ${response.status}`);
  return data;
}

export default function PhotoshootStudioClient() {
  const productInput = useRef<HTMLInputElement>(null);
  const referenceInput = useRef<HTMLInputElement>(null);
  const [products, setProducts] = useState<UploadedImage[]>([]);
  const [userReferences, setUserReferences] = useState<Reference[]>([]);
  const [selectedReferenceIds, setSelectedReferenceIds] = useState<string[]>(
    PHOTOSHOOT_REFERENCES.slice(0, 3).map((item) => item.id)
  );
  const [uploadingProduct, setUploadingProduct] = useState(false);
  const [uploadingReference, setUploadingReference] = useState(false);
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<Result[]>([]);
  const [error, setError] = useState<string | null>(null);

  const references = useMemo<Reference[]>(
    () => [
      ...PHOTOSHOOT_REFERENCES.map((item) => ({ ...item, builtIn: true })),
      ...userReferences,
    ],
    [userReferences]
  );

  useEffect(() => {
    json("/api/user-references")
      .then((data) =>
        setUserReferences(
          (data.references || []).map((item: any) => ({
            id: `saved-${item.id}`,
            label: item.label,
            url: item.imageUrl,
          }))
        )
      )
      .catch(() => undefined);
  }, []);

  async function uploadProducts(files: FileList) {
    setUploadingProduct(true);
    setError(null);
    try {
      const resized = await Promise.all(
        Array.from(files).slice(0, 6).map((file) => resizeIfNeeded(file))
      );
      const form = new FormData();
      resized.forEach((file) => form.append("files", file));
      const data = await json("/api/upload", { method: "POST", body: form });
      setProducts(data.uploads || []);
      setResults([]);
    } catch (err: any) {
      setError(err?.message || "Product upload failed");
    } finally {
      setUploadingProduct(false);
    }
  }

  async function uploadReference(file: File) {
    setUploadingReference(true);
    setError(null);
    try {
      const resized = await resizeIfNeeded(file);
      const form = new FormData();
      form.append("file", resized);
      form.append("label", file.name.replace(/\.[^.]+$/, ""));
      const data = await json("/api/user-references", { method: "POST", body: form });
      const added = { id: `saved-${data.reference.id}`, label: data.reference.label, url: data.reference.imageUrl };
      setUserReferences((current) => [...current, added]);
      setSelectedReferenceIds((current) => [...current, added.id]);
    } catch (err: any) {
      setError(err?.message || "Reference upload failed");
    } finally {
      setUploadingReference(false);
    }
  }

  function toggleReference(id: string) {
    setSelectedReferenceIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    );
  }

  async function generate() {
    if (!products.length) return setError("Upload at least one ERP product image");
    const selected = references.filter((item) => selectedReferenceIds.includes(item.id));
    if (!selected.length) return setError("Select at least one photographic reference");
    setRunning(true);
    setError(null);
    let usage: Record<string, number> = {};
    try {
      usage = JSON.parse(localStorage.getItem(REFERENCE_USAGE_KEY) || "{}");
    } catch {
      usage = {};
    }
    const initial: Result[] = selected.map((reference, index) => ({
      id: `${Date.now()}-${index}`,
      reference,
      status: "queued",
      variationIndex: Math.max(0, Number(usage[reference.id]) || 0),
    }));
    for (const reference of selected) usage[reference.id] = (Number(usage[reference.id]) || 0) + 1;
    localStorage.setItem(REFERENCE_USAGE_KEY, JSON.stringify(usage));
    setResults(initial);

    async function runOne(item: Result) {
      setResults((current) => current.map((result) => result.id === item.id ? { ...result, status: "running" } : result));
      try {
        const promptData = await json("/api/prompt-studio/photoshoot", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            imageUrls: products.map((product) => product.url),
            referenceId: item.reference.builtIn ? item.reference.id : undefined,
            referenceUrl: item.reference.builtIn ? undefined : item.reference.url,
            count: 1,
            direction: "balanced",
            variationIndex: item.variationIndex,
          }),
        });
        const generation = await json("/api/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            modelId: "gpt-image",
            prompt: promptData.prompts,
            imageUrls: [...products.map((product) => product.url), item.reference.url],
            aspectRatio: "auto",
            resolution: "2K",
            format: "png",
            numImages: 1,
            raw: true,
            useDefaultReference: false,
            referenceImageUrl: null,
          }),
        });
        const url = generation.images?.[0]?.url;
        if (!url) throw new Error("Generation returned no image");
        setResults((current) => current.map((result) => result.id === item.id ? { ...result, status: "done", url, shotVariation: promptData.shotVariation } : result));
      } catch (err: any) {
        setResults((current) => current.map((result) => result.id === item.id ? { ...result, status: "failed", error: err?.message || "Generation failed" } : result));
      }
    }

    for (let index = 0; index < initial.length; index += 2) {
      await Promise.all(initial.slice(index, index + 2).map(runOne));
    }
    setRunning(false);
  }

  return (
    <main className="min-h-screen bg-neutral-50">
      <StudioHeader active="photoshoot" title="Photoshoot Generator" subtitle="Upload an ERP style, select campaign references, and generate finished photos." metrics={[{ label: "Products", value: products.length }, { label: "References", value: selectedReferenceIds.length }, { label: "Active", value: running ? 1 : 0 }]} />
      <div className="grid min-h-[calc(100vh-88px)] grid-cols-1 xl:grid-cols-[330px_390px_1fr]">
        <aside className="border-r border-neutral-200 bg-white p-5">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-neutral-500">1 · ERP product images</p>
          <button onClick={() => productInput.current?.click()} disabled={uploadingProduct || running} className="mt-3 w-full rounded-xl border border-dashed border-neutral-300 bg-neutral-50 px-4 py-8 text-sm font-semibold text-neutral-600 hover:border-neutral-500 disabled:opacity-50">
            {uploadingProduct ? "Uploading…" : products.length ? "Replace product images" : "Upload one or more images"}
          </button>
          <input ref={productInput} type="file" multiple accept="image/*" className="hidden" onChange={(event) => { if (event.target.files?.length) uploadProducts(event.target.files); event.currentTarget.value = ""; }} />
          <div className="mt-4 grid grid-cols-3 gap-2">
            {products.map((product, index) => <div key={product.url} className="relative aspect-square overflow-hidden rounded-lg border border-neutral-200"><img src={product.url} alt={product.name} className="h-full w-full object-cover" /><span className="absolute left-1 top-1 rounded bg-black/75 px-1.5 py-0.5 text-[9px] text-white">{index + 1}</span></div>)}
          </div>
          <div className="mt-6 rounded-xl border border-blue-100 bg-blue-50 p-3 text-[11px] leading-relaxed text-blue-800">Multiple images are treated as one style contract. Use front, back, or detail images when available.</div>
        </aside>

        <aside className="border-r border-neutral-200 bg-white p-5">
          <div className="flex items-center justify-between"><p className="text-[11px] font-semibold uppercase tracking-widest text-neutral-500">2 · Photoshoot references</p><button onClick={() => referenceInput.current?.click()} disabled={uploadingReference || running} className="text-xs font-semibold text-neutral-700 underline">{uploadingReference ? "Saving…" : "+ Add"}</button></div>
          <input ref={referenceInput} type="file" accept="image/*" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) uploadReference(file); event.currentTarget.value = ""; }} />
          <div className="mt-3 grid grid-cols-3 gap-2">
            {references.map((reference) => { const selected = selectedReferenceIds.includes(reference.id); return <button key={reference.id} onClick={() => toggleReference(reference.id)} disabled={running} title={reference.label} className={`relative aspect-[4/5] overflow-hidden rounded-lg border ${selected ? "border-neutral-900 ring-2 ring-neutral-900/20" : "border-neutral-200 opacity-60"}`}><img src={reference.url} alt={reference.label} className="h-full w-full object-cover" />{selected ? <span className="absolute right-1 top-1 rounded-full bg-neutral-900 px-1.5 py-0.5 text-[9px] text-white">✓</span> : null}</button>; })}
          </div>
          <p className="mt-3 text-[11px] leading-relaxed text-neutral-500">Each selected reference creates one finished image. New uploads are saved to the shared reference library for future shoots.</p>
        </aside>

        <section className="flex min-w-0 flex-col p-6">
          <div className="flex items-center justify-between gap-4"><div><h2 className="text-lg font-semibold text-neutral-900">3 · Generate photoshoot</h2><p className="text-xs text-neutral-500">ChatGPT Image Generator · Auto aspect · 2K · one image per reference</p></div><button onClick={generate} disabled={running || !products.length || !selectedReferenceIds.length} className="rounded-xl bg-neutral-900 px-6 py-3 text-sm font-semibold text-white disabled:bg-neutral-300">{running ? "Generating…" : `Generate ${selectedReferenceIds.length} images`}</button></div>
          {results.length ? <div className="mt-6 grid grid-cols-1 gap-4 2xl:grid-cols-2">{results.map((result) => <article key={result.id} className="overflow-hidden rounded-xl border border-neutral-200 bg-white"><div className="flex items-center justify-between gap-3 border-b border-neutral-100 px-4 py-3"><div className="min-w-0"><p className="truncate text-xs font-semibold text-neutral-700">{result.reference.label}</p>{result.shotVariation ? <p className="mt-0.5 text-[10px] text-neutral-400">Shot: {result.shotVariation}</p> : null}</div><span className="text-[10px] font-semibold uppercase text-neutral-500">{result.status}</span></div>{result.url ? <a href={result.url} target="_blank" rel="noreferrer"><img src={result.url} alt={result.reference.label} className="max-h-[620px] w-full object-contain" /></a> : <div className="flex aspect-[16/10] items-center justify-center px-6 text-center text-xs text-neutral-400">{result.error || (result.status === "running" ? "Analyzing product and generating a new pose…" : "Queued")}</div>}</article>)}</div> : <div className="mt-6 flex flex-1 items-center justify-center rounded-2xl border border-dashed border-neutral-300 bg-white text-center text-sm text-neutral-400">Your generated campaign images will appear here.</div>}
        </section>
      </div>
      {error ? <div className="fixed bottom-6 right-6 max-w-sm rounded-lg bg-red-600 px-4 py-3 text-sm text-white shadow-lg">{error}<button className="ml-3" onClick={() => setError(null)}>×</button></div> : null}
    </main>
  );
}
