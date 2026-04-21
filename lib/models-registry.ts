// Server-side registry of human models available for the Model Studio feature.
//
// Pattern: each subdirectory of public/models/ represents one model. The folder
// name becomes the model's ID (e.g. "bianca"). Every image file inside that
// folder is treated as a "pose" — a different photograph of that model the user
// can pick as the canvas for their garment-swap edit.
//
// When the user triggers a generation with a given model + pose, we lazily
// upload that pose file to fal.ai storage and cache the resulting URL in
// memory for the lifetime of the serverless instance. Subsequent generations
// using the same pose reuse the cached URL — no re-upload cost.

import fs from "node:fs";
import path from "node:path";
import { uploadToFal } from "./fal";

export interface ModelPose {
  /** Stable pose ID, derived from the filename stem (e.g. "bianca1"). */
  id: string;
  /** Display label (e.g. "Pose 1"). */
  label: string;
  /** Public path that Next.js serves directly (e.g. "/models/bianca/Bianca1.png"). */
  publicPath: string;
  /** Filename on disk (e.g. "Bianca1.png"). */
  filename: string;
}

export interface HumanModel {
  /** Model ID — the folder name, lowercased (e.g. "bianca"). */
  id: string;
  /** Display name (first letter uppercased, e.g. "Bianca"). */
  name: string;
  poses: ModelPose[];
}

const IMAGE_EXTS = new Set(["png", "jpg", "jpeg", "webp"]);

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
    const modelDir = path.join(modelsDir, entry.name);

    const files = fs.readdirSync(modelDir);
    const poses: ModelPose[] = [];
    for (const file of files) {
      const lower = file.toLowerCase();
      const ext = lower.split(".").pop() || "";
      if (!IMAGE_EXTS.has(ext)) continue;
      const stem = file.replace(/\.[^.]+$/, "");
      poses.push({
        id: stem.toLowerCase(),
        label: stem,
        publicPath: `/models/${entry.name}/${file}`,
        filename: file,
      });
    }
    // Sort poses by filename for stable ordering ("Bianca1" before "Bianca2").
    poses.sort((a, b) => a.filename.localeCompare(b.filename, undefined, { numeric: true }));
    if (poses.length === 0) continue;

    models.push({
      id: modelId,
      name: entry.name.charAt(0).toUpperCase() + entry.name.slice(1).toLowerCase(),
      poses,
    });
  }

  // Sort models alphabetically by name.
  models.sort((a, b) => a.name.localeCompare(b.name));
  return models;
}

/**
 * Resolve a model + pose pair to a fal.ai-hosted URL. Uploads the local file
 * to fal storage the first time it's requested and caches the URL afterwards.
 */
const poseUrlCache = new Map<string, string>();
const poseUploadsInFlight = new Map<string, Promise<string>>();

export async function getPoseUrl(modelId: string, poseId: string): Promise<string> {
  const cacheKey = `${modelId}/${poseId}`;
  if (poseUrlCache.has(cacheKey)) return poseUrlCache.get(cacheKey)!;
  const existing = poseUploadsInFlight.get(cacheKey);
  if (existing) return existing;

  const upload = (async () => {
    const models = listHumanModels();
    const model = models.find((m) => m.id === modelId);
    if (!model) throw new Error(`Unknown model: ${modelId}`);
    const pose = model.poses.find((p) => p.id === poseId);
    if (!pose) throw new Error(`Unknown pose: ${modelId}/${poseId}`);

    const fullPath = path.join(process.cwd(), "public", "models", model.id, pose.filename);
    // Folder name on disk may be cased ("bianca" or "Bianca") — re-resolve it.
    const actualFolder = fs
      .readdirSync(path.join(process.cwd(), "public", "models"))
      .find((d) => d.toLowerCase() === model.id);
    const resolvedPath = actualFolder
      ? path.join(process.cwd(), "public", "models", actualFolder, pose.filename)
      : fullPath;

    const buffer = fs.readFileSync(resolvedPath);
    const ext = path.extname(pose.filename).slice(1).toLowerCase();
    const mime = ext === "jpg" || ext === "jpeg" ? "image/jpeg" : `image/${ext}`;
    const blob = new Blob([buffer], { type: mime });
    const url = await uploadToFal(blob, pose.filename);
    poseUrlCache.set(cacheKey, url);
    console.log(`[models-registry] uploaded ${cacheKey} → ${url}`);
    return url;
  })().finally(() => {
    poseUploadsInFlight.delete(cacheKey);
  });

  poseUploadsInFlight.set(cacheKey, upload);
  return upload;
}
