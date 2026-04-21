"use client";

import { useState } from "react";
import { ASPECT_RATIOS, FORMATS, MODELS, RESOLUTIONS, type ModelId } from "@/lib/models";
import type { OverlayPlacement } from "@/lib/fal";
import type { UploadedImage } from "./types";
// NOTE: `import type` is required — models-registry imports node:fs, which
// must never end up in the client bundle. Type-only imports are erased at
// compile time.
import type { HumanModel, ModelPose, PresetView } from "@/lib/models-registry";
import ImageLightbox, { ZoomButton } from "./ImageLightbox";

interface Props {
  /* Output (AI image) model */
  modelId: ModelId;
  onModelChange: (m: ModelId) => void;
  aspect: string;
  onAspectChange: (v: string) => void;
  resolution: string;
  onResolutionChange: (v: string) => void;
  format: "png" | "jpeg";
  onFormatChange: (v: "png" | "jpeg") => void;

  /* User-uploaded garment photos (same as Image Studio) */
  uploads: UploadedImage[];
  selectedUrls: string[];
  onToggleSelect: (url: string) => void;
  onAddFiles: (files: FileList) => void;
  onRemoveUpload: (url: string) => void;

  /* Human model catalog + selection */
  humanModels: HumanModel[];
  selectedHumanModelId: string | null;
  onHumanModelChange: (id: string) => void;
  selectedPoseId: string | null;
  onPoseChange: (id: string) => void;
  selectedView: PresetView;
  onViewChange: (view: PresetView) => void;
  modelsLoading: boolean;

  /* Text overlay (same as Image Studio) */
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
}

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

const PRESET_VIEWS: { value: PresetView; label: string }[] = [
  { value: "front", label: "Front" },
  { value: "side", label: "Side" },
  { value: "back", label: "Back" },
  { value: "full", label: "Full" },
];

/* ---------- Section header ---------- */

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
            className={`h-4 w-4 text-neutral-400 transition ${open ? "rotate-180" : ""}`}
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

/* ---------- Icons ---------- */

const IconCamera = (
  <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
    <path d="M6.5 3a1 1 0 00-.8.4L4.6 5H3a2 2 0 00-2 2v8a2 2 0 002 2h14a2 2 0 002-2V7a2 2 0 00-2-2h-1.6l-1.1-1.6a1 1 0 00-.8-.4h-7zM10 8.5a3 3 0 110 6 3 3 0 010-6z" />
  </svg>
);
const IconModel = (
  <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
    <path d="M10 2a3 3 0 100 6 3 3 0 000-6zm-5 9a4 4 0 014-4h2a4 4 0 014 4v1a1 1 0 01-1 1h-1v4a1 1 0 11-2 0v-4H9v4a1 1 0 11-2 0v-4H6a1 1 0 01-1-1v-1z" />
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

/* ---------- Component ---------- */

export default function ModelSidebar(p: Props) {
  const [outputOpen, setOutputOpen] = useState(false);
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);

  const selectedCount = p.selectedUrls.length;
  const uploadCount = p.uploads.length;
  const refHint =
    uploadCount === 0 ? "Upload to start" : `${selectedCount} of ${uploadCount} selected`;

  const selectedModel: HumanModel | null =
    p.humanModels.find((m) => m.id === p.selectedHumanModelId) ?? null;
  const poses: ModelPose[] = selectedModel?.poses ?? [];
  const activeLook = poses.find((pose) => pose.id === p.selectedPoseId) ?? null;

  return (
    <aside className="flex w-full shrink-0 flex-col overflow-y-auto border-b border-neutral-200 bg-white lg:w-72 lg:border-b-0 lg:border-r">
      {/* ========== GARMENT PHOTO (user uploads) ========== */}
      <section className="border-b border-neutral-100 p-5">
        <SectionHeader icon={IconCamera} title="Garment photo" hint={refHint} />

        <div className="grid grid-cols-4 gap-2">
          <label className="flex aspect-square cursor-pointer items-center justify-center rounded-lg border border-dashed border-neutral-300 bg-neutral-50 text-lg text-neutral-400 transition hover:border-brand-400 hover:bg-brand-50 hover:text-brand-600">
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
              <path d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" />
            </svg>
            <input
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.length) p.onAddFiles(e.target.files);
                e.currentTarget.value = "";
              }}
            />
          </label>

          {p.uploads.map((u) => {
            const selected = p.selectedUrls.includes(u.url);
            return (
              <div
                key={u.url}
                className={`group relative aspect-square overflow-hidden rounded-lg border ${
                  selected
                    ? "border-brand-500 ring-2 ring-brand-200"
                    : "border-neutral-200"
                }`}
              >
                <button
                  onClick={() => p.onToggleSelect(u.url)}
                  className="absolute inset-0 block"
                  title={selected ? "Deselect" : "Use as reference"}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={u.url} alt={u.name} className="h-full w-full object-cover" />
                  {selected && (
                    <span className="pointer-events-none absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-brand-600 text-[9px] font-bold text-white">
                      ✓
                    </span>
                  )}
                </button>
                <button
                  onClick={() => p.onRemoveUpload(u.url)}
                  className="absolute left-1 top-1 hidden rounded-full bg-black/70 px-1 text-[10px] text-white group-hover:block"
                  title="Remove"
                >
                  ×
                </button>
                <ZoomButton
                  onClick={() => setPreviewSrc(u.url)}
                  title="Preview at full size"
                  className="absolute bottom-1 right-1 opacity-0 group-hover:opacity-100"
                />
              </div>
            );
          })}
        </div>

        {uploadCount === 0 && (
          <p className="mt-3 text-[11px] leading-relaxed text-neutral-500">
            Upload a flat-lay photo of the garment you want the model to wear.
          </p>
        )}
      </section>

      {/* ========== MODEL + POSE PICKER ========== */}
      <section className="border-b border-neutral-100 p-5">
        <SectionHeader
          icon={IconModel}
          title="Model"
          hint={
            p.modelsLoading
              ? "Loading…"
              : selectedModel
              ? selectedModel.name
              : `${p.humanModels.length} available`
          }
        />

        {/* Model row */}
        <div className="mb-3 flex flex-wrap gap-2">
          {p.humanModels.length === 0 && !p.modelsLoading && (
            <p className="text-[11px] text-neutral-500">
              No models found. Add look presets under{" "}
              <code className="rounded bg-neutral-100 px-1">public/models/</code>.
            </p>
          )}
          {p.humanModels.map((m) => {
            const active = m.id === p.selectedHumanModelId;
            return (
              <button
                key={m.id}
                onClick={() => p.onHumanModelChange(m.id)}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                  active
                    ? "border-brand-500 bg-brand-50 text-brand-700"
                    : "border-neutral-200 bg-white text-neutral-600 hover:border-neutral-400"
                }`}
              >
                {m.name}
              </button>
            );
          })}
        </div>

        {/* Look preset grid */}
        {selectedModel && poses.length > 0 && (
          <>
            <label className="mb-1 block text-[10px] font-medium text-neutral-500">
              Look Preset
            </label>
            <div className="grid grid-cols-3 gap-2">
              {poses.map((pose) => {
                const active = pose.id === p.selectedPoseId;
                const thumb =
                  pose.views[p.selectedView] ||
                  pose.views.front ||
                  pose.views.full ||
                  pose.views.side ||
                  pose.views.back;
                return (
                  <div
                    key={pose.id}
                    className={`group relative aspect-[3/4] overflow-hidden rounded-lg border transition ${
                      active
                        ? "border-brand-500 ring-2 ring-brand-200"
                        : "border-neutral-200 hover:border-neutral-400"
                    }`}
                  >
                    <button
                      onClick={() => p.onPoseChange(pose.id)}
                      className="absolute inset-0 block"
                      title={pose.label}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={thumb?.publicPath || pose.publicPath}
                        alt={pose.label}
                        className="h-full w-full object-cover"
                      />
                      {active && (
                        <span className="pointer-events-none absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-brand-600 text-[9px] font-bold text-white">
                          ✓
                        </span>
                      )}
                    </button>
                    <ZoomButton
                      onClick={() => setPreviewSrc(thumb?.publicPath || pose.publicPath)}
                      title="Preview at full size"
                      className="absolute bottom-1 right-1 opacity-0 group-hover:opacity-100"
                    />
                  </div>
                );
              })}
            </div>

            <div className="mt-3">
              <label className="mb-1 block text-[10px] font-medium text-neutral-500">
                View
              </label>
              <div className="flex flex-wrap gap-2">
                {PRESET_VIEWS.map((option) => {
                  const available = !!activeLook?.views?.[option.value];
                  const active = p.selectedView === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => p.onViewChange(option.value)}
                      disabled={!available}
                      className={`rounded-full border px-3 py-1 text-xs font-medium transition disabled:cursor-not-allowed ${
                        active
                          ? "border-brand-500 bg-brand-50 text-brand-700"
                          : available
                          ? "border-neutral-200 bg-white text-neutral-600 hover:border-neutral-400"
                          : "border-neutral-200 bg-neutral-100 text-neutral-400"
                      }`}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-neutral-500">
                Front is the default. Side, back, and full use linked variant images only when
                available for the selected look.
              </p>
            </div>
          </>
        )}
      </section>

      {/* ========== TEXT OVERLAY ========== */}
      <section className="border-b border-neutral-100 p-5">
        <SectionHeader icon={IconText} title="Text overlay" />

        <label className="mb-2 flex items-center gap-2">
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
            className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
          />
        </label>

        <label className="mb-3 flex items-center gap-2">
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
            className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
          />
        </label>

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

      {/* ========== OUTPUT SETTINGS ========== */}
      <section className="border-b border-neutral-100 p-5">
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

            <div>
              <label className="mb-1 block text-[10px] font-medium text-neutral-500">
                Format
              </label>
              <div className="grid grid-cols-2 overflow-hidden rounded-lg border border-neutral-200">
                {FORMATS.map((f) => {
                  const active = p.format === f.value;
                  return (
                    <button
                      key={f.value}
                      onClick={() => p.onFormatChange(f.value as "png" | "jpeg")}
                      className={`border-r border-neutral-200 px-2 py-1.5 text-xs font-medium last:border-r-0 transition ${
                        active
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
