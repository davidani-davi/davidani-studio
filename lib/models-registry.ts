// Server-side registry of human models available for the Model Studio feature.
//
// Pattern: each subdirectory of public/models/ represents one model. The folder
// name becomes the model's ID (e.g. "bianca"). Each model can contain:
//
//   public/models/<model>/presets/<look-id>/*  ← preferred curated looks
//   public/models/<model>/*           ← legacy root-level preset images
//
// Each curated look can contain linked view variants such as front / side /
// back / full. The UI shows one default front image per look, then swaps to
// the requested linked variant when the user changes the View control.
//
// When the user triggers a generation with a given model + pose, we lazily
// upload that pose file to fal.ai storage and cache the resulting URL in
// memory for the lifetime of the serverless instance. Subsequent generations
// using the same pose reuse the cached URL — no re-upload cost.

import fs from "node:fs";
import path from "node:path";
import { uploadToFal } from "./fal";

export interface ModelPose {
  /** Stable preset ID, derived from the filename stem (e.g. "bianca1"). */
  id: string;
  /** Display label shown in the UI. */
  label: string;
  /** Default preview path shown in the UI (usually the front image). */
  publicPath: string;
  /** Canonical filename used for sorting/debugging. */
  filename: string;
  /** Relative subdir within the model folder, e.g. "presets/look-01" or "". */
  subdir: string;
  /** Available linked view variants for this look. */
  views: Partial<Record<PresetView, { filename: string; publicPath: string }>>;
}

export type PresetView = "front" | "side" | "back" | "full";

export interface HumanModel {
  /** Model ID — the folder name, lowercased (e.g. "bianca"). */
  id: string;
  /** Display name shown in the UI. */
  name: string;
  poses: ModelPose[];
}

const IMAGE_EXTS = new Set(["png", "jpg", "jpeg", "webp"]);

function prettifyPresetLabel(stem: string): string {
  return stem
    .replace(/[-_]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

function stripModelPrefix(stem: string, modelFolderName: string): string {
  const lowerStem = stem.toLowerCase();
  const lowerModel = modelFolderName.toLowerCase();
  if (lowerStem === lowerModel) return stem;
  if (lowerStem.startsWith(`${lowerModel}-`) || lowerStem.startsWith(`${lowerModel}_`)) {
    return stem.slice(modelFolderName.length + 1);
  }
  return stem;
}

function stripLibraryPrefix(stem: string, modelFolderName: string): string {
  const cleaned = stripModelPrefix(stem, modelFolderName);
  if (modelFolderName.toLowerCase() === "pants") {
    return cleaned.replace(/^pants[-_\s]+/i, "");
  }
  return cleaned;
}

function inferPresetView(stem: string): PresetView {
  const lower = stem.toLowerCase();
  if (/\bside\b/.test(lower)) return "side";
  if (/\bback\b/.test(lower)) return "back";
  if (/\bfull(body)?\b/.test(lower)) return "full";
  return "front";
}

function stripViewToken(stem: string): string {
  return stem
    .replace(/(^|[-_])(front|side|back|full|fullbody)(?=$|[-_])/gi, "$1")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function collectPresetImages(modelFolderName: string): ModelPose[] {
  const modelDir = path.join(process.cwd(), "public", "models", modelFolderName);
  const presetsDir = path.join(modelDir, "presets");
  const looks: ModelPose[] = [];

  if (fs.existsSync(presetsDir)) {
    const lookDirs = fs
      .readdirSync(presetsDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && entry.name.toLowerCase() !== "hide");

    for (const lookDir of lookDirs) {
      const dirPath = path.join(presetsDir, lookDir.name);
      const entries = fs.readdirSync(dirPath, { withFileTypes: true }).filter((entry) =>
        entry.isFile()
      );
      const views: ModelPose["views"] = {};

      for (const entry of entries) {
        const ext = entry.name.toLowerCase().split(".").pop() || "";
        if (!IMAGE_EXTS.has(ext)) continue;
        const stem = entry.name.replace(/\.[^.]+$/, "");
        const view = inferPresetView(stem);
        if (!views[view]) {
          views[view] = {
            filename: entry.name,
            publicPath: `/models/${modelFolderName}/presets/${lookDir.name}/${entry.name}`,
          };
        }
      }

      const front = views.front || views.full || views.side || views.back;
      if (!front) continue;
      const displayStem = stripLibraryPrefix(
        stripViewToken(lookDir.name) || lookDir.name,
        modelFolderName
      );

      looks.push({
        id: lookDir.name.toLowerCase(),
        label: prettifyPresetLabel(displayStem),
        publicPath: front.publicPath,
        filename: front.filename,
        subdir: `presets/${lookDir.name}`,
        views,
      });
    }
  }

  const legacyEntries = fs.readdirSync(modelDir, { withFileTypes: true });
  for (const entry of legacyEntries) {
    if (!entry.isFile()) continue;
    const ext = entry.name.toLowerCase().split(".").pop() || "";
    if (!IMAGE_EXTS.has(ext)) continue;

    const stem = entry.name.replace(/\.[^.]+$/, "");
    const displayStem = stripLibraryPrefix(stripViewToken(stem) || stem, modelFolderName);
    looks.push({
      id: stem.toLowerCase(),
      label: prettifyPresetLabel(displayStem),
      publicPath: `/models/${modelFolderName}/${entry.name}`,
      filename: entry.name,
      subdir: "",
      views: {
        front: {
          filename: entry.name,
          publicPath: `/models/${modelFolderName}/${entry.name}`,
        },
      },
    });
  }

  const deduped = new Map<string, ModelPose>();
  for (const look of looks) {
    if (!deduped.has(look.id)) deduped.set(look.id, look);
  }
  return [...deduped.values()];
}

const MODEL_ORDER_PRIORITY: Record<string, number> = {
  sydney: 0,
  bianca: 1,
  pants: 2,
};

function displayModelName(modelId: string, folderName: string): string {
  if (modelId === "pants") return "Pants Library";
  return folderName.charAt(0).toUpperCase() + folderName.slice(1).toLowerCase();
}

/**
 * Scan public/models/ and return the full catalog. Cheap — just filesystem
 * reads, no uploads. Safe to call on every request.
 */
export function listHumanModels(): HumanModel[] {
  const modelsDir = path.join(process.cwd(), "public", "models");
  if (!fs.existsSync(modelsDir)) return [];

  const entries = fs.readdirSync(modelsDir, { withFileTypes: true });
  const models: HumanModel[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const modelId = entry.name.toLowerCase();
    const poses = collectPresetImages(entry.name);
    // Sort presets by filename for stable ordering ("Bianca1" before "Bianca2").
    poses.sort((a, b) => a.filename.localeCompare(b.filename, undefined, { numeric: true }));
    if (poses.length === 0) continue;

    models.push({
      id: modelId,
      name: displayModelName(modelId, entry.name),
      poses,
    });
  }

  // Sort models by explicit priority first, then alphabetically.
  models.sort((a, b) => {
    const aPriority = MODEL_ORDER_PRIORITY[a.id] ?? Number.MAX_SAFE_INTEGER;
    const bPriority = MODEL_ORDER_PRIORITY[b.id] ?? Number.MAX_SAFE_INTEGER;
    if (aPriority !== bPriority) return aPriority - bPriority;
    return a.name.localeCompare(b.name);
  });
  return models;
}

/**
 * Resolve a model + preset pair to a fal.ai-hosted URL. Uploads the local file
 * to fal storage the first time it's requested and caches the URL afterwards.
 */
const poseUrlCache = new Map<string, string>();
const poseUploadsInFlight = new Map<string, Promise<string>>();

export async function getPoseUrl(
  modelId: string,
  poseId: string,
  view: PresetView = "front"
): Promise<string> {
  const cacheKey = `${modelId}/${poseId}/${view}`;
  if (poseUrlCache.has(cacheKey)) return poseUrlCache.get(cacheKey)!;
  const existing = poseUploadsInFlight.get(cacheKey);
  if (existing) return existing;

  const upload = (async () => {
    const models = listHumanModels();
    const model = models.find((m) => m.id === modelId);
    if (!model) throw new Error(`Unknown model: ${modelId}`);
    const pose = model.poses.find((p) => p.id === poseId);
    if (!pose) throw new Error(`Unknown pose: ${modelId}/${poseId}`);
    const chosenView =
      pose.views[view] || pose.views.front || pose.views.full || pose.views.side || pose.views.back;
    if (!chosenView) throw new Error(`No preset image available for ${modelId}/${poseId}`);

    // Folder name on disk may be cased ("bianca" or "Bianca") — re-resolve it.
    const actualFolder = fs
      .readdirSync(path.join(process.cwd(), "public", "models"))
      .find((d) => d.toLowerCase() === model.id);
    const baseDir = actualFolder
      ? path.join(process.cwd(), "public", "models", actualFolder)
      : path.join(process.cwd(), "public", "models", model.id);
    const resolvedPath = pose.subdir
      ? path.join(baseDir, pose.subdir, chosenView.filename)
      : path.join(baseDir, chosenView.filename);

    const buffer = fs.readFileSync(resolvedPath);
    const ext = path.extname(chosenView.filename).slice(1).toLowerCase();
    const mime = ext === "jpg" || ext === "jpeg" ? "image/jpeg" : `image/${ext}`;
    const blob = new Blob([buffer], { type: mime });
    const url = await uploadToFal(blob, chosenView.filename);
    poseUrlCache.set(cacheKey, url);
    console.log(`[models-registry] uploaded ${cacheKey} → ${url}`);
    return url;
  })().finally(() => {
    poseUploadsInFlight.delete(cacheKey);
  });

  poseUploadsInFlight.set(cacheKey, upload);
  return upload;
}
