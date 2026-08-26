"use client";

import { useRef, useState } from "react";
import { MODELS, type ModelId } from "@/lib/models";
import { IMAGE_STUDIO_OUTPUT_SIZE } from "@/lib/output-sizes";
import { STUDIO_BACKGROUND_HEX } from "@/lib/studio-background";
import RoutingPanel from "./RoutingPanel";
import type { CanvasSummary, RoutingPayload } from "@/lib/routing-summary";
import type { UploadedImage } from "./types";
import ImageLightbox, { ZoomButton } from "./ImageLightbox";

interface Props {
  modelId: ModelId;
  onModelChange: (m: ModelId) => void;
  uploads: UploadedImage[];
  frontIntakeUrl: string | null;
  backIntakeUrl: string | null;
  onSetFrontIntake: (url: string | null) => void;
  onSetBackIntake: (url: string | null) => void;
  onAddFiles: (files: FileList, preferredSlot?: "front" | "back") => void;
  onRemoveUpload: (url: string) => void;

  /** Typed style number — drives ERP routing, not decoration. */
  styleNumber: string;
  onStyleNumberChange: (v: string) => void;

  /* Canvas — image_urls[0], the studio photo the model edits. Chosen from the
     garment's category (lib/canvas-registry.ts); a hand-uploaded replacement
     is the only manual path, and it opts the run out of routing. */
  referenceImageUrl: string | null;
  /** Preview shown when no custom canvas has been uploaded — the routed one. */
  defaultReferencePreview: string;
  onReferenceReplace: (file: File) => void;
  onReferenceReset: () => void;
  referenceUploading: boolean;

  /* How the studio arrived at this render — see components/RoutingPanel.tsx. */
  routing: RoutingPayload | null;
  routingCanvas: CanvasSummary | null;
  routingPending: boolean;
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
const IconSliders = (
  <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
    <path d="M5 4a1 1 0 011 1v2h9a1 1 0 110 2H6v6a1 1 0 11-2 0V9H3a1 1 0 110-2h1V5a1 1 0 011-1zm10 5a1 1 0 011 1v5h1a1 1 0 110 2h-1v1a1 1 0 11-2 0v-1h-1a1 1 0 110-2h1v-5a1 1 0 011-1z" />
  </svg>
);

const IconTag = (
  <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
    <path d="M9.4 2H4a2 2 0 00-2 2v5.4a2 2 0 00.6 1.4l7 7a2 2 0 002.8 0l5.4-5.4a2 2 0 000-2.8l-7-7A2 2 0 009.4 2zM6 7a1.5 1.5 0 110-3 1.5 1.5 0 010 3z" />
  </svg>
);
const IconRoute = (
  <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
    <path d="M5 2.5A2.5 2.5 0 002.5 5c0 1.1.72 2.05 1.75 2.38V12a4 4 0 004 4h1.87l-1.2 1.2a.75.75 0 101.06 1.06l2.5-2.5a.75.75 0 000-1.06l-2.5-2.5a.75.75 0 10-1.06 1.06l1.2 1.2H8.25A2.5 2.5 0 015.75 12V7.38A2.5 2.5 0 005 2.5zM15 8a2.5 2.5 0 100 5 2.5 2.5 0 000-5z" />
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
          title="Canvas"
          hint={hasCustomReference ? "Manual" : "Routed"}
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
              {hasCustomReference
                ? "Your own studio photo. Replacing the canvas opts this run out of category routing."
                : "The studio photo your garment is rendered onto, chosen from its category. Background, framing and scale are copied from it."}
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
      </section>

      {/* ========== STYLE ========== */}
      {/* Promoted out of the text-overlay block. It used to be there because
          its only job was stamping digits on the export; it now decides the
          category, the canvas, and whether the garment is described from one
          photo or the style's whole gallery. */}
      <section className="image-sidebar-card border-b border-neutral-100 p-5">
        <SectionHeader icon={IconTag} title="Style" hint="drives routing" />
        <input
          type="text"
          value={p.styleNumber}
          onChange={(e) => p.onStyleNumberChange(e.target.value)}
          placeholder="e.g. DWTS67099"
          spellCheck={false}
          autoCapitalize="characters"
          className="w-full rounded-md border border-neutral-200 bg-white px-3 py-2 font-mono text-sm uppercase tracking-wide outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
        />
        <p className="mt-2 text-[10px] leading-snug text-neutral-500">
          Optional. Without it the garment is read from your photo alone.
        </p>
      </section>

      {/* ========== ROUTING ========== */}
      <section className="image-sidebar-card border-b border-neutral-100 p-5">
        <SectionHeader icon={IconRoute} title="Routing" hint="automatic" />
        <RoutingPanel
          routing={p.routing}
          canvas={p.routingCanvas}
          pending={p.routingPending}
        />
      </section>

      {/* ========== OUTPUT SETTINGS (collapsible) ========== */}
      <section className="image-sidebar-card border-b border-neutral-100 p-5">
        <SectionHeader
          icon={IconSliders}
          title="Output settings"
          hint={`${MODELS[p.modelId].label} · ${IMAGE_STUDIO_OUTPUT_SIZE.width}×${IMAGE_STUDIO_OUTPUT_SIZE.height} · JPEG`}
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

            {/* Output spec — stated, not chosen.
                Aspect, Resolution and Format used to be pickers here. All
                three were inert: every request hardcodes 4:5 and 4K, and
                /api/finalize-image hardcodes JPEG, so a "PNG" choice produced
                JPEG bytes in a .png filename. The size and format are
                properties of the Image Studio standard, not preferences, so
                they are reported rather than offered. */}
            <div className="rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2.5">
              <div className="mb-1.5 text-[10px] font-medium text-neutral-500">Output</div>
              <dl className="space-y-1 text-[11px]">
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-neutral-500">Size</dt>
                  <dd className="font-mono text-neutral-800 tabular-nums">
                    {IMAGE_STUDIO_OUTPUT_SIZE.width}×{IMAGE_STUDIO_OUTPUT_SIZE.height}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-neutral-500">Aspect</dt>
                  <dd className="font-mono text-neutral-800 tabular-nums">4:5</dd>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-neutral-500">Format</dt>
                  <dd className="font-mono text-neutral-800">JPEG</dd>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-neutral-500">Background</dt>
                  <dd className="font-mono text-neutral-800">{STUDIO_BACKGROUND_HEX}</dd>
                </div>
              </dl>
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
