import sharp from 'sharp';
import type { AutoContour } from './model-admin-core';
import type { ReferencePixels } from './garment-only';
import type { PreparedPose } from './user-assets';
import { contourFaceMask } from './contour-face-mask';
import { resolveDownloadSource } from './download-source';
import { mapLimit } from './map-limit';
import { POSE_ARMS, POSE_FRAMINGS, POSE_STANCES, POSE_VIEWS, type PoseChecks, type UserPose } from './user-poses';

/**
 * Checks the poses of a recast upload (POST /api/user-models with JSON; faire-management chloe_recast/upload.mjs).
 * Photos arrive as hosted URLs (fal storage or Blob), because a look's lossless PNGs are far over the 4.5 MB request
 * limit. Each photo is downloaded once and decoded exactly as a render decodes it. A sent `recast-mask-v1` outline is
 * kept only when it matches that photo's size and decoded-RGBA SHA-256; a mismatch fails the pose and it is never given
 * an automatic outline (a loose box can leave pasted hair edges unprotected). A photo sent with no recast outline gets
 * Studio's automatic one, as on any other upload (lib/draft-contour.ts).
 */
export const MAX_POSES = 40;
const MAX_BYTES = 25 * 1024 * 1024;
const THUMB_WIDTH = 360;

export class PoseUploadError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

export interface PoseInput {
  id: string;
  view: UserPose['view'];
  framing: UserPose['framing'];
  stance: UserPose['stance'];
  arms: UserPose['arms'];
  url: string;
  contour?: unknown;
  checks: Record<string, unknown> & { pass: boolean };
  source?: UserPose['source'];
}

export type PoseUploadDeps = {
  fetch?: typeof fetch;
  referencePixels: (bytes: Buffer) => Promise<ReferencePixels>;
  detect: (url: string, view: string) => Promise<AutoContour | null>;
  thumb?: (bytes: Buffer) => Promise<Buffer>;
  now?: () => Date;
};

const isObj = (v: unknown): v is Record<string, unknown> => Boolean(v) && typeof v === 'object' && !Array.isArray(v);
const oneOf = <T extends string>(list: readonly T[], v: unknown): v is T => typeof v === 'string' && (list as readonly string[]).includes(v);

/** Validates the pose list before anything is downloaded. Throws one PoseUploadError naming every problem. */
export function validatePoseInputs(raw: unknown): PoseInput[] {
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > MAX_POSES) throw new PoseUploadError(`poses must be a list of 1-${MAX_POSES} photos.`);
  const errors: string[] = [];
  const seen = new Set<string>();
  const out = raw.map((p, i) => {
    const at = `poses[${i}]`;
    if (!isObj(p)) {
      errors.push(`${at} is not an object`);
      return null;
    }
    const id = p.id === undefined ? `${p.view}-${String(i + 1).padStart(2, '0')}` : p.id;
    if (typeof id !== 'string' || !/^[a-z0-9][a-z0-9-]{0,79}$/i.test(id)) errors.push(`${at}.id must be letters, digits and dashes (at most 80)`);
    else if (seen.has(id.toLowerCase())) errors.push(`${at}.id ${id} is used twice`);
    else seen.add(id.toLowerCase());
    if (!oneOf(POSE_VIEWS, p.view)) errors.push(`${at}.view must be one of ${POSE_VIEWS.join(', ')}`);
    if (!oneOf(POSE_FRAMINGS, p.framing)) errors.push(`${at}.framing must be one of ${POSE_FRAMINGS.join(', ')}`);
    if (!oneOf(POSE_STANCES, p.stance)) errors.push(`${at}.stance must be one of ${POSE_STANCES.join(', ')}`);
    if (!oneOf(POSE_ARMS, p.arms)) errors.push(`${at}.arms must be one of ${POSE_ARMS.join(', ')}`);
    const src = resolveDownloadSource(typeof p.url === 'string' ? p.url : null);
    if (!src.ok) errors.push(`${at}.url must be an https fal storage or Blob URL (${src.reason})`);
    if (!isObj(p.checks) || typeof p.checks.pass !== 'boolean') errors.push(`${at}.checks must be the recast checks with a true/false "pass"`);
    let source: UserPose['source'];
    if (p.source !== undefined) {
      const s = p.source;
      if (isObj(s) && ['shoot', 'style', 'photo'].every((k) => typeof s[k] === 'string' && (s[k] as string).length <= 200)) {
        source = { shoot: s.shoot as string, style: s.style as string, photo: s.photo as string };
      } else errors.push(`${at}.source must be {shoot, style, photo} text`);
    }
    return { id: String(id).toLowerCase(), view: p.view, framing: p.framing, stance: p.stance, arms: p.arms, url: p.url, contour: p.contour, checks: p.checks, ...(source ? { source } : {}) } as PoseInput;
  });
  if (errors.length) throw new PoseUploadError(errors.slice(0, 12).join('; ') + (errors.length > 12 ? `; and ${errors.length - 12} more` : ''));
  return out as PoseInput[];
}

/** PNG, JPEG or WebP from the first bytes; anything else is refused. */
export function imageExt(bytes: Buffer): PreparedPose['ext'] | null {
  if (bytes.length > 8 && bytes[0] === 0x89 && bytes.toString('latin1', 1, 4) === 'PNG') return 'png';
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpg';
  if (bytes.length > 12 && bytes.toString('latin1', 0, 4) === 'RIFF' && bytes.toString('latin1', 8, 12) === 'WEBP') return 'webp';
  return null;
}

export type OutlineVerdict = { use: AutoContour } | { fail: string } | { fill: string };

/**
 * A sent outline against the photo's decoded pixels. `use` = a recast outline that matches; `fail` = any sent outline
 * that is not a matching recast one (the pose fails and gets no automatic outline); `fill` = no outline was sent at
 * all (Studio finds one, as for any other upload).
 */
export function verifyRecastOutline(sent: unknown, ref: ReferencePixels, framing: UserPose['framing'], now = new Date()): OutlineVerdict {
  if (sent === undefined || sent === null) return { fill: 'no outline sent' };
  if (!isObj(sent)) return { fail: 'the outline is not an object' };
  if (sent.kind === 'missing') return { fail: `the recast tool made no outline${typeof sent.why === 'string' ? ` (${sent.why.slice(0, 120)})` : ''}` };
  if (sent.source !== 'recast-mask-v1') return { fail: `outline source must be recast-mask-v1, not ${String(sent.source ?? 'none').slice(0, 40)}` };
  if (sent.width !== ref.width || sent.height !== ref.height) {
    return { fail: `outline is for a ${String(sent.width)}x${String(sent.height)} photo, this one is ${ref.width}x${ref.height}` };
  }
  if (sent.sha256 !== ref.sha256) return { fail: 'outline does not match the photo pixels (the file changed on the way)' };
  const base = { width: ref.width, height: ref.height, sha256: ref.sha256, source: 'recast-mask-v1' as const, detectedAt: now.toISOString() };
  if (sent.kind === 'no-head') {
    return framing === 'low' ? { use: { ...base, kind: 'no-head' } } : { fail: `no head found on a ${framing} photo` };
  }
  if (sent.kind !== 'contour') return { fail: 'outline kind must be contour or no-head' };
  const points = sent.points as [number, number][];
  const featherPixels = sent.featherPixels as number;
  try {
    if (!Array.isArray(points)) throw new Error('points must be a list');
    // The exact check a render runs (lib/simple-reference-shot.ts), so an outline kept here never fails there.
    contourFaceMask(ref, { width: ref.width, height: ref.height, sha256: ref.sha256, points, featherPixels });
  } catch (err) {
    return { fail: `outline is not valid: ${(err as Error).message}` };
  }
  const garmentBoundaryY = typeof sent.garmentBoundaryY === 'number' && Number.isFinite(sent.garmentBoundaryY) ? sent.garmentBoundaryY : undefined;
  return { use: { ...base, kind: 'contour', points: points.map(([x, y]) => [x, y] as [number, number]), featherPixels, ...(garmentBoundaryY === undefined ? {} : { garmentBoundaryY }) } };
}

/** The recast checks as Studio stores them (checks.json writes hair_blend). Large or unknown entries are dropped. */
export function normalizeChecks(raw: Record<string, unknown>): Omit<PoseChecks, 'outline'> {
  const out: Omit<PoseChecks, 'outline'> = { pass: raw.pass === true };
  const small = (v: unknown) => v !== undefined && JSON.stringify(v).length <= 2000;
  for (const [from, to] of [['face', 'face'], ['hair', 'hair'], ['tattoo', 'tattoo'], ['hair_blend', 'hairBlend'], ['hairBlend', 'hairBlend']] as const) {
    if (small(raw[from])) out[to] = raw[from];
  }
  return out;
}

const makeThumb = (bytes: Buffer) => sharp(bytes).rotate().resize({ width: THUMB_WIDTH, withoutEnlargement: true }).jpeg({ quality: 78 }).toBuffer();

async function prepareOne(p: PoseInput, deps: PoseUploadDeps): Promise<PreparedPose> {
  const f = deps.fetch || fetch;
  let res: Response;
  try {
    res = await f(p.url, { cache: 'no-store', signal: AbortSignal.timeout(45_000) });
  } catch (err) {
    throw new PoseUploadError(`${p.id}: download failed (${(err as Error).message})`, 502);
  }
  if (!res.ok) throw new PoseUploadError(`${p.id}: download failed (HTTP ${res.status})`, 502);
  const bytes = Buffer.from(await res.arrayBuffer());
  if (bytes.length > MAX_BYTES) throw new PoseUploadError(`${p.id}: photo is over 25 MB`);
  const ext = imageExt(bytes);
  if (!ext) throw new PoseUploadError(`${p.id}: not a PNG, JPEG or WebP image`);
  let ref: ReferencePixels;
  try {
    ref = await deps.referencePixels(bytes);
  } catch (err) {
    throw new PoseUploadError(`${p.id}: ${(err as Error).message}`);
  }
  const verdict = verifyRecastOutline(p.contour, ref, p.framing, deps.now?.());
  let contour: AutoContour | undefined;
  let outline: NonNullable<PoseChecks['outline']>;
  if ('use' in verdict) {
    contour = verdict.use;
    outline = { ok: true, source: 'recast-mask-v1' };
  } else if ('fail' in verdict) {
    outline = { ok: false, reason: verdict.fail };
  } else {
    // Same automatic outline as any other upload; the photo bytes are identical, so its binding holds for the stored copy.
    const found = p.framing === 'low' ? null : await deps.detect(p.url, p.view).catch(() => null);
    contour = found || undefined;
    outline = found ? { ok: true, source: found.source, reason: verdict.fill } : { ok: false, reason: `${verdict.fill}; no outline found` };
  }
  const checks: PoseChecks = { ...normalizeChecks(p.checks), outline, pass: p.checks.pass === true && outline.ok };
  const thumb = await (deps.thumb || makeThumb)(bytes).catch(() => undefined);
  const pose: PreparedPose['pose'] = {
    id: p.id, view: p.view, framing: p.framing, stance: p.stance, arms: p.arms,
    ...(contour ? { contour } : {}), checks, ...(p.source ? { source: p.source } : {}),
  };
  return { pose, bytes, ext, ...(thumb ? { thumb } : {}) };
}

/** Downloads and checks every pose, three at a time (a 2000x3000 photo decodes to 24 MB of RGBA). */
export function preparePoses(inputs: PoseInput[], deps: PoseUploadDeps): Promise<PreparedPose[]> {
  return mapLimit(inputs, 3, (p) => prepareOne(p, deps));
}

/** What the upload reports per pose. */
export const poseSummary = (p: PreparedPose['pose']) => ({ id: p.id, view: p.view, framing: p.framing, pass: p.checks.pass, outline: p.checks.outline });
