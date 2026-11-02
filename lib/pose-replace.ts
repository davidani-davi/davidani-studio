import type { AutoContour } from './model-admin-core';
import type { ReferencePixels } from './garment-only';
import { contourFaceMask } from './contour-face-mask';
import type { PoseVersion, UserPose } from './user-poses';

/**
 * Replace photo / Undo for one pose of a recast set (Model Studio, "Photos in this set"). A person downloads a pose,
 * edits it and sends it back. Every outline is bound to its photo's size and pixels, so the photo's face outline has to
 * follow it: when the edit keeps the photo's shape (same aspect ratio, any size), the reviewed outline is carried over,
 * scaled to the new size and bound to the new pixels. That needs no paid call. When the shape changed (a crop), the
 * outline no longer fits and Studio must find one again (one fal Florence-2 call), which only runs when the person
 * agrees to it.
 */
export const MAX_HISTORY = 10;
const ASPECT_TOLERANCE = 0.005;

export type CarryResult = { use: AutoContour } | { needsAuto: string };

const round = (n: number) => Math.round(n * 100) / 100;

/** The pose's outline moved onto the new photo, or why it cannot be. */
export function carryOutline(old: AutoContour | undefined, ref: ReferencePixels, now = new Date()): CarryResult {
  if (!old) return { needsAuto: 'this photo had no face outline to keep' };
  const was = old.width / old.height;
  const is = ref.width / ref.height;
  if (Math.abs(was - is) / was > ASPECT_TOLERANCE) {
    return { needsAuto: `the photo's shape changed (${old.width}x${old.height} to ${ref.width}x${ref.height}), so the old face outline no longer fits` };
  }
  const bound = { width: ref.width, height: ref.height, sha256: ref.sha256, source: old.source, detectedAt: now.toISOString(), ...(old.fit ? { fit: old.fit } : {}) };
  if (old.kind === 'no-head') return { use: { ...bound, kind: 'no-head' } };
  if (!old.points?.length || typeof old.featherPixels !== 'number') return { needsAuto: 'the old face outline has no points' };
  const s = ref.width / old.width;
  const points = old.points.map(([x, y]) => [
    Math.min(ref.width - 1, Math.max(0, round(x * s))),
    Math.min(ref.height - 1, Math.max(0, round(y * s))),
  ] as [number, number]);
  const featherPixels = Math.max(1, round(old.featherPixels * s));
  const contour: AutoContour = {
    ...bound, kind: 'contour', points, featherPixels,
    ...(typeof old.garmentBoundaryY === 'number' ? { garmentBoundaryY: Math.min(ref.height, Math.round(old.garmentBoundaryY * s)) } : {}),
  };
  try {
    // The exact check a render runs (lib/simple-reference-shot.ts), so a carried outline never fails there.
    contourFaceMask(ref, { width: ref.width, height: ref.height, sha256: ref.sha256, points, featherPixels });
  } catch (err) {
    return { needsAuto: `the old face outline does not fit the new photo (${(err as Error).message})` };
  }
  return { use: contour };
}

/** The pose with its new photo; the photo it replaced goes on its history for Undo. */
export function withReplacedPhoto(pose: UserPose, next: { url: string; thumbUrl?: string; contour: AutoContour; carried: boolean },
  by: string, now = new Date()): UserPose {
  const previous: PoseVersion = {
    url: pose.url, ...(pose.thumbUrl ? { thumbUrl: pose.thumbUrl } : {}), ...(pose.contour ? { contour: pose.contour } : {}),
    checks: pose.checks, ...(pose.replaced ? { replaced: pose.replaced } : {}),
  };
  const { thumbUrl: _thumb, ...rest } = pose;
  return {
    ...rest,
    url: next.url,
    ...(next.thumbUrl ? { thumbUrl: next.thumbUrl } : {}),
    contour: next.contour,
    // A person chose this photo, so it counts as checked; the recast checks of the old photo stay on its history.
    checks: { pass: true, outline: { ok: true, source: next.contour.source, reason: next.carried ? 'kept from the photo it replaced' : 'found automatically' } },
    replaced: { by, at: now.toISOString() },
    history: [...(pose.history || []), previous].slice(-MAX_HISTORY),
  };
}

/** The pose with its last replaced photo back, or null when nothing was replaced. */
export function withUndonePhoto(pose: UserPose): UserPose | null {
  const history = pose.history || [];
  const last = history[history.length - 1];
  if (!last) return null;
  const { thumbUrl: _t, contour: _c, replaced: _r, history: _h, ...rest } = pose;
  const left = history.slice(0, -1);
  return {
    ...rest,
    url: last.url,
    ...(last.thumbUrl ? { thumbUrl: last.thumbUrl } : {}),
    ...(last.contour ? { contour: last.contour } : {}),
    checks: last.checks,
    ...(last.replaced ? { replaced: last.replaced } : {}),
    ...(left.length ? { history: left } : {}),
  };
}
