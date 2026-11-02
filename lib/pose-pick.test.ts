import { describe, expect, it, vi } from 'vitest';
import { chooseSetPose, garmentReadFor, type PosePickDeps } from './pose-pick';
import type { HumanModel } from './models-registry';
import { emptyPoseUsage, type GarmentRead, type PoseUsage, type UserPose } from './user-poses';

const pose = (id: string, view: UserPose['view'], framing: UserPose['framing'], arms: UserPose['arms'] = 'at-sides', extra: Partial<UserPose> = {}): UserPose => ({
  id, view, framing, stance: 'standing', arms, url: `/user-assets/user-models/vision-dd70049/poses/${id}.png`,
  contour: { kind: 'contour', width: 1, height: 1, sha256: id, source: 'recast-mask-v1', detectedAt: '' }, checks: { pass: true }, ...extra,
});
const set = (poses: UserPose[]) => ({ id: 'vision-dd70049', name: 'Vision · DD70049', poses: [{ id: 'vision-dd70049-pose' }], userPoses: poses }) as unknown as HumanModel;
const plain: GarmentRead = { frontPockets: false, frontDetail: false, statementSleeves: false, waistDetail: false, hemMatters: false, backDetail: false };

function deps(o: { usage?: PoseUsage; cached?: GarmentRead | null; vision?: () => Promise<GarmentRead | null>; visionTimeoutMs?: number } = {}) {
  return {
    readUsage: vi.fn(async () => o.usage || emptyPoseUsage()),
    recordUse: vi.fn(async () => {}),
    readCachedGarment: vi.fn(async () => o.cached ?? null),
    writeCachedGarment: vi.fn(async (_key: string, _read: GarmentRead) => {}),
    visionRead: vi.fn(o.vision || (async () => null)),
    visionTimeoutMs: o.visionTimeoutMs,
  } satisfies PosePickDeps;
}
const ask = (requestedPoseId = '', extra: Record<string, unknown> = {}) => ({
  requestedPoseId, view: 'front' as const, framing: 'crop' as const, known: { styleCode: 'dj62039a', title: 'Denim Jacket' } as never, garmentImageUrls: ['https://v3.fal.media/files/x/g.jpg'], ...extra,
});

describe('chooseSetPose', () => {
  const poses = [pose('front-01', 'front', 'crop', 'hand-in-pocket'), pose('front-02', 'front', 'crop'), pose('front-05', 'front', 'crop', 'at-sides', { checks: { pass: false, outline: { ok: false, reason: 'outline does not match' } } }),
    pose('front-07', 'front', 'crop', 'at-sides', { removed: { by: 'Jeonga', at: '' } }), pose('side-03', 'side', 'crop')];

  it('is not used for a set without poses', async () => {
    expect(await chooseSetPose({ id: 'old', name: 'Old', poses: [] } as unknown as HumanModel, ask(), deps())).toBeNull();
  });
  it('picks for the set id the clients send, reading the garment once and remembering the choice', async () => {
    const d = deps({ vision: async () => ({ ...plain, frontPockets: true }) });
    const out = await chooseSetPose(set(poses), ask('vision-dd70049-pose'), d);
    expect(out).toMatchObject({ ok: true, requested: false, pose: { id: 'front-02' }, reason: expect.stringContaining('hand-in-pocket skipped: front pockets') });
    expect(d.visionRead).toHaveBeenCalledOnce();
    expect(d.writeCachedGarment).toHaveBeenCalledWith('DJ62039A', { ...plain, frontPockets: true });
    expect(d.recordUse).toHaveBeenCalledWith('vision-dd70049', 'front', 'front-02', 'DJ62039A');
  });
  it("skips the garment read when the style already has its pose", async () => {
    const d = deps({ usage: { uses: {}, choices: { DJ62039A: 'front-01' } } });
    const out = await chooseSetPose(set(poses), ask(), d);
    expect(out).toMatchObject({ ok: true, pose: { id: 'front-01' }, reason: "same pose as this style's other colours" });
    expect(d.visionRead).not.toHaveBeenCalled();
    expect(d.readCachedGarment).not.toHaveBeenCalled();
  });
  it('uses a cached read instead of calling vision again', async () => {
    const d = deps({ cached: { ...plain, frontPockets: true } });
    expect(await chooseSetPose(set(poses), ask(), d)).toMatchObject({ pose: { id: 'front-02' } });
    expect(d.visionRead).not.toHaveBeenCalled();
  });
  it('falls back to the title when vision is slow', async () => {
    const d = deps({ vision: () => new Promise(() => {}), visionTimeoutMs: 5 });
    const out = await chooseSetPose(set(poses), ask(), d);
    expect(out).toMatchObject({ ok: true, pose: { id: 'front-01' } });
    expect(d.writeCachedGarment).not.toHaveBeenCalled();
  });
  it('uses a pose chosen by hand and records it for the other colours', async () => {
    const d = deps();
    expect(await chooseSetPose(set(poses), ask('front-02'), d)).toEqual({ ok: true, pose: poses[1], reason: 'chosen by hand', requested: true });
    expect(d.recordUse).toHaveBeenCalledWith('vision-dd70049', 'front', 'front-02', 'DJ62039A');
    expect(d.visionRead).not.toHaveBeenCalled();
  });
  it('refuses a pose that does not exist, was removed, failed, or shoots another view', async () => {
    const s = set(poses);
    expect(await chooseSetPose(s, ask('front-99'), deps())).toEqual({ ok: false, status: 400, error: 'Vision · DD70049 has no pose front-99.' });
    expect(await chooseSetPose(s, ask('front-07'), deps())).toMatchObject({ ok: false, error: 'Pose front-07 was removed from Vision · DD70049. Choose another pose.' });
    expect(await chooseSetPose(s, ask('front-05'), deps())).toMatchObject({ ok: false, error: 'Pose front-05 cannot shoot the front view: it failed its checks (outline does not match).' });
    expect(await chooseSetPose(s, ask('side-03'), deps())).toMatchObject({ ok: false, error: 'Pose side-03 cannot shoot the front view: it is a side crop pose.' });
  });
  it('says so when a view has no live pose', async () => {
    expect(await chooseSetPose(set(poses), ask('', { view: 'back' }), deps())).toEqual({ ok: false, status: 400, error: 'Vision · DD70049 has no back pose that passed its checks.' });
  });
});

describe('garmentReadFor', () => {
  it('reads the title alone when there is no garment photo', async () => {
    const d = deps();
    expect(await garmentReadFor({ title: 'Puff Sleeve Top' } as never, [], d)).toMatchObject({ statementSleeves: true });
    expect(d.visionRead).not.toHaveBeenCalled();
  });
  it('caches by photo when the style code is missing', async () => {
    const d = deps({ vision: async () => ({ ...plain, waistDetail: true }) });
    await garmentReadFor({ title: 'Top' } as never, ['https://v3.fal.media/files/x/g.jpg'], d);
    expect(d.writeCachedGarment.mock.calls[0][0]).toMatch(/^img-[0-9a-f]{16}$/);
  });
});

describe('the full view avoids the front photo (DCJ67197, 2026-11-02)', () => {
  const poses = [pose('front-01', 'front', 'full', 'hand-in-pocket'), pose('front-02', 'front', 'full', 'away-from-body'), pose('front-03', 'front', 'full'),
    pose('front-04', 'front', 'crop', 'hand-in-pocket')];
  const bySlot = (front: PoseUsage) => ({ ...deps(), readUsage: vi.fn(async (_id: string, slot: string) => (slot === 'front' ? front : emptyPoseUsage())) });
  const full = { view: 'full' as const, framing: 'full' as const, known: { styleCode: 'DCJ67197', title: 'Longline Cardigan' } as never };
  it("skips the photo the style's front rendered on", async () => {
    const d = bySlot({ uses: {}, choices: { DCJ67197: 'front-02' } });
    const out = await chooseSetPose(set(poses), ask('', { ...full, frontFraming: 'full' }), d);
    expect(out?.ok && out.pose.id).not.toBe('front-02');
    expect(d.readUsage).toHaveBeenCalledWith('vision-dd70049', 'front');
  });
  it('before the front has rendered, skips the photo the front would get', async () => {
    const out = await chooseSetPose(set(poses), ask('', { ...full, frontFraming: 'full' }), bySlot(emptyPoseUsage()));
    // the front would get front-01 (full framing, standing, first in shoot order); the full shot takes the styled front-02
    expect(out?.ok && out.pose.id).toBe('front-02');
  });
  it('a pose chosen by hand is used as asked, even the front one', async () => {
    const out = await chooseSetPose(set(poses), ask('front-02', { ...full }), bySlot({ uses: {}, choices: { DCJ67197: 'front-02' } }));
    expect(out?.ok && out.pose.id).toBe('front-02');
  });
});
