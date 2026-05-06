"use client";

import { useMemo, useRef, useState } from "react";
import StudioHeader from "@/components/StudioHeader";
import ImageLightbox, { ZoomButton } from "@/components/ImageLightbox";
import type { UploadedImage } from "@/components/types";
import { resizeIfNeeded } from "@/lib/image-resize";

type TechpackTable = {
  columns: string[];
  rows: string[][];
};

type TechpackSection = {
  heading: string;
  body?: string;
  bullets?: string[];
  table?: TechpackTable;
};

type TechpackPage = {
  pageNumber: number;
  title: string;
  summary?: string;
  sections: TechpackSection[];
};

type TechpackResult = {
  styleName: string;
  styleNumber: string;
  season: string;
  category: string;
  baseSize: string;
  sizeRange: string;
  dateCreated: string;
  pages: TechpackPage[];
};

type MetaField =
  | "styleName"
  | "styleNumber"
  | "season"
  | "category"
  | "baseSize"
  | "sizeRange"
  | "designerName"
  | "contact"
  | "seamAllowance"
  | "colorwayCount"
  | "notes";

type TechpackMeta = Record<MetaField, string>;

const IconUpload = (
  <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
    <path d="M10 2a1 1 0 01.7.29l3 3a1 1 0 11-1.4 1.42L11 5.41V13a1 1 0 11-2 0V5.41L7.7 6.71A1 1 0 016.3 5.29l3-3A1 1 0 0110 2z" />
    <path d="M4 12a1 1 0 011 1v2h10v-2a1 1 0 112 0v2a2 2 0 01-2 2H5a2 2 0 01-2-2v-2a1 1 0 011-1z" />
  </svg>
);

const IconSparkle = (
  <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
    <path d="M10 2a.75.75 0 01.7.48l1.22 3.15a2 2 0 001.15 1.15l3.15 1.22a.75.75 0 010 1.4l-3.15 1.22a2 2 0 00-1.15 1.15l-1.22 3.15a.75.75 0 01-1.4 0l-1.22-3.15a2 2 0 00-1.15-1.15L3.78 9.4a.75.75 0 010-1.4l3.15-1.22a2 2 0 001.15-1.15L9.3 2.48A.75.75 0 0110 2z" />
  </svg>
);

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

const initialMeta: TechpackMeta = {
  styleName: "",
  styleNumber: "",
  season: "Fall/Winter 2026",
  category: "Women's apparel",
  baseSize: "Women's S",
  sizeRange: "XS, S, M, L, XL",
  designerName: "",
  contact: "",
  seamAllowance: "1 cm seam allowance unless otherwise stated",
  colorwayCount: "3",
  notes: "",
};

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

function hasImageFiles(e: React.DragEvent): boolean {
  return Array.from(e.dataTransfer.items).some((item) => item.type.startsWith("image/"));
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function isTbc(value: string): boolean {
  return /\b(TBC|proposed|missing|not visible|placeholder)\b/i.test(value);
}

function fileSafeName(value: string): string {
  return (value || "davidani-techpack")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function sectionToHtml(section: TechpackSection): string {
  const body = section.body ? `<p>${escapeHtml(section.body)}</p>` : "";
  const bullets = section.bullets?.length
    ? `<ul>${section.bullets
        .map((bullet) => `<li class="${isTbc(bullet) ? "tbc" : ""}">${escapeHtml(bullet)}</li>`)
        .join("")}</ul>`
    : "";
  const table = section.table
    ? `<table><thead><tr>${section.table.columns
        .map((column) => `<th>${escapeHtml(column)}</th>`)
        .join("")}</tr></thead><tbody>${section.table.rows
        .map(
          (row) =>
            `<tr>${row
              .map((cell) => `<td class="${isTbc(cell) ? "tbc" : ""}">${escapeHtml(cell)}</td>`)
              .join("")}</tr>`
        )
        .join("")}</tbody></table>`
    : "";
  return `<section><h3>${escapeHtml(section.heading)}</h3>${body}${bullets}${table}</section>`;
}

function techpackToHtml(techpack: TechpackResult): string {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>${escapeHtml(techpack.styleNumber)} Tech Pack</title>
<style>
  body { margin: 0; background: #f4f0e8; color: #1c1814; font-family: Arial, Helvetica, sans-serif; }
  .page { width: 210mm; min-height: 297mm; margin: 16px auto; padding: 16mm; box-sizing: border-box; background: #fffdf8; border: 1px solid #d8d1c7; page-break-after: always; }
  header { display: flex; justify-content: space-between; gap: 24px; border-bottom: 2px solid #1c1814; padding-bottom: 12px; margin-bottom: 16px; }
  h1 { margin: 0; font-size: 22px; letter-spacing: .08em; text-transform: uppercase; }
  h2 { margin: 0; font-size: 13px; color: #766f66; text-transform: uppercase; letter-spacing: .18em; }
  h3 { margin: 18px 0 8px; font-size: 12px; text-transform: uppercase; letter-spacing: .16em; }
  p, li { font-size: 11px; line-height: 1.45; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 9px; }
  th, td { border: 1px solid #cfc7bc; padding: 6px; text-align: left; vertical-align: top; }
  th { background: #ebe4d8; text-transform: uppercase; letter-spacing: .08em; }
  .tbc { color: #b42318; font-weight: 700; }
  .meta { font-size: 11px; color: #766f66; }
  @media print { body { background: white; } .page { margin: 0; border: 0; } }
</style>
</head>
<body>
${techpack.pages
  .map(
    (page) => `<article class="page">
  <header>
    <div>
      <h2>Davi&amp;Dani Technical Pack</h2>
      <h1>${escapeHtml(page.title)}</h1>
    </div>
    <div class="meta">
      <div>Style: ${escapeHtml(techpack.styleName)}</div>
      <div>Style #: ${escapeHtml(techpack.styleNumber)}</div>
      <div>Season: ${escapeHtml(techpack.season)}</div>
      <div>Page ${page.pageNumber} of 7</div>
    </div>
  </header>
  ${page.summary ? `<p><strong>Summary:</strong> ${escapeHtml(page.summary)}</p>` : ""}
  ${page.sections.map(sectionToHtml).join("")}
</article>`
  )
  .join("")}
</body>
</html>`;
}

function TechpackTableView({ table }: { table: TechpackTable }) {
  return (
    <div className="mt-3 overflow-x-auto rounded-lg border border-neutral-200">
      <table className="min-w-full border-collapse text-left text-[11px]">
        <thead className="bg-neutral-100">
          <tr>
            {table.columns.map((column) => (
              <th
                key={column}
                className="border-b border-r border-neutral-200 px-3 py-2 font-semibold uppercase tracking-wider text-neutral-600 last:border-r-0"
              >
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row, index) => (
            <tr key={index} className="bg-white odd:bg-neutral-50/40">
              {table.columns.map((column, columnIndex) => {
                const cell = row[columnIndex] ?? "";
                return (
                  <td
                    key={`${index}-${column}`}
                    className={`border-b border-r border-neutral-200 px-3 py-2 align-top last:border-r-0 ${
                      isTbc(cell) ? "font-semibold text-red-700" : "text-neutral-700"
                    }`}
                  >
                    {cell}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TechpackPageView({ page, techpack }: { page: TechpackPage; techpack: TechpackResult }) {
  return (
    <article className="mx-auto mb-5 max-w-5xl rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-neutral-200 pb-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-neutral-500">
            Davi&amp;Dani Technical Pack
          </p>
          <h2 className="mt-1 text-xl font-semibold text-neutral-950">{page.title}</h2>
          {page.summary ? (
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-neutral-500">
              {page.summary}
            </p>
          ) : null}
        </div>
        <div className="rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-right text-[11px] text-neutral-500">
          <div>{techpack.styleNumber}</div>
          <div>{techpack.season}</div>
          <div>Page {page.pageNumber} of 7</div>
        </div>
      </header>

      <div className="space-y-5 pt-5">
        {page.sections.map((section, index) => (
          <section key={`${section.heading}-${index}`}>
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-neutral-500">
              {section.heading}
            </h3>
            {section.body ? (
              <p
                className={`mt-2 text-sm leading-relaxed ${
                  isTbc(section.body) ? "font-semibold text-red-700" : "text-neutral-700"
                }`}
              >
                {section.body}
              </p>
            ) : null}
            {section.bullets?.length ? (
              <ul className="mt-2 grid gap-1.5 text-sm leading-relaxed text-neutral-700 md:grid-cols-2">
                {section.bullets.map((bullet) => (
                  <li
                    key={bullet}
                    className={`rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 ${
                      isTbc(bullet) ? "font-semibold text-red-700" : ""
                    }`}
                  >
                    {bullet}
                  </li>
                ))}
              </ul>
            ) : null}
            {section.table ? <TechpackTableView table={section.table} /> : null}
          </section>
        ))}
      </div>
    </article>
  );
}

export default function TechpackStudioClient() {
  const primaryInputRef = useRef<HTMLInputElement>(null);
  const supportInputRef = useRef<HTMLInputElement>(null);
  const [primaryUploads, setPrimaryUploads] = useState<UploadedImage[]>([]);
  const [selectedUrl, setSelectedUrl] = useState<string | null>(null);
  const [supportUploads, setSupportUploads] = useState<UploadedImage[]>([]);
  const [meta, setMeta] = useState<TechpackMeta>(initialMeta);
  const [uploading, setUploading] = useState<"primary" | "support" | null>(null);
  const [generating, setGenerating] = useState(false);
  const [dragTarget, setDragTarget] = useState<"primary" | "support" | null>(null);
  const [techpack, setTechpack] = useState<TechpackResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const selectedUpload = useMemo(
    () => primaryUploads.find((item) => item.url === selectedUrl) ?? null,
    [primaryUploads, selectedUrl]
  );

  function updateMeta(field: MetaField, value: string) {
    setMeta((current) => ({ ...current, [field]: value }));
  }

  async function addFiles(files: FileList, kind: "primary" | "support") {
    setUploading(kind);
    setError(null);
    try {
      const resized = await Promise.all(Array.from(files).map((file) => resizeIfNeeded(file)));
      const form = new FormData();
      resized.forEach((file) => form.append("files", file));
      const data = await fetchJson("Upload", "/api/upload", { method: "POST", body: form });
      const added: UploadedImage[] = data.uploads ?? [];
      if (!added.length) throw new Error("Upload succeeded but no image URL returned.");
      if (kind === "primary") {
        setPrimaryUploads((list) => [...list, ...added]);
        setSelectedUrl(added[0].url);
        setTechpack(null);
      } else {
        setSupportUploads((list) => [...list, ...added]);
      }
    } catch (err: any) {
      setError(err?.message || "Upload failed.");
    } finally {
      setUploading(null);
    }
  }

  function removePrimary(url: string) {
    setPrimaryUploads((list) => list.filter((item) => item.url !== url));
    if (selectedUrl === url) {
      const remaining = primaryUploads.filter((item) => item.url !== url);
      setSelectedUrl(remaining[0]?.url ?? null);
      setTechpack(null);
    }
  }

  async function generate() {
    if (!selectedUrl) return;
    setGenerating(true);
    setError(null);
    setCopied(false);
    try {
      const data = await fetchJson("Generate techpack", "/api/techpack/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageUrl: selectedUrl,
          supportImageUrls: supportUploads.map((item) => item.url),
          ...meta,
        }),
      });
      setTechpack(data.techpack);
    } catch (err: any) {
      setError(err?.message || "Techpack generation failed.");
    } finally {
      setGenerating(false);
    }
  }

  function downloadHtml() {
    if (!techpack) return;
    const html = techpackToHtml(techpack);
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${fileSafeName(`${techpack.styleNumber}-${techpack.styleName}`)}-techpack.html`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function copyPlainText() {
    if (!techpack) return;
    const text = techpack.pages
      .map((page) =>
        [
          page.title,
          page.summary,
          ...page.sections.flatMap((section) => [
            section.heading,
            section.body || "",
            ...(section.bullets || []),
            section.table
              ? [
                  section.table.columns.join("\t"),
                  ...section.table.rows.map((row) => row.join("\t")),
                ].join("\n")
              : "",
          ]),
        ]
          .filter(Boolean)
          .join("\n")
      )
      .join("\n\n");
    await navigator.clipboard.writeText(text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  }

  function printTechpack() {
    if (!techpack) return;
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(techpackToHtml(techpack));
    win.document.close();
    win.focus();
    window.setTimeout(() => win.print(), 500);
  }

  return (
    <main className="flex min-h-screen flex-col bg-neutral-50 lg:h-screen">
      <StudioHeader
        active="techpack"
        title="Techpack Studio"
        subtitle="Generate factory-ready 7-page garment tech packs from sketches, flats, or renders."
        metrics={[
          { label: "Pages", value: techpack?.pages.length ?? 0 },
          { label: "Active", value: uploading || generating ? 1 : 0 },
        ]}
      />

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <aside className="flex w-full shrink-0 flex-col overflow-y-auto border-b border-neutral-200 bg-white lg:w-[360px] lg:border-b-0 lg:border-r">
          <section
            className={`border-b border-neutral-100 p-5 ${dragTarget === "primary" ? "bg-brand-50" : ""}`}
            onDragEnter={(e) => {
              if (!hasImageFiles(e)) return;
              e.preventDefault();
              setDragTarget("primary");
            }}
            onDragOver={(e) => {
              if (!hasImageFiles(e)) return;
              e.preventDefault();
            }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragTarget(null);
            }}
            onDrop={(e) => {
              e.preventDefault();
              setDragTarget(null);
              if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files, "primary");
            }}
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-[11px] font-semibold uppercase tracking-widest text-neutral-700">
                Garment flat / render
              </h2>
              <span className="text-[10px] text-neutral-500">
                {primaryUploads.length ? `${primaryUploads.length} uploaded` : "Required"}
              </span>
            </div>
            <button
              type="button"
              onClick={() => primaryInputRef.current?.click()}
              disabled={!!uploading || generating}
              className={`flex aspect-[4/3] w-full items-center justify-center rounded-xl border border-dashed text-sm font-semibold transition hover:border-brand-500 hover:bg-brand-50 disabled:cursor-not-allowed disabled:opacity-60 ${
                dragTarget === "primary"
                  ? "border-brand-500 bg-brand-50 text-brand-700"
                  : "border-neutral-300 bg-neutral-50 text-neutral-600"
              }`}
            >
              {uploading === "primary" ? (
                <span className="inline-flex items-center gap-2">
                  <Spinner />
                  Uploading
                </span>
              ) : (
                <span className="inline-flex items-center gap-2">
                  {IconUpload}
                  Upload or drop garment
                </span>
              )}
            </button>
            <input
              ref={primaryInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.length) addFiles(e.target.files, "primary");
                e.currentTarget.value = "";
              }}
            />
            {primaryUploads.length ? (
              <div className="mt-4 grid grid-cols-3 gap-2">
                {primaryUploads.map((upload) => (
                  <div
                    key={upload.url}
                    className={`group relative aspect-square overflow-hidden rounded-lg border ${
                      upload.url === selectedUrl
                        ? "border-neutral-900 ring-2 ring-neutral-900/10"
                        : "border-neutral-200"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedUrl(upload.url);
                        setTechpack(null);
                      }}
                      className="block h-full w-full"
                    >
                      <img src={upload.url} alt={upload.name} className="h-full w-full object-cover" />
                    </button>
                    <ZoomButton className="absolute bottom-1 right-1" onClick={() => setPreviewSrc(upload.url)} />
                    <button
                      type="button"
                      onClick={() => removePrimary(upload.url)}
                      className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-white/90 text-xs text-neutral-500 opacity-0 shadow-sm transition hover:text-red-600 group-hover:opacity-100"
                    >
                      x
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
          </section>

          <section
            className={`border-b border-neutral-100 p-5 ${dragTarget === "support" ? "bg-brand-50" : ""}`}
            onDragEnter={(e) => {
              if (!hasImageFiles(e)) return;
              e.preventDefault();
              setDragTarget("support");
            }}
            onDragOver={(e) => {
              if (!hasImageFiles(e)) return;
              e.preventDefault();
            }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragTarget(null);
            }}
            onDrop={(e) => {
              e.preventDefault();
              setDragTarget(null);
              if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files, "support");
            }}
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-[11px] font-semibold uppercase tracking-widest text-neutral-700">
                Supporting assets
              </h2>
              <span className="text-[10px] text-neutral-500">{supportUploads.length} optional</span>
            </div>
            <button
              type="button"
              onClick={() => supportInputRef.current?.click()}
              disabled={!!uploading || generating}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-neutral-200 bg-white px-4 py-3 text-sm font-semibold text-neutral-700 transition hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {uploading === "support" ? <Spinner /> : IconUpload}
              Upload logos, trims, notes
            </button>
            <input
              ref={supportInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.length) addFiles(e.target.files, "support");
                e.currentTarget.value = "";
              }}
            />
            {supportUploads.length ? (
              <div className="mt-3 grid grid-cols-4 gap-2">
                {supportUploads.map((upload) => (
                  <div key={upload.url} className="group relative aspect-square overflow-hidden rounded-lg border border-neutral-200">
                    <button type="button" onClick={() => setPreviewSrc(upload.url)} className="block h-full w-full">
                      <img src={upload.url} alt={upload.name} className="h-full w-full object-cover" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setSupportUploads((list) => list.filter((item) => item.url !== upload.url))}
                      className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-white/90 text-xs text-neutral-500 opacity-0 shadow-sm transition hover:text-red-600 group-hover:opacity-100"
                    >
                      x
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
          </section>

          <section className="space-y-3 p-5">
            <h2 className="text-[11px] font-semibold uppercase tracking-widest text-neutral-700">
              Style details
            </h2>
            {[
              ["styleName", "Style name"],
              ["styleNumber", "Style number"],
              ["season", "Season"],
              ["category", "Category"],
              ["baseSize", "Base sample size"],
              ["sizeRange", "Size range"],
              ["designerName", "Designer"],
              ["contact", "Contact"],
              ["seamAllowance", "Seam allowance"],
              ["colorwayCount", "Colorway count"],
            ].map(([field, label]) => (
              <label key={field} className="block">
                <span className="text-[10px] font-semibold uppercase tracking-widest text-neutral-500">
                  {label}
                </span>
                <input
                  value={meta[field as MetaField]}
                  onChange={(e) => updateMeta(field as MetaField, e.target.value)}
                  className="mt-1 w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                  placeholder={label}
                />
              </label>
            ))}
            <label className="block">
              <span className="text-[10px] font-semibold uppercase tracking-widest text-neutral-500">
                Extra factory notes
              </span>
              <textarea
                value={meta.notes}
                onChange={(e) => updateMeta("notes", e.target.value)}
                rows={5}
                className="mt-1 w-full resize-none rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                placeholder="Fabric, trims, packaging, measurements, construction intentions, brand label notes..."
              />
            </label>
            <button
              type="button"
              onClick={generate}
              disabled={!selectedUrl || !!uploading || generating}
              className={`inline-flex w-full items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold shadow-sm transition disabled:cursor-not-allowed ${
                !selectedUrl || uploading || generating
                  ? "bg-neutral-300 text-neutral-500"
                  : "bg-gradient-to-b from-neutral-800 to-neutral-950 text-white hover:from-neutral-700 hover:to-neutral-900"
              }`}
            >
              {generating ? (
                <>
                  <Spinner />
                  Building tech pack
                </>
              ) : (
                <>
                  {IconSparkle}
                  Generate Tech Pack
                </>
              )}
            </button>
            {error ? (
              <div className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
                {error}
              </div>
            ) : null}
          </section>
        </aside>

        <section className="min-w-0 flex-1 overflow-y-auto bg-neutral-50 p-5">
          {techpack ? (
            <div>
              <div className="mb-5 rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-neutral-500">
                      Factory-ready draft
                    </p>
                    <h1 className="mt-1 text-2xl font-semibold text-neutral-950">
                      {techpack.styleName} - {techpack.styleNumber}
                    </h1>
                    <p className="mt-1 text-sm text-neutral-500">
                      {techpack.category} / {techpack.baseSize} / {techpack.season}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={copyPlainText}
                      className="rounded-xl border border-neutral-200 bg-white px-4 py-2 text-sm font-semibold text-neutral-700 hover:bg-neutral-50"
                    >
                      {copied ? "Copied" : "Copy text"}
                    </button>
                    <button
                      type="button"
                      onClick={printTechpack}
                      className="rounded-xl border border-neutral-200 bg-white px-4 py-2 text-sm font-semibold text-neutral-700 hover:bg-neutral-50"
                    >
                      Print / PDF
                    </button>
                    <button
                      type="button"
                      onClick={downloadHtml}
                      className="rounded-xl bg-neutral-950 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-800"
                    >
                      Download HTML
                    </button>
                  </div>
                </div>
              </div>
              {techpack.pages.map((page) => (
                <TechpackPageView key={page.pageNumber} page={page} techpack={techpack} />
              ))}
            </div>
          ) : (
            <div className="flex min-h-full items-center justify-center rounded-xl border border-dashed border-neutral-300 bg-white/60 p-10 text-center">
              <div className="max-w-md">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-neutral-100 text-neutral-500">
                  {IconSparkle}
                </div>
                <h1 className="mt-4 text-xl font-semibold text-neutral-950">
                  Upload a flat, sketch, or render
                </h1>
                <p className="mt-2 text-sm leading-relaxed text-neutral-500">
                  Techpack Studio will generate a 7-page Davi&amp;Dani manufacturing pack with
                  construction callouts, BOM, colorways, measurements, grading, labels, and
                  packaging.
                </p>
              </div>
            </div>
          )}
        </section>

        <aside className="hidden w-80 shrink-0 overflow-y-auto border-l border-neutral-200 bg-white p-5 xl:block">
          <h2 className="text-[11px] font-semibold uppercase tracking-widest text-neutral-700">
            Source preview
          </h2>
          <div className="mt-3 overflow-hidden rounded-xl border border-neutral-200 bg-neutral-50">
            {selectedUpload ? (
              <button type="button" onClick={() => setPreviewSrc(selectedUpload.url)} className="block w-full">
                <img src={selectedUpload.url} alt={selectedUpload.name} className="aspect-[4/5] w-full object-contain" />
              </button>
            ) : (
              <div className="flex aspect-[4/5] items-center justify-center text-xs text-neutral-400">
                No garment selected
              </div>
            )}
          </div>
          <div className="mt-4 rounded-xl border border-neutral-200 bg-neutral-50 p-4 text-sm leading-relaxed text-neutral-600">
            Missing or inferred fields are highlighted in red in the tech pack. Edit the left-side
            notes and regenerate when you have exact supplier, Pantone, measurement, or trim data.
          </div>
        </aside>
      </div>

      {previewSrc ? (
        <ImageLightbox src={previewSrc} alt="Techpack source preview" onClose={() => setPreviewSrc(null)} />
      ) : null}
    </main>
  );
}
