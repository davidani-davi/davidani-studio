import { createHash } from 'node:crypto';
import type { HumanModel } from './models-registry';
import type { KnownGarment } from './garment-contract';
import type { PlateFraming } from './plate-framing';
import {
  emptyPoseUsage, mergeGarmentReads, pickPose, slotPoses, titleGarmentRead,
  type GarmentRead, type PoseSlot, type PoseUsage, type UserPose,
} from './user-poses';

/**
 * Which pose of a recast set a Model Studio view renders on (/api/model-shots). A pose asked for by id (Other pose)
 * is used as asked; the set's catalogue pose id (`<set>-pose`, what every client sends) or none means "pick for me":
 * lib/user-poses.ts pickPose, after reading the garment once per style (title rules + one cached vision call).
 */
export type PosePickDeps = {
  readUsage: (setId: string, slot: PoseSlot) => Promise<PoseUsage>;
  recordUse: (setId: string, slot: PoseSlot, poseId: string, styleCode?: string) => Promise<void>;
  readCachedGarment: (key: string) => Promise<GarmentRead | null>;
  writeCachedGarment: (key: string, read: GarmentRead) => Promise<void>;
  visionRead: (imageUrl: string) => Promise<GarmentRead | null>;
  visionTimeoutMs?: number;
};

export type SetPoseChoice =
  | { ok: true; pose: UserPose; reason: string; requested: boolean }
  | { ok: false; status: number; error: string };

const styleOf = (known: KnownGarment) => String(known.styleCode || '').trim().toUpperCase();

/** The garment read for a style: title rules OR'd with the cached vision read. A failed or slow vision call falls back to the title. */
export async function garmentReadFor(known: KnownGarment, garmentImageUrls: string[], deps: PosePickDeps): Promise<GarmentRead> {
  const title = titleGarmentRead((known as { title?: unknown }).title);
  const image = garmentImageUrls[0];
  if (!image) return title;
  const key = styleOf(known) || `img-${createHash('sha256').update(image).digest('hex').slice(0, 16)}`;
  const cached = await deps.readCachedGarment(key).catch(() => null);
  if (cached) return mergeGarmentReads(title, cached);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => { timer = setTimeout(() => resolve(null), deps.visionTimeoutMs ?? 20_000); });
  const seen = await Promise.race([deps.visionRead(image).catch(() => null), timeout]).finally(() => clearTimeout(timer));
  if (!seen) return title;
  await deps.writeCachedGarment(key, seen).catch((err) => console.warn('[pose pick] garment read not cached:', err?.message || err));
  return mergeGarmentReads(title, seen);
}

/** Null when the set has no poses (an older set: its single photo per view is used as before). */
export async function chooseSetPose(
  set: HumanModel,
  o: { requestedPoseId: string; view: PoseSlot; framing: PlateFraming; known: KnownGarment; garmentImageUrls: string[] },
  deps: PosePickDeps,
): Promise<SetPoseChoice | null> {
  const poses = set.userPoses;
  if (!poses?.length) return null;
  const style = styleOf(o.known);
  const candidates = slotPoses(poses, o.view);
  const record = (pose: UserPose) =>
    deps.recordUse(set.id, o.view, pose.id, style || undefined).catch((err) => console.warn('[pose pick] use not recorded:', err?.message || err));

  const catalogPoseId = set.poses[0]?.id;
  if (o.requestedPoseId && o.requestedPoseId !== catalogPoseId) {
    const pose = poses.find((p) => p.id === o.requestedPoseId);
    if (!pose) return { ok: false, status: 400, error: `${set.name} has no pose ${o.requestedPoseId}.` };
    if (pose.removed) return { ok: false, status: 400, error: `Pose ${pose.id} was removed from ${set.name}. Choose another pose.` };
    if (!candidates.includes(pose)) {
      const why = pose.checks?.pass !== true ? `it failed its checks${pose.checks?.outline?.reason ? ` (${pose.checks.outline.reason})` : ''}` : `it is a ${pose.view} ${pose.framing} pose`;
      return { ok: false, status: 400, error: `Pose ${pose.id} cannot shoot the ${o.view} view: ${why}.` };
    }
    // Chosen by hand: it becomes the style's pose for this view, so its other colours follow.
    await record(pose);
    return { ok: true, pose, reason: 'chosen by hand', requested: true };
  }

  if (!candidates.length) return { ok: false, status: 400, error: `${set.name} has no ${o.view} pose that passed its checks.` };
  const usage = await deps.readUsage(set.id, o.view).catch(() => emptyPoseUsage());
  // A style that already has its pose for this view needs no garment read.
  const prior = style ? usage.choices[style] : undefined;
  const garment = prior && candidates.some((p) => p.id === prior)
    ? titleGarmentRead((o.known as { title?: unknown }).title)
    : await garmentReadFor(o.known, o.garmentImageUrls, deps);
  const pick = pickPose({ poses, slot: o.view, framing: o.framing, garment, usage, styleCode: style });
  if (!pick) return { ok: false, status: 400, error: `${set.name} has no ${o.view} pose that passed its checks.` };
  await record(pick.pose);
  return { ok: true, pose: pick.pose, reason: pick.reason, requested: false };
}
