import sharp from 'sharp';
import type { AutoContour } from './model-admin-core';
import type { ReferencePixels } from './garment-only';
import { contourFaceMask } from './contour-face-mask';
import { locateFace, mapPoint } from './face-align';
import type { PoseChecks, PoseVersion, UserPose } from './user-poses';

/**
 * Replace photo / Undo for one pose of a recast set (Model Studio, "Photos in this set"). A person downloads a pose,
 * edits it and sends it back. Every outline is bound to its photo's size and pixels, so the photo's face outline has to
 * follow it. It is carried over only when the face it marks is really in the new photo: Studio compares the face area of
 * the photo the outline was drawn on with the same area of the new photo. An edit of the same shot keeps the outline
 * where it was; the same shot resized or shifted moves it with the face. Anything else (a different photo of the model,
 * a crop that changed the shape) needs a new outline (one fal Florence-2 call), which only runs when the person agrees.
 *
 * 2026-11-03: the old rule only compared the photos' shapes, so on DJ60275A a different photo of the same shape kept an
 * outline that stopped at her nose (the render split her face across the mouth) and one that covered her shoulder (the
 * base photo's tank strap was pasted over the coat).
 */
export const MAX_HISTORY = 10;
const ASPECT_TOLERANCE = 0.005;
/** How alike the face area must be (normalised cross-correlation, 1 = identical). On 34 replaced photos (2026-11-03)
 * edits of the same shot scored 0.999 or more, different photos of the same model 0.90 or less. */
export const SAME_FACE = 0.95;
const WORK_WIDTH = 1024;

export type Carried = { from: string; score: number; moved: boolean };
export type CarryResult = { use: AutoContour; carried: Carried } | { needsAuto: string };

const round = (n: number) => Math.round(n * 100) / 100;
const CARRIED_REASONS = /^(kept from|moved with)/;
const isCarried = (c?: PoseChecks) => Boolean(c?.outline?.carried) || CARRIED_REASONS.test(c?.outline?.reason || '');

/** The photo this pose's outline was drawn on: the current photo, or the first one before outlines carried by Replace. */
export function outlineOrigin(pose: UserPose): { url: string; contour?: AutoContour } {
  const chain: { url: string; contour?: AutoContour; checks?: PoseChecks }[] = [...(pose.history || []), pose];
  let i = chain.length - 1;
  while (i > 0 && isCarried(chain[i].checks)) i--;
  return { url: chain[i].url, contour: chain[i].contour };
}

async function working(ref: ReferencePixels, width: number, height: number) {
  if (ref.width === width && ref.height === height) return ref.data;
  return sharp(ref.data, { raw: { width: ref.width, height: ref.height, channels: 4 } }).resize(width, height, { fit: 'fill' }).raw().toBuffer();
}

function frameMatch(a: Buffer, b: Buffer, w: number, h: number) {
  let sa = 0, sb = 0, saa = 0, sbb = 0, sab = 0;
  const n = w * h;
  for (let i = 0; i < n; i++) {
    const x = a[i * 4] * 0.299 + a[i * 4 + 1] * 0.587 + a[i * 4 + 2] * 0.114, y = b[i * 4] * 0.299 + b[i * 4 + 1] * 0.587 + b[i * 4 + 2] * 0.114;
    sa += x; sb += y; saa += x * x; sbb += y * y; sab += x * y;
  }
  const va = saa - sa * sa / n, vb = sbb - sb * sb / n;
  return va > 0 && vb > 0 ? (sab - sa * sb / n) / Math.sqrt(va * vb) : 0;
}

/**
 * The outline drawn on `origin` moved onto the new photo `ref`, or why it cannot be. `origin.ref` is that photo's pixels
 * (null when the pose had no outline).
 */
export async function carryOutline(origin: { url: string; contour?: AutoContour; ref: ReferencePixels | null }, ref: ReferencePixels,
  now = new Date()): Promise<CarryResult> {
  const old = origin.contour;
  if (!old || !origin.ref) return { needsAuto: 'this photo had no face outline to keep' };
  if (origin.ref.sha256 !== old.sha256 || origin.ref.width !== old.width || origin.ref.height !== old.height)
    return { needsAuto: 'the face outline no longer matches the photo it was drawn on' };
  const was = old.width / old.height;
  const is = ref.width / ref.height;
  if (Math.abs(was - is) / was > ASPECT_TOLERANCE) {
    return { needsAuto: `the photo's shape changed (${old.width}x${old.height} to ${ref.width}x${ref.height}), so the old face outline no longer fits` };
  }
  const bound = { width: ref.width, height: ref.height, sha256: ref.sha256, source: old.source, detectedAt: now.toISOString(), ...(old.fit ? { fit: old.fit } : {}) };
  const differentShot = (score: number) => ({ needsAuto: `the new photo is a different shot from the one the face outline was drawn on (face match ${score.toFixed(2)}), so the outline would not sit on her face` });
  // Compare at most 1024 px wide: precise enough for an outline, and quick.
  const k = Math.min(1, WORK_WIDTH / old.width), W = Math.round(old.width * k), H = Math.round(old.height * k);
  const [a, b] = await Promise.all([working(origin.ref, W, H), working(ref, W, H)]);
  if (old.kind === 'no-head') {
    const score = frameMatch(a, b, W, H);
    if (score < SAME_FACE) return differentShot(score);
    return { use: { ...bound, kind: 'no-head' }, carried: { from: origin.url, score: +score.toFixed(4), moved: false } };
  }
  if (!old.points?.length || typeof old.featherPixels !== 'number') return { needsAuto: 'the old face outline has no points' };
  const workMask = contourFaceMask({ data: a, width: W, height: H, sha256: 'work' },
    { width: W, height: H, sha256: 'work', points: old.points.map(([x, y]) => [x * k, y * k] as [number, number]), featherPixels: Math.max(1, old.featherPixels * k) });
  const found = locateFace({ data: a, width: W, height: H, sha256: 'work' }, b, workMask, { enough: SAME_FACE });
  if (!found) return { needsAuto: 'the old face outline is too small to check against the new photo' };
  const moved = found.scoreInPlace < SAME_FACE;
  if (moved && found.score < SAME_FACE) return differentShot(found.score);
  // Old photo -> working size -> (moved with the face) -> new photo.
  const s = ref.width / W;
  const place = (x: number, y: number): [number, number] => {
    const [px, py] = moved ? mapPoint(found, x * k, y * k) : [x * k, y * k];
    return [Math.min(ref.width - 1, Math.max(0, round(px * s))), Math.min(ref.height - 1, Math.max(0, round(py * s)))];
  };
  const grow = (moved ? found.scale : 1) * k * s;
  const points = old.points.map(([x, y]) => place(x, y));
  const featherPixels = Math.max(1, round(old.featherPixels * grow));
  const boundary = typeof old.garmentBoundaryY === 'number'
    ? Math.min(ref.height, Math.max(0, Math.round(moved ? (found.cy + found.dy + found.scale * (old.garmentBoundaryY * k - found.cy)) * s : old.garmentBoundaryY * k * s)))
    : undefined;
  const contour: AutoContour = { ...bound, kind: 'contour', points, featherPixels, ...(boundary !== undefined ? { garmentBoundaryY: boundary } : {}) };
  try {
    // The exact check a render runs (lib/simple-reference-shot.ts), so a carried outline never fails there.
    contourFaceMask(ref, { width: ref.width, height: ref.height, sha256: ref.sha256, points, featherPixels });
  } catch (err) {
    return { needsAuto: `the old face outline does not fit the new photo (${(err as Error).message})` };
  }
  return { use: contour, carried: { from: origin.url, score: moved ? found.score : found.scoreInPlace, moved } };
}

/** The pose with its new photo; the photo it replaced goes on its history for Undo. */
export function withReplacedPhoto(pose: UserPose, next: { url: string; thumbUrl?: string; contour: AutoContour; carried?: Carried },
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
    checks: { pass: true, outline: outlineCheck(next.contour, next.carried) },
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

function outlineCheck(contour: AutoContour, carried?: Carried): NonNullable<PoseChecks['outline']> {
  const reason = !carried ? 'found automatically' : carried.moved ? 'moved with the face from the photo it was drawn on' : 'kept from the photo it replaced';
  return { ok: true, source: contour.source, reason, ...(carried ? { carried } : {}) };
}

/** The pose with a new outline for the photo it already has (Find the face outline again); the photo stays. */
export function withNewOutline(pose: UserPose, contour: AutoContour, carried?: Carried): UserPose {
  return { ...pose, contour, checks: { ...pose.checks, pass: true, outline: outlineCheck(contour, carried) } };
}
