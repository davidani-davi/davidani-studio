"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import StudioHeader from "@/components/StudioHeader";
import ImageLightbox, { ZoomButton } from "@/components/ImageLightbox";
import type { UploadedImage } from "@/components/types";
import { MODELS, type ModelId, RESOLUTIONS } from "@/lib/models";
import { resizeIfNeeded } from "@/lib/image-resize";
import type { CadMode, CadSpec } from "@/lib/cad-prompts";
import CadScaleMeasure from "@/components/cad/CadScaleMeasure";
import CadTilingPreview from "@/components/cad/CadTilingPreview";
import CadExportPanel from "@/components/cad/CadExportPanel";

const REFS_KEY = "davidani_cad_refs_v1";

type ModeId = CadMode | "spec";

const MODE_OPTIONS: { id: ModeId; label: string; blurb: string }[] = [
  { id: "flat", label: "Flat Artwork Recovery", blurb: "Recover the flat printed artwork. No seamless tiling." },
  { id: "seamless", label: "Seamless Production CAD", blurb: "Perfectly tileable square repeat. Infers hidden artwork." },
  { id: "spec", label: "Spec Analysis", blurb: "Text spec: repeat type, colors, motifs, technique." },
];

async function fetchJson(label: string, input: string, init?: RequestInit): Promise<any> {
  const res = await fetch(input, init);
  const raw = await res.text();
  let data: any;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    throw new Error(`${label}: server returned non-JSON (${res.status})`);
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

function hasImageFiles(e: React.DragEvent): boolean {
  return Array.from(e.dataTransfer.items).some(
    (item) => item.kind === "file" && item.type.startsWith("image/")
  );
}

export default function CadExtractorClient() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<ModeId>("flat");
  // Nano Banana 2 recovers clean flat CAD artwork; Seedream 4.5 tends to render
  // a "photo of draped fabric" and hallucinate motifs (smoke-tested 2026-06-30).
  const [modelId, setModelId] = useState<ModelId>("nano-banana");
  const [resolution, setResolution] = useState<string>("2K");
  const [notes, setNotes] = useState<string>("");

  const [refs, setRefs] = useState<UploadedImage[]>([]);
  const [selectedRefUrls, setSelectedRefUrls] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);

  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [resultUrls, setResultUrls] = useState<string[]>([]);
  const [spec, setSpec] = useState<CadSpec | null>(null);
  const [scale, setScale] = useState<{ repeatCm: number; dpi: number } | null>(null);
  const [colorway, setColorway] = useState<CadSpec | null>(null);

  // Scale is measured on the garment photo, not the result tile. Reset it only
  // when the primary selected photo changes — NOT on re-roll (which regenerates
  // the tile from the same photo), so the user keeps their measurement.
  const primaryRef = selectedRefUrls[0];
  useEffect(() => {
    setScale(null);
  }, [primaryRef]);
  const [previewIdx, setPreviewIdx] = useState<number | null>(null);
  const [refPreviewSrc, setRefPreviewSrc] = useState<string | null>(null);

  const activeMode = useMemo(() => MODE_OPTIONS.find((m) => m.id === mode)!, [mode]);
  const isSpec = mode === "spec";

  useEffect(() => {
    if (mode === "spec") return;
    if (!resultUrls.length || !selectedRefUrls.length) {
      setColorway(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchJson("Colorway", "/api/cad-spec", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageUrls: selectedRefUrls }),
        });
        if (!cancelled) setColorway(data.spec as CadSpec);
      } catch {
        if (!cancelled) setColorway(null);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resultUrls, selectedRefUrls, mode]);

  // Hydrate the reference library from localStorage on mount, then persist it
  // whenever it changes — mirrors ImagePlaygroundClient (SSR-safe: the read
  // happens in an effect, never during render).
  useEffect(() => {
    try {
      const r = localStorage.getItem(REFS_KEY);
      if (r) {
        const parsed = JSON.parse(r) as UploadedImage[];
        if (Array.isArray(parsed)) setRefs(parsed);
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(REFS_KEY, JSON.stringify(refs));
    } catch {
      /* ignore */
    }
  }, [refs]);

  async function addFiles(files: FileList) {
    setUploading(true);
    setError(null);
    try {
      const resized = await Promise.all(Array.from(files).map((f) => resizeIfNeeded(f)));
      const form = new FormData();
      resized.forEach((f) => form.append("files", f));
      const data = await fetchJson("Upload", "/api/upload", { method: "POST", body: form });
      const added: UploadedImage[] = data.uploads ?? [];
      if (!added.length) throw new Error("Upload returned no URLs");
      setRefs((list) => [...added, ...list]);
      setSelectedRefUrls((cur) => Array.from(new Set([...added.map((u) => u.url), ...cur])));
    } catch (e: any) {
      setError(e?.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  function toggleRef(url: string) {
    setSelectedRefUrls((cur) => (cur.includes(url) ? cur.filter((u) => u !== url) : [...cur, url]));
  }

  function removeRef(url: string) {
    setRefs((list) => list.filter((r) => r.url !== url));
    setSelectedRefUrls((cur) => cur.filter((u) => u !== url));
  }

  async function run() {
    if (!selectedRefUrls.length) {
      setError("Select at least one garment photo");
      return;
    }
    setError(null);
    setRunning(true);
    setResultUrls([]);
    setSpec(null);
    try {
      if (isSpec) {
        const data = await fetchJson("Spec analysis", "/api/cad-spec", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageUrls: selectedRefUrls }),
        });
        setSpec(data.spec as CadSpec);
      } else {
        const data = await fetchJson("CAD extract", "/api/cad-extract", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            modelId,
            mode,
            imageUrls: selectedRefUrls,
            notes,
            resolution,
            format: "png",
            numImages: 1,
          }),
        });
        const urls: string[] = data.images?.map((i: any) => i.url).filter(Boolean) ?? [];
        if (!urls.length) throw new Error("No artwork returned");
        setResultUrls(urls);
      }
    } catch (e: any) {
      setError(e?.message || "Run failed");
    } finally {
      setRunning(false);
    }
  }

  return (
    <main className="flex min-h-screen flex-col bg-neutral-50 lg:h-screen">
      <StudioHeader
        active="cad"
        title="CAD Pattern Extractor"
        subtitle="Recover production-ready textile CAD artwork from garment photos."
        metrics={[
          { label: "Refs", value: selectedRefUrls.length },
          { label: "Active", value: running ? 1 : 0 },
        ]}
      />

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {/* Settings rail */}
        <aside className="flex w-full shrink-0 flex-col gap-5 overflow-y-auto border-b border-neutral-200 bg-white p-5 lg:w-80 lg:border-b-0 lg:border-r">
          <section>
            <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-neutral-700">
              Mode
            </h2>
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value as ModeId)}
              className="w-full rounded-lg border border-neutral-200 bg-white px-2.5 py-2 text-xs outline-none focus:border-brand-500"
            >
              {MODE_OPTIONS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
            <p className="mt-2 text-[11px] leading-snug text-neutral-500">{activeMode.blurb}</p>
          </section>

          {!isSpec ? (
            <section>
              <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-neutral-700">
                Settings
              </h2>
              <div className="space-y-3">
                <label className="block">
                  <span className="mb-1 block text-[10px] font-semibold uppercase tracking-widest text-neutral-500">
                    Model
                  </span>
                  <select
                    value={modelId}
                    onChange={(e) => setModelId(e.target.value as ModelId)}
                    className="w-full rounded-lg border border-neutral-200 bg-white px-2.5 py-2 text-xs outline-none focus:border-brand-500"
                  >
                    {Object.values(MODELS).map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.label} ({m.badge})
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1 block text-[10px] font-semibold uppercase tracking-widest text-neutral-500">
                    Quality
                  </span>
                  <select
                    value={resolution}
                    onChange={(e) => setResolution(e.target.value)}
                    className="w-full rounded-lg border border-neutral-200 bg-white px-2.5 py-2 text-xs outline-none focus:border-brand-500"
                  >
                    {RESOLUTIONS.map((r) => (
                      <option key={r.value} value={r.value}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                </label>
                <p className="text-[10px] leading-snug text-neutral-400">
                  Output is locked to a 2048×2048 square repeat tile.
                </p>
              </div>
            </section>
          ) : null}

          <section
            onDragEnter={(e) => {
              if (!hasImageFiles(e)) return;
              e.preventDefault();
              setDragging(true);
            }}
            onDragOver={(e) => {
              if (!hasImageFiles(e)) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = "copy";
            }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false);
            }}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
            }}
            className={`-m-2 rounded-lg p-2 transition ${dragging ? "bg-brand-50/70 ring-2 ring-brand-400" : ""}`}
          >
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-[11px] font-semibold uppercase tracking-widest text-neutral-700">
                Garment Photos
              </h2>
              <span className="text-[10px] text-neutral-500">
                {selectedRefUrls.length}/{refs.length} selected
              </span>
            </div>

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className={`mb-3 flex w-full items-center justify-center rounded-lg border border-dashed px-3 py-2 text-xs font-semibold transition hover:border-brand-400 hover:bg-brand-50 hover:text-brand-700 disabled:opacity-60 ${
                dragging ? "border-brand-500 bg-brand-50 text-brand-700" : "border-neutral-300 bg-neutral-50 text-neutral-600"
              }`}
            >
              {uploading ? (
                <span className="inline-flex items-center gap-2">
                  <Spinner /> Uploading
                </span>
              ) : dragging ? (
                "Drop to upload"
              ) : (
                "Upload photos or drag & drop"
              )}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.length) addFiles(e.target.files);
                e.currentTarget.value = "";
              }}
            />

            {refs.length > 0 ? (
              <div className="grid grid-cols-3 gap-2">
                {refs.map((u) => {
                  const selected = selectedRefUrls.includes(u.url);
                  return (
                    <div
                      key={u.url}
                      className={`group relative aspect-square overflow-hidden rounded-lg border ${
                        selected ? "border-neutral-900 ring-2 ring-neutral-900/10" : "border-neutral-200"
                      }`}
                    >
                      <button type="button" onClick={() => toggleRef(u.url)} className="block h-full w-full">
                        <img src={u.url} alt={u.name} className="h-full w-full object-cover" />
                      </button>
                      <ZoomButton className="absolute bottom-1 right-1" onClick={() => setRefPreviewSrc(u.url)} />
                      <button
                        type="button"
                        onClick={() => removeRef(u.url)}
                        className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-white/90 text-xs text-neutral-500 opacity-0 shadow-sm transition hover:text-red-600 group-hover:opacity-100"
                      >
                        ×
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-[11px] text-neutral-500">
                Upload one or more photos of the same garment. All selected photos are combined into one
                reconstruction.
              </p>
            )}
          </section>
        </aside>

        {/* Center: notes + run */}
        <section className="flex min-w-0 flex-1 flex-col border-b border-neutral-200 bg-white lg:border-b-0 lg:border-r">
          <div className="border-b border-neutral-200 px-6 py-4">
            <h1 className="text-sm font-semibold text-neutral-900">{activeMode.label}</h1>
            <p className="text-[11px] text-neutral-500">{activeMode.blurb}</p>
          </div>

          <div className="flex min-h-0 flex-1 flex-col p-6">
            {!isSpec ? (
              <label className="flex min-h-0 flex-1 flex-col">
                <span className="mb-1 block text-[10px] font-semibold uppercase tracking-widest text-neutral-500">
                  Extraction notes (optional)
                </span>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder={`e.g. base cloth is cream\nignore the chest pocket flap\nthe stars are screen-printed and intentionally cracked`}
                  disabled={running}
                  className="prompt-mono min-h-0 flex-1 resize-none rounded-lg border border-neutral-200 px-4 py-3 text-[13px] leading-relaxed outline-none placeholder:text-neutral-400 focus:border-brand-500 disabled:bg-neutral-50"
                />
              </label>
            ) : (
              <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-neutral-200 text-center text-xs text-neutral-400">
                Spec Analysis reads the primary selected photo and returns a textile production spec.
              </div>
            )}
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-neutral-200 bg-neutral-50 px-6 py-4">
            <span className="text-xs text-neutral-500">
              {selectedRefUrls.length
                ? `${selectedRefUrls.length} photo${selectedRefUrls.length === 1 ? "" : "s"} selected`
                : "Select garment photos in the left rail"}
            </span>
            <button
              type="button"
              onClick={run}
              disabled={running || !selectedRefUrls.length}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-b from-neutral-800 to-neutral-950 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:from-neutral-700 hover:to-neutral-900 hover:shadow-md active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-neutral-300 disabled:bg-none disabled:text-neutral-500"
            >
              {running ? (
                <span className="inline-flex items-center gap-2">
                  <Spinner /> {isSpec ? "Analyzing" : "Extracting"}
                </span>
              ) : isSpec ? (
                "Analyze Spec"
              ) : (
                "Extract CAD"
              )}
            </button>
          </div>
        </section>

        {/* Results */}
        <aside className="flex w-full shrink-0 flex-col overflow-y-auto bg-neutral-50 lg:w-[28rem]">
          <div className="border-b border-neutral-200 bg-white px-5 py-4">
            <h2 className="text-sm font-semibold text-neutral-900">Result</h2>
            <p className="text-[11px] text-neutral-500">
              {isSpec ? "Textile production spec" : "Recovered flat CAD artwork"}
            </p>
          </div>

          <div className="flex-1 space-y-3 p-4">
            {isSpec ? (
              spec ? (
                <SpecCard spec={spec} />
              ) : (
                <div className="flex h-40 items-center justify-center text-xs text-neutral-400">
                  {running ? "Analyzing…" : "Run Spec Analysis to see results"}
                </div>
              )
            ) : resultUrls.length ? (
              <div className="grid grid-cols-1 gap-3">
                {resultUrls.map((url, i) => (
                  <button
                    key={`${url}-${i}`}
                    type="button"
                    onClick={() => setPreviewIdx(i)}
                    className="block overflow-hidden rounded-lg border border-neutral-200 transition hover:border-brand-500"
                  >
                    <img src={url} alt="Recovered CAD artwork" className="block h-auto w-full" />
                  </button>
                ))}
              </div>
            ) : (
              <div className="flex h-40 items-center justify-center text-xs text-neutral-400">
                {running ? "Extracting…" : "Run extraction to see artwork"}
              </div>
            )}
            {!isSpec && resultUrls.length ? (
              <div className="space-y-5 border-t border-neutral-200 pt-4">
                <div>
                  <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-neutral-700">
                    Scale (measure on the garment photo)
                  </h3>
                  {selectedRefUrls.length ? (
                    <CadScaleMeasure imageUrl={selectedRefUrls[0]} onChange={setScale} />
                  ) : (
                    <p className="text-[11px] text-neutral-400">Select a garment photo to measure scale.</p>
                  )}
                </div>
                <CadTilingPreview imageUrl={resultUrls[0]} onReroll={run} rerolling={running} />
                <CadExportPanel imageUrl={resultUrls[0]} scale={scale} spec={colorway} />
              </div>
            ) : null}
          </div>
        </aside>
      </div>

      {previewIdx !== null && resultUrls[previewIdx] ? (
        <ImageLightbox
          src={resultUrls[previewIdx]}
          alt={`CAD result ${previewIdx + 1} of ${resultUrls.length}`}
          images={resultUrls}
          currentIndex={previewIdx}
          onIndexChange={setPreviewIdx}
          onClose={() => setPreviewIdx(null)}
        />
      ) : null}

      {refPreviewSrc ? (
        <ImageLightbox src={refPreviewSrc} alt="Reference preview" onClose={() => setRefPreviewSrc(null)} />
      ) : null}

      {error ? (
        <div className="fixed bottom-6 right-6 max-w-sm rounded-lg bg-red-600 px-4 py-3 text-sm text-white shadow-lg">
          <div className="flex items-start gap-2">
            <span className="font-semibold">Error:</span>
            <span className="flex-1">{error}</span>
            <button onClick={() => setError(null)} className="opacity-70 hover:opacity-100">
              ×
            </button>
          </div>
        </div>
      ) : null}
    </main>
  );
}

function SpecCard({ spec }: { spec: CadSpec }) {
  return (
    <div className="space-y-4 rounded-lg border border-neutral-200 bg-white p-4 text-xs text-neutral-700">
      <Row label="Repeat type" value={spec.repeatType} />
      <Row label="Direction" value={spec.directional} />
      <Row label="Colors" value={String(spec.colorCount)} />
      <Row label="Repeat size" value={spec.repeatDimensions} />
      {spec.palette.length ? (
        <div>
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-neutral-500">Palette</p>
          <div className="flex flex-wrap gap-2">
            {spec.palette.map((c, i) => (
              <span key={`${c.hex}-${i}`} className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 px-2 py-1">
                <span className="h-3 w-3 rounded-full border border-neutral-300" style={{ backgroundColor: c.hex }} />
                <span className="font-mono text-[10px]">{c.hex}</span>
                {c.name ? <span className="text-neutral-500">{c.name}</span> : null}
              </span>
            ))}
          </div>
        </div>
      ) : null}
      {spec.motifs.length ? (
        <div>
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-neutral-500">Motifs</p>
          <ul className="space-y-1">
            {spec.motifs.map((m, i) => (
              <li key={`${m.name}-${i}`} className="flex justify-between gap-2">
                <span>{m.name}</span>
                <span className="text-neutral-400">{m.count}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {spec.technique.length ? (
        <div>
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-neutral-500">Technique</p>
          <div className="flex flex-wrap gap-1.5">
            {spec.technique.map((t, i) => (
              <span key={`${t}-${i}`} className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] text-neutral-600">
                {t}
              </span>
            ))}
          </div>
        </div>
      ) : null}
      {spec.notes ? <p className="border-t border-neutral-100 pt-3 text-[11px] leading-snug text-neutral-500">{spec.notes}</p> : null}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-[10px] font-semibold uppercase tracking-widest text-neutral-500">{label}</span>
      <span className="text-right">{value}</span>
    </div>
  );
}
