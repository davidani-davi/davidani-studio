import { describe, expect, it } from 'vitest';
import {
  defaultPoses, emptyPoseUsage, isLivePose, mergeGarmentReads, parseGarmentRead, pickPose, slotPoses, titleGarmentRead,
  type GarmentRead, type PoseArms, type PoseFraming, type PoseStance, type PoseUsage, type PoseView, type UserPose,
} from './user-poses';

const pose = (id: string, view: PoseView, framing: PoseFraming, arms: PoseArms = 'at-sides', stance: PoseStance = 'standing', extra: Partial<UserPose> = {}): UserPose => ({
  id, view, framing, stance, arms, url: `u/${id}.png`,
  contour: { kind: 'contour', width: 1, height: 1, sha256: id, source: 'recast-mask-v1', detectedAt: '' },
  checks: { pass: true }, ...extra,
});
const plain: GarmentRead = { frontPockets: false, frontDetail: false, statementSleeves: false, waistDetail: false, hemMatters: false, backDetail: false };
const read = (r: Partial<GarmentRead>) => ({ ...plain, ...r });
const usage = (uses: Record<string, string> = {}, choices: Record<string, string> = {}): PoseUsage =>
  ({ uses: Object.fromEntries(Object.entries(uses).map(([id, lastUsed]) => [id, { count: 1, lastUsed }])), choices });

describe('which poses a view can use', () => {
  const set = [
    pose('f1', 'front', 'crop'), pose('f2', 'front', 'full'), pose('f3', 'front', 'full', 'at-sides', 'standing', { checks: { pass: false } }),
    pose('f4', 'front', 'full', 'at-sides', 'standing', { removed: { by: 'Jeonga', at: '2026-10-31' } }),
    pose('f5', 'front', 'knee', 'at-sides', 'standing', { contour: undefined }), pose('l1', 'front', 'low'),
    pose('s1', 'side', 'crop'), pose('b1', 'back', 'full'),
  ];
  it('keeps only live poses with an outline, never waist-down ones', () => {
    expect(slotPoses(set, 'front').map((p) => p.id)).toEqual(['f1', 'f2']);
    expect(isLivePose(set[2])).toBe(false);
    expect(isLivePose(set[3])).toBe(false);
    expect(isLivePose(set[4])).toBe(false);
  });
  it('gives the full view the head-to-feet fronts, or every front when there are none', () => {
    expect(slotPoses(set, 'full').map((p) => p.id)).toEqual(['f2']);
    expect(slotPoses([pose('f1', 'front', 'crop')], 'full').map((p) => p.id)).toEqual(['f1']);
  });
  it('defaults each view to its first pose and the full view to another full-length front', () => {
    const d = defaultPoses(set);
    expect([d.front?.id, d.side?.id, d.back?.id, d.full?.id]).toEqual(['f1', 's1', 'b1', 'f2']);
    expect(defaultPoses([pose('f2', 'front', 'full')]).full?.id).toBe('f2');
    expect(defaultPoses([pose('s1', 'side', 'crop')]).front).toBeUndefined();
  });
});

describe('reading the garment', () => {
  it('reads what sells the garment from the title', () => {
    expect(titleGarmentRead('Button Front Denim Jacket with Pockets')).toMatchObject({ frontPockets: true, frontDetail: true });
    expect(titleGarmentRead('Back Pocket Wide Leg Jeans').frontPockets).toBe(false);
    expect(titleGarmentRead('Back Pocket Jeans with Side Pockets').frontPockets).toBe(true);
    expect(titleGarmentRead('Puff Sleeve Poplin Blouse').statementSleeves).toBe(true);
    expect(titleGarmentRead('Tie Waist Midi Dress')).toMatchObject({ waistDetail: true, hemMatters: true });
    expect(titleGarmentRead('Open Back Maxi Dress')).toMatchObject({ backDetail: true, hemMatters: true });
    expect(titleGarmentRead('Basic Crew Neck Tee')).toEqual(plain);
    expect(titleGarmentRead(undefined)).toEqual(plain);
  });
  it('takes only the exact JSON shape from the vision model', () => {
    const line = JSON.stringify(read({ frontPockets: true }));
    expect(parseGarmentRead('```json\n' + line + '\n```')).toEqual(read({ frontPockets: true }));
    expect(parseGarmentRead('{"frontPockets":true}')).toBeNull();
    expect(parseGarmentRead('I cannot see the garment.')).toBeNull();
  });
  it('merges reads key by key', () => {
    expect(mergeGarmentReads(read({ frontPockets: true }), null, read({ hemMatters: true }))).toEqual(read({ frontPockets: true, hemMatters: true }));
  });
});

describe('picking a pose (best fit, then least recently used)', () => {
  it('skips poses that hide front pockets and says so', () => {
    const poses = [pose('a', 'front', 'crop', 'hand-in-pocket'), pose('b', 'front', 'crop', 'at-sides')];
    const pick = pickPose({ poses, slot: 'front', framing: 'crop', garment: read({ frontPockets: true }), usage: emptyPoseUsage() })!;
    expect(pick.pose.id).toBe('b');
    expect(pick.reason).toContain('hand-in-pocket skipped: front pockets');
  });
  it('names a skipped pose once when several things rule it out', () => {
    const poses = [pose('a', 'front', 'crop', 'hand-in-pocket'), pose('b', 'front', 'crop', 'at-sides')];
    const pick = pickPose({ poses, slot: 'front', framing: 'crop', garment: read({ frontPockets: true, frontDetail: true }), usage: emptyPoseUsage() })!;
    expect(pick.reason).toBe('hand-in-pocket skipped: front pockets, front detail; best fit: crop framing, standing, at-sides');
  });
  it('lets a hand in a pocket show on the back view', () => {
    const poses = [pose('a', 'back', 'crop', 'hand-in-pocket')];
    expect(pickPose({ poses, slot: 'back', framing: 'crop', garment: read({ frontPockets: true }), usage: emptyPoseUsage() })!.pose.id).toBe('a');
  });
  it('keeps arms off statement sleeves and prefers arms away from the body', () => {
    const poses = [pose('a', 'front', 'crop', 'hand-on-front'), pose('b', 'front', 'crop', 'at-sides'), pose('c', 'front', 'crop', 'away-from-body')];
    expect(pickPose({ poses, slot: 'front', framing: 'crop', garment: read({ statementSleeves: true }), usage: emptyPoseUsage() })!.pose.id).toBe('c');
  });
  it('keeps hands off a waist detail', () => {
    const poses = [pose('a', 'front', 'crop', 'hand-on-hip'), pose('b', 'front', 'crop', 'raised')];
    expect(pickPose({ poses, slot: 'front', framing: 'crop', garment: read({ waistDetail: true }), usage: emptyPoseUsage() })!.pose.id).toBe('b');
  });
  it('shows the hem on a view planned head to feet, but not on a top front', () => {
    const poses = [pose('a', 'front', 'crop'), pose('b', 'front', 'full')];
    const full = pickPose({ poses, slot: 'front', framing: 'full', garment: read({ hemMatters: true }), usage: usage({ b: '2026-10-31T10:00:00Z' }) })!;
    expect(full.pose.id).toBe('b');
    expect(full.reason).toContain('crop framing skipped: the hem');
    expect(pickPose({ poses, slot: 'front', framing: 'crop', garment: read({ hemMatters: true }), usage: emptyPoseUsage() })!.pose.id).toBe('a');
  });
  it("prefers the framing the view is planned in", () => {
    const poses = [pose('a', 'front', 'full'), pose('b', 'front', 'knee'), pose('c', 'front', 'crop')];
    expect(pickPose({ poses, slot: 'front', framing: 'crop', garment: plain, usage: emptyPoseUsage() })!.pose.id).toBe('c');
    expect(pickPose({ poses, slot: 'front', framing: 'knee', garment: plain, usage: emptyPoseUsage() })!.pose.id).toBe('b');
  });
  it('takes the least recently used of equal fits, never-used first, ties in shoot order', () => {
    const poses = [pose('a', 'side', 'crop'), pose('b', 'side', 'crop'), pose('c', 'side', 'crop')];
    const pick = pickPose({ poses, slot: 'side', framing: 'crop', garment: plain, usage: usage({ a: '2026-10-31T09:00:00Z', b: '2026-10-30T09:00:00Z' }) })!;
    expect(pick.pose.id).toBe('c');
    expect(pick.reason).toContain('least recently used of 3');
    expect(pickPose({ poses, slot: 'side', framing: 'crop', garment: plain, usage: usage({ a: '2026-10-31T09:00:00Z', b: '2026-10-30T09:00:00Z', c: '2026-10-31T11:00:00Z' }) })!.pose.id).toBe('b');
    expect(pickPose({ poses, slot: 'side', framing: 'crop', garment: plain, usage: emptyPoseUsage() })!.pose.id).toBe('a');
  });
  it("reuses the pose the style's other colours got while it is live", () => {
    const poses = [pose('a', 'side', 'crop'), pose('b', 'side', 'crop')];
    const again = pickPose({ poses, slot: 'side', framing: 'crop', garment: plain, usage: usage({ b: '2026-10-31T09:00:00Z' }, { DJ62039A: 'b' }), styleCode: 'dj62039a' })!;
    expect(again).toMatchObject({ pose: { id: 'b' }, reason: "same pose as this style's other colours" });
    const gone = [pose('a', 'side', 'crop'), pose('b', 'side', 'crop', 'at-sides', 'standing', { removed: { by: 'x', at: '' } })];
    expect(pickPose({ poses: gone, slot: 'side', framing: 'crop', garment: plain, usage: usage({}, { DJ62039A: 'b' }), styleCode: 'DJ62039A' })!.pose.id).toBe('a');
  });
  it('still shoots when every pose hides something, and says so', () => {
    const poses = [pose('a', 'front', 'crop', 'hands-in-pockets')];
    const pick = pickPose({ poses, slot: 'front', framing: 'crop', garment: read({ frontPockets: true }), usage: emptyPoseUsage() })!;
    expect(pick.pose.id).toBe('a');
    expect(pick.reason).toContain('every front pose hides front pockets');
  });
  it('has nothing to pick when the view has no live pose', () => {
    expect(pickPose({ poses: [pose('a', 'front', 'crop')], slot: 'side', framing: 'crop', garment: plain, usage: emptyPoseUsage() })).toBeNull();
  });
});
