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
// Model pose assets live under public/models/. Generation and analysis routes
// can hand those stable public URLs directly to the image backend, which avoids
// a fragile storage upload during every cold serverless instance.

import fs from "node:fs";
import path from "node:path";
import { uploadToFal } from "./fal";
import { STATIC_HUMAN_MODELS } from "./models-static-manifest";
import { listUserModels } from "./user-assets";

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
  /**
   * Primary file per view (the one shown in the sidebar preview).
   * Backward-compatible — every existing reader of pose.views[view] still
   * resolves to a single object.
   */
  views: Partial<Record<PresetView, { filename: string; publicPath: string }>>;
  /**
   * Optional alternate pose photos for the same view, sorted by their
   * numeric suffix ("front2" → index 0, "front3" → index 1, etc.). The
   * primary pose photo is NOT included here — it lives in `views[view]`.
   * Studio 1's trio generation cycles through these so each Variant
   * A/B/C uses a different reference when files are available.
   */
  viewVariants?: Partial<Record<PresetView, Array<{ filename: string; publicPath: string }>>>;
}

export type PresetView = "front" | "side" | "back" | "full";

export interface HumanModel {
  /** Model ID — the folder name, lowercased (e.g. "bianca"). */
  id: string;
  /** Display name shown in the UI. */
  name: string;
  poses: ModelPose[];
  /** True for user-uploaded models stored in Blob (deletable in the UI). */
  userAdded?: boolean;
}

const IMAGE_EXTS = new Set(["png", "jpg", "jpeg", "webp"]);

/**
 * Folder name used as a "trash" / "draft" zone — anything inside a folder
 * named hide (case-insensitive) is skipped at every scan level. Drop a file
 * or look into a hide/ folder to remove it from the picker without deleting.
 */
const HIDDEN_DIR = "hide";

function isHiddenName(name: string): boolean {
  return name.toLowerCase() === HIDDEN_DIR;
}

function titleCaseWords(text: string): string {
  return text
    .toLowerCase()
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

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
  if (modelFolderName.toLowerCase().startsWith("pants")) {
    return cleaned.replace(/^pants[-_\s]+/i, "");
  }
  return cleaned;
}

/**
 * Parse a filename stem and return both the view (front/side/back/full) and
 * a 0-indexed variant index. The variant index lets a single look carry
 * multiple alternate pose photos for the same view, which Studio 1's trio
 * generation rotates through so each Variant A/B/C uses a different reference.
 *
 * Naming convention:
 *   "celine-front"   → { view: "front", variantIndex: 0 }   (primary)
 *   "celine-front2"  → { view: "front", variantIndex: 1 }
 *   "celine-front3"  → { view: "front", variantIndex: 2 }
 *   "side"           → { view: "side",  variantIndex: 0 }
 *   "side2"          → { view: "side",  variantIndex: 1 }
 *   "fullbody3"      → { view: "full",  variantIndex: 2 }
 *
 * "front1" is treated the same as "front" (index 0). Files without any view
 * token default to front index 0.
 */
function detectViewToken(stem: string): { view: PresetView; variantIndex: number } {
  const lower = stem.toLowerCase();
  // Patterns ordered most specific → most general so "fullbody" wins over "back".
  // (?:^|[^a-z]) and (?:[^a-z]|$) act as non-letter boundaries that still
  // permit a trailing digit suffix to match the (\d*) capture group.
  const patterns: Array<{ view: PresetView; re: RegExp }> = [
    { view: "full",  re: /(?:^|[^a-z])full(?:body)?(\d*)(?:[^a-z]|$)/ },
    { view: "side",  re: /(?:^|[^a-z])side(\d*)(?:[^a-z]|$)/ },
    { view: "back",  re: /(?:^|[^a-z])back(\d*)(?:[^a-z]|$)/ },
    { view: "front", re: /(?:^|[^a-z])front(\d*)(?:[^a-z]|$)/ },
  ];
  for (const { view, re } of patterns) {
    const match = lower.match(re);
    if (match) {
      const numStr = match[1];
      const n = numStr ? parseInt(numStr, 10) : 0;
      const variantIndex = n <= 1 ? 0 : n - 1;
      return { view, variantIndex };
    }
  }
  return { view: "front", variantIndex: 0 };
}

function inferPresetView(stem: string): PresetView {
  return detectViewToken(stem).view;
}

function stripViewToken(stem: string): string {
  return stem
    // Strip view tokens with optional digit suffix so look IDs derived from
    // filenames don't collide ("celine-front" and "celine-front2" should both
    // collapse to "celine" for grouping purposes).
    .replace(/(^|[-_])(front|side|back|full|fullbody)\d*(?=$|[-_])/gi, "$1")
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
      .filter((entry) => entry.isDirectory() && !isHiddenName(entry.name));

    for (const lookDir of lookDirs) {
      const dirPath = path.join(presetsDir, lookDir.name);
      // Skip files inside a `hide` subfolder of this look. We only read top-
      // level files here, but defensive filter in case the convention changes.
      const entries = fs
        .readdirSync(dirPath, { withFileTypes: true })
        .filter((entry) => entry.isFile() && !isHiddenName(entry.name));
      const views: ModelPose["views"] = {};
      // Group every parsed file by view so we can sort numbered variants
      // ("front" → 0, "front2" → 1, "front3" → 2, …) and store them in
      // viewVariants alongside the primary that goes into views[view].
      const buckets: Partial<
        Record<
          PresetView,
          Array<{ variantIndex: number; filename: string; publicPath: string }>
        >
      > = {};

      for (const entry of entries) {
        const ext = entry.name.toLowerCase().split(".").pop() || "";
        if (!IMAGE_EXTS.has(ext)) continue;
        const stem = entry.name.replace(/\.[^.]+$/, "");
        const { view, variantIndex } = detectViewToken(stem);
        const publicPath = `/models/${modelFolderName}/presets/${lookDir.name}/${entry.name}`;
        if (!buckets[view]) buckets[view] = [];
        buckets[view]!.push({ variantIndex, filename: entry.name, publicPath });
      }

      const viewVariants: NonNullable<ModelPose["viewVariants"]> = {};
      for (const view of Object.keys(buckets) as PresetView[]) {
        const sorted = buckets[view]!.slice().sort((a, b) => a.variantIndex - b.variantIndex);
        const primary = sorted.find((entry) => entry.variantIndex === 0) ?? sorted[0];
        if (primary) {
          views[view] = {
            filename: primary.filename,
            publicPath: primary.publicPath,
          };
        }
        const extras = sorted.filter(
          (entry) => entry.variantIndex > 0 && entry.publicPath !== primary?.publicPath
        );
        if (extras.length > 0) {
          viewVariants[view] = extras.map(({ filename, publicPath }) => ({
            filename,
            publicPath,
          }));
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
        ...(Object.keys(viewVariants).length > 0 ? { viewVariants } : {}),
      });
    }
  }

  const legacyEntries = fs
    .readdirSync(modelDir, { withFileTypes: true })
    .filter((entry) => !isHiddenName(entry.name));
  const legacyGroups = new Map<
    string,
    {
      displayStem: string;
      filename: string;
      publicPath: string;
      views: ModelPose["views"];
      // Bucketed by view so we can sort numbered variants and compute
      // viewVariants per look at the end (mirrors the presets/ block above).
      buckets: Partial<
        Record<
          PresetView,
          Array<{ variantIndex: number; filename: string; publicPath: string }>
        >
      >;
    }
  >();

  for (const entry of legacyEntries) {
    if (!entry.isFile()) continue;
    const ext = entry.name.toLowerCase().split(".").pop() || "";
    if (!IMAGE_EXTS.has(ext)) continue;

    const stem = entry.name.replace(/\.[^.]+$/, "");
    const baseStem = stripViewToken(stem) || modelFolderName;
    const displayStem = stripLibraryPrefix(baseStem, modelFolderName);
    const groupId = baseStem.toLowerCase();
    const { view, variantIndex } = detectViewToken(stem);
    const publicPath = `/models/${modelFolderName}/${entry.name}`;
    const existing = legacyGroups.get(groupId) ?? {
      displayStem,
      filename: entry.name,
      publicPath,
      views: {},
      buckets: {},
    };

    if (!existing.buckets[view]) existing.buckets[view] = [];
    existing.buckets[view]!.push({ variantIndex, filename: entry.name, publicPath });
    legacyGroups.set(groupId, existing);
  }

  for (const [groupId, group] of legacyGroups) {
    const viewVariants: NonNullable<ModelPose["viewVariants"]> = {};
    for (const view of Object.keys(group.buckets) as PresetView[]) {
      const sorted = group.buckets[view]!.slice().sort((a, b) => a.variantIndex - b.variantIndex);
      const primary = sorted.find((entry) => entry.variantIndex === 0) ?? sorted[0];
      if (primary) {
        group.views[view] = {
          filename: primary.filename,
          publicPath: primary.publicPath,
        };
      }
      const extras = sorted.filter(
        (entry) => entry.variantIndex > 0 && entry.publicPath !== primary?.publicPath
      );
      if (extras.length > 0) {
        viewVariants[view] = extras.map(({ filename, publicPath }) => ({
          filename,
          publicPath,
        }));
      }
    }
    const front = group.views.front || group.views.full || group.views.side || group.views.back;
    if (!front) continue;
    group.filename = front.filename;
    group.publicPath = front.publicPath;
    looks.push({
      id: groupId,
      label: prettifyPresetLabel(group.displayStem),
      publicPath: front.publicPath,
      filename: front.filename,
      subdir: "",
      views: group.views,
      ...(Object.keys(viewVariants).length > 0 ? { viewVariants } : {}),
    });
  }

  const deduped = new Map<string, ModelPose>();
  for (const look of looks) {
    if (!deduped.has(look.id)) deduped.set(look.id, look);
  }
  return [...deduped.values()];
}

// Explicit ordering for plates that should sort ahead of the rest. Empty since
// the house set replaced the kylie/celine/sydney/pants plates (2026-09-05):
// "studio NN" and its derived "crop NN" / "low NN" families sort by name.
const MODEL_ORDER_PRIORITY: Record<string, number> = {};

function displayModelName(modelId: string, folderName: string): string {
  return titleCaseWords(folderName);
}

/**
 * Scan public/models/ and return the full catalog. Cheap — just filesystem
 * reads, no uploads. Safe to call on every request.
 */
export function listHumanModels(): HumanModel[] {
  const modelsDir = path.join(process.cwd(), "public", "models");
  if (!fs.existsSync(modelsDir)) return STATIC_HUMAN_MODELS;

  const entries = fs.readdirSync(modelsDir, { withFileTypes: true });
  const models: HumanModel[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    // Skip any model folder named "hide" so an entire model can be hidden by
    // moving its directory under public/models/hide/ or renaming it.
    if (isHiddenName(entry.name)) continue;
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
  return models.length > 0 ? models : STATIC_HUMAN_MODELS;
}

/**
 * True when modelId is one of the built-in filesystem/static models. Cheap
 * (fs scan only) — used by the analyze/generate hot path to skip the Vercel
 * Blob user-model lookup entirely for built-in models, which would otherwise
 * cost a network round-trip on every request.
 */
export function isKnownHumanModel(modelId: string): boolean {
  return listHumanModels().some((m) => m.id === modelId);
}

/**
 * Resolve a model + preset pair to a fal.ai-hosted URL. Uploads the local file
 * to fal storage the first time it's requested and caches the URL afterwards.
 */
const poseUrlCache = new Map<string, string>();
const poseUploadsInFlight = new Map<string, Promise<string>>();

/**
 * Resolve the chosen view file for a model+look, optionally picking a numbered
 * variant (front2, front3, …). variantIndex 0 (default) returns the primary
 * pose photo (current behavior). Higher indices look up
 * `viewVariants[view][variantIndex - 1]` and fall back to the primary if the
 * variant doesn't exist.
 */
function resolvePoseFile(
  pose: ModelPose,
  view: PresetView,
  variantIndex: number
): { filename: string; publicPath: string } | undefined {
  const primary =
    pose.views[view] || pose.views.front || pose.views.full || pose.views.side || pose.views.back;
  if (variantIndex <= 0) return primary;
  const variants = pose.viewVariants?.[view];
  const candidate = variants ? variants[variantIndex - 1] : undefined;
  return candidate ?? primary;
}

export function getPosePublicPath(
  modelId: string,
  poseId: string,
  view: PresetView = "front",
  variantIndex: number = 0
): string {
  const models = listHumanModels();
  const model = models.find((m) => m.id === modelId);
  if (!model) throw new Error(`Unknown model: ${modelId}`);
  const pose = model.poses.find((p) => p.id === poseId);
  if (!pose) throw new Error(`Unknown pose: ${modelId}/${poseId}`);
  const chosenView = resolvePoseFile(pose, view, variantIndex);
  if (!chosenView) throw new Error(`No preset image available for ${modelId}/${poseId}`);
  return chosenView.publicPath;
}

export async function getPoseUrl(
  modelId: string,
  poseId: string,
  view: PresetView = "front",
  variantIndex: number = 0
): Promise<string> {
  // The cache key includes variantIndex so each numbered alternate uploads /
  // caches independently; primary requests stay backward compatible.
  const cacheKey = `${modelId}/${poseId}/${view}/${variantIndex}`;
  if (poseUrlCache.has(cacheKey)) return poseUrlCache.get(cacheKey)!;
  const existing = poseUploadsInFlight.get(cacheKey);
  if (existing) return existing;

  const upload = (async () => {
    const models = listHumanModels();
    const model = models.find((m) => m.id === modelId);
    if (!model) throw new Error(`Unknown model: ${modelId}`);
    const pose = model.poses.find((p) => p.id === poseId);
    if (!pose) throw new Error(`Unknown pose: ${modelId}/${poseId}`);
    const chosenView = resolvePoseFile(pose, view, variantIndex);
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

/**
 * Filesystem/static models followed by user-uploaded (Blob) models converted
 * to the HumanModel shape. Async because user models live in Blob storage.
 */
export async function listAllHumanModels(): Promise<HumanModel[]> {
  const userModels = await listUserModels().catch((err) => {
    console.warn("[models-registry] user models unavailable:", err);
    return [];
  });
  const converted: HumanModel[] = userModels.map((um) => {
    const views: ModelPose["views"] = {};
    for (const view of ["front", "side", "back", "full"] as const) {
      const url = um.views[view];
      if (url) views[view] = { filename: view, publicPath: url };
    }
    return {
      id: um.id,
      name: um.name,
      userAdded: true,
      poses: [
        {
          id: `${um.id}-pose`,
          label: um.name,
          publicPath: um.views.front,
          filename: "front",
          subdir: "",
          views,
        },
      ],
    };
  });
  return [...listHumanModels(), ...converted];
}
