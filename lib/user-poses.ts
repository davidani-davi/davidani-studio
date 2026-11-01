import type { AutoContour } from './model-admin-core';
import type { PlateFraming } from './plate-framing';

/**
 * Poses of a recast reference set (Chloe recast, 2026-10-31; faire-management
 * docs/superpowers/specs/2026-10-30-chloe-recast-reference-sets-design.md §8). A set still keeps one photo per view in
 * `views`/`contours`: the default pose of each view, which older clients and paths read. `poses` holds every photo of
 * the look with its shoot tags, and /api/model-shots picks one per view: the best fit for the garment, then the least
 * recently used, and the same one for every colour of a style.
 */
export const POSE_VIEWS = ['front', 'side', 'back'] as const;
export const POSE_FRAMINGS = ['full', 'knee', 'crop', 'low'] as const;
export const POSE_STANCES = ['standing', 'walking', 'turned'] as const;
export const POSE_ARMS = ['at-sides', 'away-from-body', 'hand-in-pocket', 'hands-in-pockets', 'hand-on-hip', 'hand-on-front', 'raised', 'none'] as const;
export type PoseView = (typeof POSE_VIEWS)[number];
export type PoseFraming = (typeof POSE_FRAMINGS)[number];
export type PoseStance = (typeof POSE_STANCES)[number];
export type PoseArms = (typeof POSE_ARMS)[number];
/** A Model Studio view: the full view is a head-to-feet front. */
export type PoseSlot = 'front' | 'side' | 'back' | 'full';

export interface PoseChecks {
  /** The recast checks (face, hair, tattoo, hair blend) passed and Studio has a valid outline for the photo. */
  pass: boolean;
  face?: unknown;
  hair?: unknown;
  tattoo?: unknown;
  hairBlend?: unknown;
  /** What Studio found when the photo was saved: the sent outline matched the pixels, or one was found for it. */
  outline?: { ok: boolean; source?: AutoContour['source']; reason?: string };
}

export interface UserPose {
  id: string;
  view: PoseView;
  framing: PoseFraming;
  stance: PoseStance;
  arms: PoseArms;
  url: string;
  thumbUrl?: string;
  /** Bound to the stored photo's size and decoded-RGBA SHA-256, like every outline. */
  contour?: AutoContour;
  checks: PoseChecks;
  source?: { shoot: string; style: string; photo: string };
  removed?: { by: string; at: string };
}

/** Passed its checks, has an outline and was not removed. Only live poses are ever picked. */
export const isLivePose = (p: UserPose) => p.checks?.pass === true && !p.removed && Boolean(p.contour);

/** Waist-down photos have no head: bottoms shoot on the shared pants collection, never on a set's poses. */
const usable = (poses: UserPose[]) => poses.filter((p) => isLivePose(p) && p.framing !== 'low');

/** The pose view a Model Studio view uses. */
export const slotView = (slot: PoseSlot): PoseView => (slot === 'full' ? 'front' : slot);

/**
 * The live poses a view can use, in shoot order. The full view is head to feet, so it takes the full-length fronts
 * (every front when the set has none).
 */
export function slotPoses(poses: UserPose[], slot: PoseSlot): UserPose[] {
  const live = usable(poses).filter((p) => p.view === slotView(slot));
  if (slot !== 'full') return live;
  const full = live.filter((p) => p.framing === 'full');
  return full.length ? full : live;
}

/** The default pose per view (what `views`/`contours` hold): the first in shoot order; the full view prefers a second front. */
export function defaultPoses(poses: UserPose[]): Partial<Record<PoseSlot, UserPose>> {
  const out: Partial<Record<PoseSlot, UserPose>> = {};
  for (const slot of ['front', 'side', 'back'] as const) {
    const first = slotPoses(poses, slot)[0];
    if (first) out[slot] = first;
  }
  const full = slotPoses(poses, 'full');
  const pick = full.find((p) => p !== out.front && p.framing === 'full') || full.find((p) => p.framing === 'full');
  if (pick) out.full = pick;
  return out;
}

// ---------- garment read ----------

export interface GarmentRead {
  frontPockets: boolean;
  frontDetail: boolean;
  statementSleeves: boolean;
  waistDetail: boolean;
  hemMatters: boolean;
  backDetail: boolean;
}
export const GARMENT_READ_KEYS = ['frontPockets', 'frontDetail', 'statementSleeves', 'waistDetail', 'hemMatters', 'backDetail'] as const;

const TITLE_RULES: Record<keyof GarmentRead, RegExp> = {
  frontPockets: /\bpockets?\b/i,
  frontDetail: /\bbutton[- ]?(front|down|up)\b|\bfront[- ](tie|twist|knot|slit|zip|button|keyhole|cut[- ]?out)\b|\bwrap\b|\bkeyhole\b|\bcut[- ]?outs?\b|\blace[- ]up[- ]front\b|\bhenley\b/i,
  statementSleeves: /\b(bell|puff(ed)?|balloon|flutter|bishop|lantern|bubble|ruffled?)[- ]sleeves?\b|\bpuff[- ]sleeved\b/i,
  waistDetail: /\bbelt(ed)?\b|\btie[- ]waist\b|\bwaist[- ]tie\b|\bself[- ]tie\b|\bsmock(ed|ing)?\b|\bdrawstring\b|\bsash\b|\bcorset\b|\bpeplum\b|\bcinched\b/i,
  hemMatters: /\b(midi|maxi|mini)\b|\b(knee|ankle|floor|calf|tea)[- ]length\b|\bslit\b|\bsplit[- ]hem\b|\bruffled?[- ]hem\b|\btiered\b|\basymmetric(al)?\b|\bhigh[- ]low\b|\bhi[- ]lo\b|\bhandkerchief\b|\bbubble[- ]hem\b/i,
  backDetail: /\bopen[- ]back\b|\bbackless\b|\bback[- ](bow|tie|cut[- ]?out|zip|slit|lace[- ]up|keyhole)\b|\b(bow|tie|low|strappy|cross|lace[- ]up|keyhole)[- ]back\b/i,
};

/** What the listing title already says about the garment (cheap, always run; the vision read adds what it misses). */
export function titleGarmentRead(title: unknown): GarmentRead {
  const t = typeof title === 'string' ? title : '';
  const read = Object.fromEntries(GARMENT_READ_KEYS.map((k) => [k, TITLE_RULES[k].test(t)])) as unknown as GarmentRead;
  // "back pockets" alone is not a front pocket.
  if (read.frontPockets && /\bback[- ]pockets?\b/i.test(t) && !/\b(front|side|patch|slash|cargo|hip)[- ]pockets?\b/i.test(t)) read.frontPockets = false;
  return read;
}

/** One line of JSON from the vision model, or null when it is not exactly the expected shape. */
export function parseGarmentRead(output: string): GarmentRead | null {
  const m = String(output || '').match(/\{[^{}]*\}/);
  if (!m) return null;
  try {
    const j = JSON.parse(m[0]);
    if (!GARMENT_READ_KEYS.every((k) => typeof j?.[k] === 'boolean')) return null;
    return Object.fromEntries(GARMENT_READ_KEYS.map((k) => [k, j[k]])) as unknown as GarmentRead;
  } catch {
    return null;
  }
}

/** A feature counts when any read saw it. */
export function mergeGarmentReads(...reads: Array<Partial<GarmentRead> | null | undefined>): GarmentRead {
  return Object.fromEntries(GARMENT_READ_KEYS.map((k) => [k, reads.some((r) => r?.[k] === true)])) as unknown as GarmentRead;
}

// ---------- picking ----------

/** Per set and view: uses per pose and the pose each style got (lib/pose-usage.ts). */
export interface PoseUsage {
  uses: Record<string, { count: number; lastUsed: string }>;
  choices: Record<string, string>;
}
export const emptyPoseUsage = (): PoseUsage => ({ uses: {}, choices: {} });

export interface PosePick {
  pose: UserPose;
  reason: string;
}

type Rule = { when: keyof GarmentRead; label: string; arms?: PoseArms[]; framings?: PoseFraming[]; fullFramingOnly?: boolean; notBack?: boolean };
/** Poses that hide what sells the garment (design §8 step 3). */
const NEVER_PICK: Rule[] = [
  { when: 'frontPockets', label: 'front pockets', arms: ['hand-in-pocket', 'hands-in-pockets', 'hand-on-front'], notBack: true },
  { when: 'frontDetail', label: 'front detail', arms: ['hand-in-pocket', 'hands-in-pockets', 'hand-on-front'], notBack: true },
  { when: 'statementSleeves', label: 'statement sleeves', arms: ['hands-in-pockets', 'hand-on-front'] },
  { when: 'waistDetail', label: 'waist detail', arms: ['hand-on-hip', 'hand-on-front'] },
  // A view planned head to feet (every view of a dress, the full view of a top) must show the hem.
  { when: 'hemMatters', label: 'the hem', framings: ['crop', 'knee'], fullFramingOnly: true },
];

/** Framing that suits the view's planned framing, best first (lib/plate-framing.ts shotPlan). */
const FRAMING_ORDER: Record<PlateFraming, PoseFraming[]> = {
  full: ['full', 'knee', 'crop'],
  knee: ['knee', 'full', 'crop'],
  crop: ['crop', 'knee', 'full'],
  low: ['full', 'knee', 'crop'],
};

function score(p: UserPose, slot: PoseSlot, framing: PlateFraming, g: GarmentRead): number {
  const order = FRAMING_ORDER[framing] || FRAMING_ORDER.full;
  const rank = order.indexOf(p.framing);
  let s = (rank < 0 ? 0 : order.length - rank) * 10;
  if (g.statementSleeves && p.arms === 'away-from-body') s += 2;
  if ((slot === 'front' || slot === 'full') && p.stance === 'standing') s += 1;
  return s;
}

const styleKey = (code: unknown) => String(code || '').trim().toUpperCase();

/**
 * Picks the pose for one view: the style's earlier choice when it is still live; otherwise drop the poses that hide
 * what sells the garment, keep the best score and take the least recently used, ties in shoot order. When every pose
 * of the view hides something, the best of them is still used and the reason says so (a refused view is worse than a
 * hand over a pocket, and Other pose can swap it). Null when the view has no live pose.
 */
export function pickPose(o: { poses: UserPose[]; slot: PoseSlot; framing: PlateFraming; garment: GarmentRead; usage: PoseUsage; styleCode?: unknown }): PosePick | null {
  const candidates = slotPoses(o.poses, o.slot);
  if (!candidates.length) return null;
  const style = styleKey(o.styleCode);
  const earlier = style ? o.usage.choices?.[style] : undefined;
  const reused = earlier ? candidates.find((p) => p.id === earlier) : undefined;
  if (reused) return { pose: reused, reason: "same pose as this style's other colours" };

  const rules = NEVER_PICK.filter((r) => o.garment[r.when] && !(r.notBack && o.slot === 'back') && !(r.fullFramingOnly && o.framing !== 'full'));
  const blocks = (r: Rule, p: UserPose) => Boolean(r.arms?.includes(p.arms) || r.framings?.includes(p.framing));
  const allowed = candidates.filter((p) => !rules.some((r) => blocks(r, p)));
  // One note per set of reasons: "hand-in-pocket skipped: front pockets, front detail".
  const why = new Map<string, string[]>();
  for (const r of rules) {
    for (const p of candidates.filter((c) => blocks(r, c))) {
      const what = r.framings?.includes(p.framing) ? `${p.framing} framing` : p.arms;
      const labels = why.get(what) || [];
      if (!labels.includes(r.label)) why.set(what, [...labels, r.label]);
    }
  }
  const byReasons = new Map<string, string[]>();
  for (const [what, labels] of why) byReasons.set(labels.join(', '), [...(byReasons.get(labels.join(', ')) || []), what]);
  const notes = [...byReasons].map(([labels, whats]) => `${whats.join(', ')} skipped: ${labels}`);
  const pool = allowed.length ? allowed : candidates;
  if (!allowed.length) notes.splice(0, notes.length, `every ${o.slot} pose hides ${rules.map((r) => r.label).join(' or ')}; using the best of them`);

  const scored = pool.map((p) => ({ p, s: score(p, o.slot, o.framing, o.garment) }));
  const top = Math.max(...scored.map((x) => x.s));
  const order = new Map(o.poses.map((p, i) => [p.id, i]));
  const last = (p: UserPose) => o.usage.uses?.[p.id]?.lastUsed || '';
  const best = scored.filter((x) => x.s === top).map((x) => x.p)
    .sort((a, b) => last(a).localeCompare(last(b)) || (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  const pose = best[0];
  notes.push(`best fit: ${pose.framing} framing, ${pose.stance}, ${pose.arms}`);
  if (best.length > 1) notes.push(`least recently used of ${best.length}`);
  return { pose, reason: notes.join('; ') };
}
