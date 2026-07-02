"use client";

import { useRef, useState } from "react";
import { ASPECT_RATIOS, FORMATS, MODELS, RESOLUTIONS, type ModelId } from "@/lib/models";
import type { OverlayPlacement } from "@/lib/fal";
import type { UploadedImage } from "./types";
import { resizeIfNeeded } from "@/lib/image-resize";
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
  /* User-added model add/delete.
     onModelAdded resolves true once the new model is visible in the list
     (and selected), false if the post-save refresh polls exhausted first. */
  onModelAdded: (id: string) => Promise<boolean>;
  onModelDeleted: (id: string) => void;

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
  multiModelMode?: boolean;
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

const PRESET_VIEWS: Array<{ value: PresetView; label: string }> = [
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
        <h3 className="text-[12px] font-semibold text-neutral-800">
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
  const [draggingUploads, setDraggingUploads] = useState(false);

  /* ---------- Add / delete user models ---------- */
  const [addingModel, setAddingModel] = useState(false);
  const [newModelName, setNewModelName] = useState("");
  const [newModelFiles, setNewModelFiles] = useState<{
    front?: File;
    side?: File;
    back?: File;
    full?: File;
  }>({});
  const [addModelBusy, setAddModelBusy] = useState(false);
  const [addModelError, setAddModelError] = useState<string | null>(null);
  // Synchronous re-entrancy guards. The buttons' `disabled` attribute lags a
  // render, so a fast double-click could otherwise fire two POSTs/DELETEs.
  const submitInFlight = useRef(false);
  const deleteInFlight = useRef(false);

  async function submitNewModel() {
    if (submitInFlight.current || addModelBusy) return;
    if (!newModelName.trim() || !newModelFiles.front) return;
    submitInFlight.current = true;
    setAddModelBusy(true);
    setAddModelError(null);
    try {
      const form = new FormData();
      form.append("name", newModelName.trim());
      for (const view of ["front", "side", "back", "full"] as const) {
        const file = newModelFiles[view];
        if (file) form.append(view, await resizeIfNeeded(file));
      }
      const res = await fetch("/api/user-models", { method: "POST", body: form });
      const data = await res.json();
      if (!data?.ok) throw new Error(data?.error || "Failed to add model");
      // The blob index that /api/models reads from can lag briefly after a
      // write, so onModelAdded polls until the new model shows up (rather
      // than a single refresh that may silently miss it) before selecting it.
      const appeared = await p.onModelAdded(data.model.id);
      if (appeared) {
        setAddingModel(false);
        setNewModelName("");
        setNewModelFiles({});
      } else {
        // The save itself succeeded but the list index hasn't caught up yet.
        // Keep the form open with a notice (not stuck busy), and clear the
        // inputs so a reflexive re-submit can't create a duplicate model.
        setNewModelName("");
        setNewModelFiles({});
        setAddModelError(
          "Model saved, but the list is still refreshing — it will appear shortly. Refresh the page if it doesn't."
        );
      }
    } catch (err: any) {
      setAddModelError(err.message || "Failed to add model");
    } finally {
      submitInFlight.current = false;
      setAddModelBusy(false);
    }
  }

  async function deleteUserModel(id: string, name: string) {
    if (deleteInFlight.current) return;
    if (!confirm(`Delete model "${name}"? This removes it for the whole team.`)) return;
    deleteInFlight.current = true;
    try {
      const res = await fetch(`/api/user-models?id=${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!data?.ok) throw new Error(data?.error || "Delete failed");
      // Optimistic local removal — instant, and immune to the blob index's
      // read-after-write lag (a plain refresh right after delete could still
      // show the just-deleted model). Parent also handles selection fallback.
      p.onModelDeleted(id);
    } catch (err: any) {
      setAddModelError(err.message || "Delete failed");
    } finally {
      deleteInFlight.current = false;
    }
  }

  const selectedCount = p.selectedUrls.length;
  const uploadCount = p.uploads.length;
  const refHint =
    uploadCount === 0 ? "Upload to start" : `${selectedCount} of ${uploadCount} selected`;

  const selectedModel: HumanModel | null =
    p.humanModels.find((m) => m.id === p.selectedHumanModelId) ?? null;
  const poses: ModelPose[] = selectedModel?.poses ?? [];
  const selectedPose: ModelPose | null =
    poses.find((pose) => pose.id === p.selectedPoseId) ?? poses[0] ?? null;
  function hasImageFiles(e: React.DragEvent): boolean {
    return Array.from(e.dataTransfer.items).some((item) => item.type.startsWith("image/"));
  }

  function handleUploadDrop(e: React.DragEvent) {
    e.preventDefault();
    setDraggingUploads(false);
    if (e.dataTransfer.files.length) p.onAddFiles(e.dataTransfer.files);
  }

  return (
    <aside className="model-sidebar flex w-full shrink-0 flex-col overflow-y-auto border-b border-neutral-200 bg-white lg:h-full lg:border-b-0 lg:border-r">
      {/* ========== GARMENT PHOTO (user uploads) ========== */}
      <section
        className={`model-sidebar-card border-b border-neutral-100 p-5 transition ${
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
        <SectionHeader icon={IconCamera} title="Garment intake" hint={refHint} />

        {p.multiModelMode ? (
          <div className="grid gap-2">
            {(["Front Garment Image", "Back Garment Image"] as const).map((label, slotIndex) => {
              const upload = p.uploads[slotIndex];
              const required = slotIndex === 0;
              return (
                <div key={label} className="rounded-xl border border-neutral-200 bg-neutral-50 p-2">
                  <div className="mb-2 flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-neutral-500">
                    <span>{label}</span>
                    <span>{required ? "Required" : "Optional"}</span>
                  </div>
                  {upload ? (
                    <div className="group relative aspect-[4/3] overflow-hidden rounded-lg border border-brand-200 bg-white">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={upload.url} alt={upload.name} className="h-full w-full object-cover" />
                      <button
                        onClick={() => p.onRemoveUpload(upload.url)}
                        className="absolute left-2 top-2 rounded-full bg-black/70 px-2 py-0.5 text-[10px] font-semibold text-white opacity-0 transition group-hover:opacity-100"
                        title="Remove"
                      >
                        Remove
                      </button>
                      <ZoomButton
                        onClick={() => setPreviewSrc(upload.url)}
                        title="Preview at full size"
                        className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100"
                      />
                    </div>
                  ) : (
                    <label
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
                        {required ? "Upload front" : "Upload back"}
                      </span>
                      <span className="mt-1 max-w-[220px] text-[10px] leading-relaxed text-neutral-500">
                        {required
                          ? "Main garment reference for all 4 views."
                          : "Improves back accuracy when artwork or construction is hidden."}
                      </span>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          if (e.target.files?.length) p.onAddFiles(e.target.files);
                          e.currentTarget.value = "";
                        }}
                      />
                    </label>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
        <div className={uploadCount === 0 ? "grid gap-2" : "grid grid-cols-3 gap-2"}>
          <label
            className={`group flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed text-center transition hover:border-brand-400 hover:bg-brand-50 hover:text-brand-600 ${
              draggingUploads
                ? "border-brand-500 bg-brand-50 text-brand-700"
                : "border-neutral-300 bg-neutral-50 text-neutral-400"
            } ${uploadCount === 0 ? "min-h-[156px] px-4 py-6" : "aspect-square"}`}
          >
            <svg viewBox="0 0 20 20" fill="currentColor" className={uploadCount === 0 ? "mb-2 h-6 w-6" : "h-4 w-4"}>
              <path d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" />
            </svg>
            {uploadCount === 0 && (
              <>
                <span className="text-sm font-semibold text-neutral-800">Drop garment image</span>
                <span className="mt-1 max-w-[220px] text-[11px] leading-relaxed text-neutral-500">
                  Flat lay, hanger, or product crop. Use multiple photos for batch runs.
                </span>
              </>
            )}
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
        )}

        <div className="mt-3 grid grid-cols-3 gap-1.5 text-center text-[10px] font-medium text-neutral-500">
          <span className="rounded-full bg-neutral-50 px-2 py-1">1. Upload</span>
          <span className="rounded-full bg-neutral-50 px-2 py-1">2. Pick model</span>
          <span className="rounded-full bg-neutral-50 px-2 py-1">3. Generate</span>
        </div>
      </section>

      {/* ========== MODEL + POSE PICKER ========== */}
      <section className="model-sidebar-card border-b border-neutral-100 p-5">
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

        {/* Model picker — grouped by family. Models with the same prefix word
            (e.g. "celine 1", "celine 2", "celine 3" → "Celine") are clustered
            together under a small header. Single-model families still show a
            tier header so Pants and Sydney do not look like leftovers. */}
        <div className="mb-4 space-y-3">
          {p.humanModels.length === 0 && !p.modelsLoading && (
            <p className="text-[11px] text-neutral-500">
              No models found. Add look presets under{" "}
              <code className="rounded bg-neutral-100 px-1">public/models/</code>.
            </p>
          )}
          {(() => {
            // Bucket models by family prefix while preserving the registry's
            // existing sort order. The prefix is everything before the first
            // numeric token, lowercased and trimmed (e.g. "celine 1" → "celine",
            // "pants 2" → "pants", "sydney" → "sydney").
            const familyOrder: string[] = [];
            const buckets = new Map<string, typeof p.humanModels>();
            for (const m of p.humanModels) {
              const family = m.name.replace(/\s*\d+\s*$/, "").trim() || m.name;
              if (!buckets.has(family)) {
                buckets.set(family, []);
                familyOrder.push(family);
              }
              buckets.get(family)!.push(m);
            }
            return familyOrder.map((family) => {
              const familyModels = buckets.get(family)!;
              return (
                <div key={family} className="space-y-1.5">
                  <div className="flex items-center gap-2 px-0.5">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400">
                      {family}
                    </span>
                    <span className="h-px flex-1 bg-neutral-200" />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {familyModels.map((m) => {
                      const active = m.id === p.selectedHumanModelId;
                      const primaryThumb =
                        m.poses[0]?.views?.front ||
                        m.poses[0]?.views?.full ||
                        m.poses[0]?.views?.side ||
                        m.poses[0]?.views?.back;
                      // Show the variant suffix ("1" / "2" / "3") inside each
                      // family tier, while singleton names such as Sydney remain
                      // readable.
                      const label = m.name.replace(family, "").trim() || m.name;
                      return (
                        <div
                          key={m.id}
                          role="button"
                          tabIndex={0}
                          onClick={() => p.onHumanModelChange(m.id)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              p.onHumanModelChange(m.id);
                            }
                          }}
                          className={`group relative flex min-h-[60px] cursor-pointer items-center gap-2 rounded-lg border p-2 text-left transition ${
                            active
                              ? "border-brand-500 bg-brand-50 text-brand-700 shadow-sm"
                              : "border-neutral-200 bg-white text-neutral-700 hover:border-neutral-400 hover:bg-neutral-50"
                          }`}
                        >
                          <span className="relative h-12 w-9 shrink-0 overflow-hidden rounded-md border border-neutral-200 bg-neutral-100">
                            {primaryThumb ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={primaryThumb.publicPath || m.poses[0]?.publicPath}
                                alt=""
                                className="h-full w-full object-cover transition group-hover:scale-105"
                              />
                            ) : null}
                            {active && (
                              <span className="absolute right-0.5 top-0.5 h-2 w-2 rounded-full bg-brand-600" />
                            )}
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate text-xs font-semibold">
                              {label}
                            </span>
                          </span>
                          {m.userAdded && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                void deleteUserModel(m.id, m.name);
                              }}
                              title="Delete model"
                              className="absolute right-1 top-1 hidden h-4 w-4 items-center justify-center rounded-full bg-neutral-800/70 text-[9px] font-bold text-white group-hover:flex"
                            >
                              ×
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            });
          })()}
        </div>

        {!addingModel ? (
          <button
            type="button"
            onClick={() => setAddingModel(true)}
            className="mt-2 w-full rounded-lg border border-dashed border-neutral-300 bg-white px-2 py-2.5 text-[11px] font-medium text-neutral-500 transition hover:border-brand-400 hover:text-brand-600"
          >
            + Add model
          </button>
        ) : (
          <div className="mt-2 space-y-2 rounded-lg border border-neutral-200 bg-neutral-50 p-3">
            <input
              type="text"
              value={newModelName}
              onChange={(e) => setNewModelName(e.target.value)}
              placeholder="Model name"
              className="w-full rounded-md border border-neutral-200 bg-white px-2 py-1.5 text-[11px] focus:border-brand-400 focus:outline-none"
            />
            {(["front", "side", "back", "full"] as const).map((view) => (
              <label key={view} className="flex items-center gap-2 text-[11px] text-neutral-600">
                <span className="w-10 capitalize">
                  {view}
                  {view === "front" ? " *" : ""}
                </span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    setNewModelFiles((existing) => ({ ...existing, [view]: file }));
                  }}
                  className="flex-1 text-[10px]"
                />
              </label>
            ))}
            {addModelError && <p className="text-[10px] text-red-600">{addModelError}</p>}
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={() => void submitNewModel()}
                disabled={addModelBusy || !newModelName.trim() || !newModelFiles.front}
                className="flex-1 rounded-md border border-brand-300 bg-brand-50 px-2 py-1.5 text-[11px] font-medium text-brand-700 hover:bg-brand-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {addModelBusy ? "Saving…" : "Save model"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setAddingModel(false);
                  setAddModelError(null);
                }}
                className="rounded-md border border-neutral-200 bg-white px-2 py-1.5 text-[11px] text-neutral-600 hover:bg-neutral-50"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {selectedModel?.id.startsWith("pants") && (
          <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-800">
            Lower-body preset library for pants fit, silhouette, and view reference. Use this when
            you want the generation anchored to a pants-focused body crop instead of a full model.
          </p>
        )}

        {/* Look preset / reference preview */}
        {selectedModel && poses.length > 0 && (
          <>
            {p.multiModelMode ? (
              <>
                <label className="mb-2 block text-[10px] font-medium text-neutral-500">
                  Reference views
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {PRESET_VIEWS.map((view) => {
                    const thumb = selectedPose?.views?.[view.value] || selectedPose?.publicPath;
                    const available = Boolean(thumb);
                    return (
                      <button
                        key={view.value}
                        type="button"
                        onClick={() => {
                          if (!thumb) return;
                          setPreviewSrc(typeof thumb === "string" ? thumb : thumb.publicPath);
                        }}
                        disabled={!available}
                        className={`group relative aspect-[3/4] overflow-hidden rounded-xl border bg-neutral-50 text-left transition ${
                          available
                            ? "border-neutral-200 hover:border-neutral-400 hover:shadow-sm"
                            : "cursor-not-allowed border-neutral-100 text-neutral-300"
                        }`}
                        title={
                          available
                            ? `Preview ${view.label.toLowerCase()} reference`
                            : `${view.label} reference is not available for this look`
                        }
                      >
                        {thumb ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={typeof thumb === "string" ? thumb : thumb.publicPath}
                            alt={`${selectedPose?.label || "Selected look"} ${view.label} reference`}
                            className="h-full w-full object-cover transition group-hover:scale-105"
                          />
                        ) : null}
                        <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent px-2 pb-2 pt-8 text-[11px] font-semibold text-white">
                          {view.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <p className="mt-2 text-[11px] leading-relaxed text-neutral-500">
                  These four references guide the generated front, side, back, and full views.
                </p>
              </>
            ) : (
              <>
                <label className="mb-1 block text-[10px] font-medium text-neutral-500">
                  Look Preset
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {poses.map((pose) => {
                    const active = pose.id === p.selectedPoseId;
                    const thumb =
                      (active ? pose.views[p.selectedView] : null) ||
                      pose.views.front ||
                      pose.views.full ||
                      pose.views.side ||
                      pose.views.back;
                    return (
                      <div
                        key={pose.id}
                        className={`group relative aspect-[4/5] overflow-hidden rounded-lg border transition ${
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
                          <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/55 to-transparent px-2 pb-1.5 pt-6 text-left text-[10px] font-semibold text-white">
                            {pose.label}
                          </span>
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
                <label className="mb-1 mt-4 block text-[10px] font-medium text-neutral-500">
                  View
                </label>
                <div className="grid grid-cols-4 gap-1.5">
                  {PRESET_VIEWS.map((view) => {
                    const available = Boolean(selectedPose?.views?.[view.value]);
                    const active = p.selectedView === view.value;
                    return (
                      <button
                        key={view.value}
                        type="button"
                        onClick={() => {
                          if (available) p.onViewChange(view.value);
                        }}
                        disabled={!available}
                        className={`rounded-full border px-2 py-2 text-xs font-semibold transition ${
                          active
                            ? "border-brand-500 bg-brand-50 text-brand-700"
                            : available
                            ? "border-neutral-200 bg-white text-neutral-600 hover:border-neutral-400 hover:bg-neutral-50"
                            : "cursor-not-allowed border-neutral-100 bg-neutral-50 text-neutral-300"
                        }`}
                        title={
                          available
                            ? `Use ${view.label.toLowerCase()} reference for generation`
                            : `${view.label} is not available for this look`
                        }
                      >
                        {view.label}
                      </button>
                    );
                  })}
                </div>
                <p className="mt-2 text-[11px] leading-relaxed text-neutral-500">
                  Choose the model reference angle used for the next generation.
                </p>
              </>
            )}
          </>
        )}
      </section>

      {/* ========== TEXT OVERLAY ========== */}
      <section className="model-sidebar-card border-b border-neutral-100 p-5">
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
      <section className="model-sidebar-card border-b border-neutral-100 p-5">
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
                  const disabled = p.modelId === "nano-banana" && f.value === "jpeg";
                  return (
                    <button
                      key={f.value}
                      disabled={disabled}
                      title={disabled ? "Nano Banana only supports PNG output in this app." : undefined}
                      onClick={() => p.onFormatChange(f.value as "png" | "jpeg")}
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
