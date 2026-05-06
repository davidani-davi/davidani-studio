"use client";

import { useRef, useState } from "react";
import { ASPECT_RATIOS, FORMATS, MODELS, RESOLUTIONS, type ModelId } from "@/lib/models";
import type { OverlayPlacement } from "@/lib/fal";
import type { ProductShotReference } from "@/lib/product-shot-references";
import type { UploadedImage } from "./types";
import ImageLightbox, { ZoomButton } from "./ImageLightbox";

interface Props {
  modelId: ModelId;
  onModelChange: (m: ModelId) => void;
  aspect: string;
  onAspectChange: (v: string) => void;
  resolution: string;
  onResolutionChange: (v: string) => void;
  format: "png" | "jpeg";
  onFormatChange: (v: "png" | "jpeg") => void;
  uploads: UploadedImage[];
  frontIntakeUrl: string | null;
  backIntakeUrl: string | null;
  onSetFrontIntake: (url: string | null) => void;
  onSetBackIntake: (url: string | null) => void;
  onAddFiles: (files: FileList, preferredSlot?: "front" | "back") => void;
  onRemoveUpload: (url: string) => void;

  backgroundColor: string;
  onBackgroundColorChange: (v: string) => void;

  colorName: string;
  onColorNameChange: (v: string) => void;
  styleNumber: string;
  onStyleNumberChange: (v: string) => void;
  showName: boolean;
  onShowNameChange: (v: boolean) => void;
  showNumber: boolean;
  onShowNumberChange: (v: boolean) => void;
  overlayPlacement: OverlayPlacement;
  onOverlayPlacementChange: (v: OverlayPlacement) => void;
  fontFamily: string;
  onFontFamilyChange: (v: string) => void;
  fontSize: number;
  onFontSizeChange: (v: number) => void;

  /* Style reference (image 2) — Image Studio only. Product shot presets come
     from public/product-shots unless the user supplies a replacement URL. */
  referenceImageUrl: string | null;
  /** Static preview path shown when no custom reference has been uploaded. */
  defaultReferencePreview: string;
  productShotReferences: ProductShotReference[];
  selectedProductShotPath: string;
  onProductShotSelect: (path: string) => void;
  onReferenceReplace: (file: File) => void;
  onReferenceReset: () => void;
  referenceUploading: boolean;
}

const BG_PRESETS: { hex: string; label: string }[] = [
  { hex: "#edeeee", label: "Soft Gray" },
  { hex: "#f8ebdc", label: "Warm Cream" },
  { hex: "#ffffff", label: "Pure White" },
];

const PLACEMENTS: { value: OverlayPlacement; label: string }[] = [
  { value: "top-left", label: "TL" },
  { value: "top-center", label: "TC" },
  { value: "top-right", label: "TR" },
  { value: "bottom-left", label: "BL" },
  { value: "bottom-center", label: "BC" },
  { value: "bottom-right", label: "BR" },
];

const FONT_FAMILIES: string[] = [
  "DM Sans",
  "Inter",
  "Helvetica",
  "Arial",
  "Futura",
  "Georgia",
  "Times New Roman",
  "Courier New",
];

function isValidHex(v: string): boolean {
  return /^#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/.test(v.trim());
}

/** Expand shorthand hex (#abc) to full form (#aabbcc) so <input type=color> is happy. */
function toFullHex(v: string): string {
  const trimmed = v.trim();
  if (/^#[0-9a-fA-F]{3}$/.test(trimmed)) {
    const [, r, g, b] = trimmed.match(/^#([0-9a-fA-F])([0-9a-fA-F])([0-9a-fA-F])$/)!;
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  return isValidHex(trimmed) ? trimmed : "#ffffff";
}

/* ---------- Reusable section header ---------- */

function SectionHeader({
  icon,
  title,
  hint,
  collapsible,
  open,
  onToggle,
}: {
  icon: React.ReactNode;
  title: string;
  hint?: string;
  collapsible?: boolean;
  open?: boolean;
  onToggle?: () => void;
}) {
  const content = (
    <div className="flex w-full items-center justify-between">
      <div className="flex items-center gap-2">
        <span className="text-neutral-400">{icon}</span>
        <h3 className="text-[11px] font-semibold uppercase tracking-widest text-neutral-700">
          {title}
        </h3>
      </div>
      <div className="flex items-center gap-2">
        {hint && <span className="text-[10px] text-neutral-500">{hint}</span>}
        {collapsible && (
          <svg
            viewBox="0 0 20 20"
            fill="currentColor"
            className={`h-4 w-4 text-neutral-400 transition ${
              open ? "rotate-180" : ""
            }`}
          >
            <path d="M5.23 7.21a.75.75 0 011.06.02L10 11.06l3.71-3.83a.75.75 0 111.08 1.04l-4.24 4.38a.75.75 0 01-1.08 0L5.21 8.27a.75.75 0 01.02-1.06z" />
          </svg>
        )}
      </div>
    </div>
  );

  if (collapsible) {
    return (
      <button
        type="button"
        onClick={onToggle}
        className="group mb-3 flex w-full items-center justify-between rounded-md py-1 hover:bg-neutral-50"
      >
        {content}
      </button>
    );
  }
  return <div className="mb-3">{content}</div>;
}

/* ---------- Icons (inline SVG, no dep) ---------- */

const IconCamera = (
  <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
    <path d="M6.5 3a1 1 0 00-.8.4L4.6 5H3a2 2 0 00-2 2v8a2 2 0 002 2h14a2 2 0 002-2V7a2 2 0 00-2-2h-1.6l-1.1-1.6a1 1 0 00-.8-.4h-7zM10 8.5a3 3 0 110 6 3 3 0 010-6z" />
  </svg>
);
const IconSwatch = (
  <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
    <path d="M11 2a2 2 0 012 2v12a4 4 0 01-4 4 4 4 0 01-4-4V4a2 2 0 012-2h4zM9 15a1 1 0 100 2 1 1 0 000-2zm5-10.59l4.24 4.24a2 2 0 010 2.83l-5.66 5.66V4.41zM4 15h3v1a3 3 0 01-3 3V15z" />
  </svg>
);
const IconText = (
  <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
    <path d="M3 4a1 1 0 011-1h12a1 1 0 110 2h-5v12a1 1 0 11-2 0V5H4a1 1 0 01-1-1z" />
  </svg>
);
const IconSliders = (
  <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
    <path d="M5 4a1 1 0 011 1v2h9a1 1 0 110 2H6v6a1 1 0 11-2 0V9H3a1 1 0 110-2h1V5a1 1 0 011-1zm10 5a1 1 0 011 1v5h1a1 1 0 110 2h-1v1a1 1 0 11-2 0v-1h-1a1 1 0 110-2h1v-5a1 1 0 011-1z" />
  </svg>
);

/* ---------- Main component ---------- */

export default function Sidebar(p: Props) {
  const colorInputRef = useRef<HTMLInputElement>(null);
  const referenceInputRef = useRef<HTMLInputElement>(null);
  const [outputOpen, setOutputOpen] = useState(false);
  // Shared preview state — null = closed, URL = showing that image fullscreen.
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);
  const [draggingUploads, setDraggingUploads] = useState(false);
  const [draggingReference, setDraggingReference] = useState(false);

  const uploadCount = p.uploads.length;
  const intakeCount = Number(!!p.frontIntakeUrl) + Number(!!p.backIntakeUrl);
  const refHint =
    uploadCount === 0
      ? "Upload to start"
      : `${intakeCount} slot${intakeCount === 1 ? "" : "s"} set`;

  const hasCustomReference = !!p.referenceImageUrl;
  const referencePreviewSrc = p.referenceImageUrl || p.defaultReferencePreview;

  function hasImageFiles(e: React.DragEvent): boolean {
    return Array.from(e.dataTransfer.items).some((item) => item.type.startsWith("image/"));
  }

  function handleUploadDrop(e: React.DragEvent) {
    e.preventDefault();
    setDraggingUploads(false);
    if (e.dataTransfer.files.length) p.onAddFiles(e.dataTransfer.files);
  }

  function handleIntakeDrop(e: React.DragEvent, slot: "front" | "back") {
    e.preventDefault();
    e.stopPropagation();
    setDraggingUploads(false);
    if (e.dataTransfer.files.length) p.onAddFiles(e.dataTransfer.files, slot);
  }

  function handleReferenceDrop(e: React.DragEvent) {
    e.preventDefault();
    setDraggingReference(false);
    const file = Array.from(e.dataTransfer.files).find((f) => f.type.startsWith("image/"));
    if (file) p.onReferenceReplace(file);
  }

  return (
    <aside className="image-sidebar flex w-full shrink-0 flex-col overflow-y-auto border-b border-neutral-200 bg-white lg:h-full lg:border-b-0 lg:border-r">
      {/* ========== PRODUCT PHOTOS (image 1) ========== */}
      <section
        className={`image-sidebar-card border-b border-neutral-100 p-5 transition ${
          draggingUploads ? "bg-brand-50/70" : ""
        }`}
        onDragEnter={(e) => {
          if (!hasImageFiles(e)) return;
          e.preventDefault();
          setDraggingUploads(true);
        }}
        onDragOver={(e) => {
          if (!hasImageFiles(e)) return;
          e.preventDefault();
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
            setDraggingUploads(false);
          }
        }}
        onDrop={handleUploadDrop}
      >
        <SectionHeader icon={IconCamera} title="Product intake" hint={refHint} />

        <div className="grid gap-2">
          {[
            {
              key: "front" as const,
              title: "Front Product Image",
              status: "Required",
              cta: "Upload front",
              help: "Main product reference for front shots and contract mode.",
              url: p.frontIntakeUrl,
              onClear: p.onRemoveUpload,
            },
            {
              key: "back" as const,
              title: "Back Product Image",
              status: "Optional",
              cta: "Upload back",
              help: "Improves back accuracy when artwork or construction is hidden.",
              url: p.backIntakeUrl,
              onClear: p.onRemoveUpload,
            },
          ].map((slot) => (
            <div
              key={slot.key}
              className="rounded-xl border border-neutral-200 bg-neutral-50 p-2"
            >
              <div className="mb-2 flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-neutral-500">
                <span>{slot.title}</span>
                <span>{slot.status}</span>
              </div>
              {slot.url ? (
                <div
                  onDragOver={(e) => {
                    if (!hasImageFiles(e)) return;
                    e.preventDefault();
                  }}
                  onDrop={(e) => handleIntakeDrop(e, slot.key)}
                  className="group relative aspect-[4/3] overflow-hidden rounded-lg border border-brand-200 bg-white"
                >
                  <button
                    type="button"
                    onClick={() => setPreviewSrc(slot.url)}
                    className="absolute inset-0"
                    title={`Preview ${slot.title.toLowerCase()}`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={slot.url} alt={slot.title} className="h-full w-full object-cover" />
                  </button>
                  <button
                    type="button"
                    onClick={() => slot.url && slot.onClear(slot.url)}
                    className="absolute left-2 top-2 rounded-full bg-black/70 px-2 py-0.5 text-[10px] font-semibold text-white opacity-0 transition group-hover:opacity-100"
                    title={`Clear ${slot.title.toLowerCase()}`}
                  >
                    Remove
                  </button>
                  <ZoomButton
                    onClick={() => setPreviewSrc(slot.url)}
                    title="Preview at full size"
                    className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100"
                  />
                </div>
              ) : (
                <label
                  onDragOver={(e) => {
                    if (!hasImageFiles(e)) return;
                    e.preventDefault();
                  }}
                  onDrop={(e) => handleIntakeDrop(e, slot.key)}
                  className={`flex min-h-[112px] cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed text-center transition hover:border-brand-400 hover:bg-brand-50 hover:text-brand-600 ${
                    draggingUploads
                      ? "border-brand-500 bg-brand-50 text-brand-700"
                      : "border-neutral-300 bg-white text-neutral-400"
                  }`}
                >
                  <svg viewBox="0 0 20 20" fill="currentColor" className="mb-2 h-5 w-5">
                    <path d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" />
                  </svg>
                  <span className="text-xs font-semibold text-neutral-800">
                    {slot.cta}
                  </span>
                  <span className="mt-1 max-w-[220px] text-[10px] leading-relaxed text-neutral-500">
                    {slot.help}
                  </span>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files?.length) p.onAddFiles(e.target.files, slot.key);
                      e.currentTarget.value = "";
                    }}
                  />
                </label>
              )}
            </div>
          ))}
        </div>

        <div className="mt-3 grid grid-cols-3 gap-1.5 text-center text-[10px] font-medium text-neutral-500">
          <span className="rounded-full bg-neutral-50 px-2 py-1">1. Upload</span>
          <span className="rounded-full bg-neutral-50 px-2 py-1">2. Front/back</span>
          <span className="rounded-full bg-neutral-50 px-2 py-1">3. Export</span>
        </div>
      </section>

      {/* ========== STYLE REFERENCE (image 2) ========== */}
      <section
        className={`image-sidebar-card border-b border-neutral-100 p-5 transition ${
          draggingReference ? "bg-brand-50/70" : ""
        }`}
        onDragEnter={(e) => {
          if (!hasImageFiles(e)) return;
          e.preventDefault();
          setDraggingReference(true);
        }}
        onDragOver={(e) => {
          if (!hasImageFiles(e)) return;
          e.preventDefault();
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
            setDraggingReference(false);
          }
        }}
        onDrop={handleReferenceDrop}
      >
        <SectionHeader
          icon={IconCamera}
          title="Style reference"
          hint={hasCustomReference ? "Custom" : "Default"}
        />

        <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-2">
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => setPreviewSrc(referencePreviewSrc)}
            title="Preview at full size"
            className={`group relative aspect-square w-20 shrink-0 overflow-hidden rounded-lg border bg-neutral-50 transition hover:border-neutral-400 ${
              draggingReference ? "border-brand-500 ring-2 ring-brand-200" : "border-neutral-200"
            }`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={referencePreviewSrc}
              alt="Style reference"
              className="h-full w-full object-cover"
            />
            {hasCustomReference && (
              <span className="pointer-events-none absolute right-1 top-1 rounded-full bg-brand-600 px-1.5 py-0.5 text-[9px] font-bold text-white">
                Custom
              </span>
            )}
            <span className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition group-hover:bg-black/30 group-hover:opacity-100">
              <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5 text-white">
                <path d="M9 3a6 6 0 014.472 10.03l3.249 3.248a1 1 0 01-1.414 1.415l-3.249-3.249A6 6 0 119 3zm0 2a4 4 0 100 8 4 4 0 000-8zm-.5 1.75a.75.75 0 01.75.75V8.5h1a.75.75 0 010 1.5h-1v1a.75.75 0 01-1.5 0v-1h-1a.75.75 0 010-1.5h1V7.5a.75.75 0 01.75-.75z" />
              </svg>
            </span>
          </button>

          <div className="flex min-w-0 flex-1 flex-col justify-between">
            <p className="text-[11px] leading-snug text-neutral-500">
              Used as image 2 — the aesthetic (lighting, framing, pose) your
              output mimics.
            </p>
            <div className="mt-2 flex gap-1.5">
              <button
                type="button"
                onClick={() => referenceInputRef.current?.click()}
                disabled={p.referenceUploading}
                className="flex-1 rounded-md border border-neutral-200 bg-white px-2 py-1.5 text-[11px] font-medium text-neutral-700 transition hover:border-brand-400 hover:bg-brand-50 hover:text-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {p.referenceUploading ? "Uploading…" : "Replace"}
              </button>
              <button
                type="button"
                onClick={p.onReferenceReset}
                disabled={!hasCustomReference || p.referenceUploading}
                className="rounded-md border border-neutral-200 bg-white px-2 py-1.5 text-[11px] font-medium text-neutral-600 transition hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Reset
              </button>
            </div>
            <input
              ref={referenceInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) p.onReferenceReplace(file);
                e.currentTarget.value = "";
              }}
            />
          </div>
        </div>
        </div>
        {p.productShotReferences.length > 0 && (
          <div className="mt-3">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-neutral-400">
              Product shot presets
            </p>
            <div className="grid grid-cols-4 gap-1.5">
              {p.productShotReferences.map((ref) => {
                const selected =
                  !hasCustomReference && p.selectedProductShotPath === ref.path;
                return (
                  <button
                    key={ref.id}
                    type="button"
                    onClick={() => p.onProductShotSelect(ref.path)}
                    title={ref.label}
                    className={`group relative aspect-square overflow-hidden rounded-md border bg-white transition ${
                      selected
                        ? "border-brand-500 ring-2 ring-brand-100"
                        : "border-neutral-200 hover:border-neutral-400"
                    }`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={ref.path} alt={ref.label} className="h-full w-full object-cover" />
                    {selected && (
                      <span className="pointer-events-none absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-brand-600 text-[9px] font-bold text-white">
                        ✓
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </section>

      {/* ========== BACKGROUND ========== */}
      <section className="image-sidebar-card border-b border-neutral-100 p-5">
        <SectionHeader icon={IconSwatch} title="Background" />

        <div className="mb-3 grid grid-cols-3 gap-2">
          {BG_PRESETS.map((preset) => {
            const active =
              p.backgroundColor.toLowerCase() === preset.hex.toLowerCase();
            return (
              <button
                key={preset.hex}
                onClick={() => p.onBackgroundColorChange(preset.hex)}
                title={`${preset.label} (${preset.hex})`}
                className={`flex aspect-[4/3] items-end justify-center rounded-lg border p-1.5 transition ${
                  active
                    ? "border-brand-500 ring-2 ring-brand-200"
                    : "border-neutral-200 hover:border-neutral-400"
                }`}
                style={{ backgroundColor: preset.hex }}
              >
                <span className={`rounded-full bg-white/80 px-2 py-0.5 text-[9px] font-semibold ${active ? "text-brand-700" : "text-neutral-600"}`}>
                  {active ? "✓ " : ""}{preset.label}
                </span>
              </button>
            );
          })}
        </div>

        <label className="mb-1 block text-[10px] font-medium text-neutral-500">
          Custom
        </label>
        <div className="relative flex items-center gap-2">
          <button
            type="button"
            onClick={() => colorInputRef.current?.click()}
            title="Open color picker"
            className="h-9 w-9 shrink-0 rounded-md border border-neutral-200 transition hover:border-neutral-400 hover:ring-2 hover:ring-brand-100"
            style={{
              backgroundColor: isValidHex(p.backgroundColor)
                ? p.backgroundColor
                : "#ffffff",
            }}
          />
          <input
            ref={colorInputRef}
            type="color"
            value={toFullHex(p.backgroundColor)}
            onChange={(e) => p.onBackgroundColorChange(e.target.value)}
            className="pointer-events-none absolute h-0 w-0 opacity-0"
            tabIndex={-1}
            aria-hidden="true"
          />
          <input
            type="text"
            value={p.backgroundColor}
            onChange={(e) => p.onBackgroundColorChange(e.target.value)}
            placeholder="#edeeee"
            spellCheck={false}
            className={`w-full rounded-lg border bg-white px-3 py-2 font-mono text-xs outline-none transition ${
              isValidHex(p.backgroundColor)
                ? "border-neutral-200 focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                : "border-red-300 focus:border-red-500"
            }`}
          />
        </div>
      </section>

      {/* ========== TEXT OVERLAY ========== */}
      <section className="image-sidebar-card border-b border-neutral-100 p-5">
        <SectionHeader icon={IconText} title="Text overlay" />

        <label className={`mb-2 flex items-center gap-2 rounded-lg border p-2 transition ${p.showName ? "border-brand-500 bg-brand-50" : "border-neutral-200 bg-white"}`}>
          <input
            type="checkbox"
            checked={p.showName}
            onChange={(e) => p.onShowNameChange(e.target.checked)}
            className="h-4 w-4 shrink-0 rounded border-neutral-300 text-brand-600 focus:ring-brand-400"
          />
          <input
            type="text"
            value={p.colorName}
            onChange={(e) => p.onColorNameChange(e.target.value)}
            placeholder="Color name"
            className="w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
          />
        </label>

        <label className={`mb-3 flex items-center gap-2 rounded-lg border p-2 transition ${p.showNumber ? "border-brand-500 bg-brand-50" : "border-neutral-200 bg-white"}`}>
          <input
            type="checkbox"
            checked={p.showNumber}
            onChange={(e) => p.onShowNumberChange(e.target.checked)}
            className="h-4 w-4 shrink-0 rounded border-neutral-300 text-brand-600 focus:ring-brand-400"
          />
          <input
            type="text"
            value={p.styleNumber}
            onChange={(e) => p.onStyleNumberChange(e.target.value)}
            placeholder="Style number"
            className="w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
          />
        </label>

        {/* Font family + size */}
        <label className="mb-1 block text-[10px] font-medium text-neutral-500">
          Font
        </label>
        <div className="mb-3 flex items-center gap-2">
          <select
            value={p.fontFamily}
            onChange={(e) => p.onFontFamilyChange(e.target.value)}
            className="min-w-0 flex-1 rounded-lg border border-neutral-200 bg-white px-2 py-2 text-sm"
            style={{ fontFamily: p.fontFamily }}
          >
            {FONT_FAMILIES.map((f) => (
              <option key={f} value={f} style={{ fontFamily: f }}>
                {f}
              </option>
            ))}
          </select>
          <div className="flex items-center rounded-lg border border-neutral-200 bg-white">
            <input
              type="number"
              min={6}
              max={96}
              value={p.fontSize}
              onChange={(e) => {
                const n = parseInt(e.target.value, 10);
                if (Number.isFinite(n)) p.onFontSizeChange(n);
              }}
              className="w-12 bg-transparent px-2 py-2 text-right text-sm outline-none"
            />
            <span className="pr-2 text-xs text-neutral-400">pt</span>
          </div>
        </div>

        {/* Placement */}
        <label className="mb-1 block text-[10px] font-medium text-neutral-500">
          Placement
        </label>
        <div
          className={`grid grid-cols-3 gap-1.5 transition ${
            !p.showName && !p.showNumber ? "pointer-events-none opacity-40" : ""
          }`}
        >
          {PLACEMENTS.map((pl) => {
            const active = p.overlayPlacement === pl.value;
            return (
              <button
                key={pl.value}
                onClick={() => p.onOverlayPlacementChange(pl.value)}
                title={pl.value.replace("-", " ")}
                className={`rounded-md border px-2 py-2 text-[10px] font-mono transition ${
                  active
                    ? "border-brand-500 bg-brand-50 text-brand-700"
                    : "border-neutral-200 bg-white text-neutral-500 hover:border-neutral-400"
                }`}
              >
                {pl.label}
              </button>
            );
          })}
        </div>
      </section>

      {/* ========== OUTPUT SETTINGS (collapsible) ========== */}
      <section className="image-sidebar-card border-b border-neutral-100 p-5">
        <SectionHeader
          icon={IconSliders}
          title="Output settings"
          hint={`${MODELS[p.modelId].label} · ${p.resolution} · ${p.format.toUpperCase()}`}
          collapsible
          open={outputOpen}
          onToggle={() => setOutputOpen((v) => !v)}
        />

        {outputOpen && (
          <div className="space-y-4">
            {/* Model */}
            <div>
              <label className="mb-1 block text-[10px] font-medium text-neutral-500">
                Model
              </label>
              <div className="space-y-1.5">
                {(Object.keys(MODELS) as ModelId[]).map((id) => {
                  const m = MODELS[id];
                  const active = p.modelId === id;
                  return (
                    <button
                      key={id}
                      onClick={() => p.onModelChange(id)}
                      className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm transition ${
                        active
                          ? "border-brand-500 bg-brand-50 ring-2 ring-brand-100"
                          : "border-neutral-200 bg-white hover:border-neutral-300"
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        <span className="font-medium">{m.label}</span>
                        {m.accentTag && (
                          <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.18em] text-amber-700">
                            {m.accentTag}
                          </span>
                        )}
                      </span>
                      <span className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[10px] text-neutral-600">
                        {m.badge}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Aspect + Resolution */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-[10px] font-medium text-neutral-500">
                  Aspect
                </label>
                <select
                  value={p.aspect}
                  onChange={(e) => p.onAspectChange(e.target.value)}
                  className="w-full rounded-lg border border-neutral-200 bg-white px-2 py-2 text-sm"
                >
                  {ASPECT_RATIOS.map((a) => (
                    <option key={a.value} value={a.value}>
                      {a.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-[10px] font-medium text-neutral-500">
                  Resolution
                </label>
                <select
                  value={p.resolution}
                  onChange={(e) => p.onResolutionChange(e.target.value)}
                  className="w-full rounded-lg border border-neutral-200 bg-white px-2 py-2 text-sm"
                >
                  {RESOLUTIONS.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Format */}
            <div>
              <label className="mb-1 block text-[10px] font-medium text-neutral-500">
                Format
              </label>
              <div className="grid grid-cols-2 overflow-hidden rounded-lg border border-neutral-200">
                {FORMATS.map((f) => {
                  const active = p.format === f.value;
                  const disabled = p.modelId === "nano-banana" && f.value === "jpeg";
                  return (
                    <button
                      key={f.value}
                      disabled={disabled}
                      title={disabled ? "Nano Banana only supports PNG output in this app." : undefined}
                      onClick={() =>
                        p.onFormatChange(f.value as "png" | "jpeg")
                      }
                      className={`border-r border-neutral-200 px-2 py-1.5 text-xs font-medium last:border-r-0 transition ${
                        disabled
                          ? "cursor-not-allowed bg-neutral-50 text-neutral-300"
                          : active
                          ? "bg-neutral-900 text-white"
                          : "bg-white text-neutral-600 hover:bg-neutral-50"
                      }`}
                    >
                      {f.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </section>

      {/* ========== SIGN OUT ========== */}
      <div className="mt-auto p-5">
        <button
          onClick={async () => {
            await fetch("/api/auth", { method: "DELETE" });
            window.location.href = "/login";
          }}
          className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-xs text-neutral-600 transition hover:bg-neutral-50"
        >
          Sign out
        </button>
      </div>

      <ImageLightbox src={previewSrc} onClose={() => setPreviewSrc(null)} />
    </aside>
  );
}
