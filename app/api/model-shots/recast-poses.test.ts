import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { referencePixels } from '@/lib/garment-only';
import type { UserModel } from '@/lib/user-assets';
import type { UserPose } from '@/lib/user-poses';

// A recast set (Chloe recast): every pose carries its own recast-mask-v1 outline, and /api/model-shots picks the
// pose when the client sends the set's catalogue pose id or none.
const mocks = vi.hoisted(() => ({ upload: vi.fn(), generate: vi.fn(), ground: vi.fn(), garment: vi.fn(), list: vi.fn(), usage: new Map<string, unknown>() }));
vi.mock('@/lib/fal', async (original) => ({ ...await original<typeof import('@/lib/fal')>(), uploadToFal: mocks.upload, groundPhrase: mocks.ground, readGarmentDetails: mocks.garment }));
vi.mock('../generate-model/route', () => ({ POST: mocks.generate }));
vi.mock('@/lib/user-assets', async (original) => ({ ...await original<typeof import('@/lib/user-assets')>(), listUserModels: mocks.list }));
vi.mock('@/lib/model-admin', async () => ({ ...await vi.importActual<object>('@/lib/model-admin'), readCatalogChanges: async () => [] }));
vi.mock('@/lib/pose-usage', () => ({
  readPoseUsage: async (setId: string, slot: string) => mocks.usage.get(`${setId}/${slot}`) || { uses: {}, choices: {} },
  recordPoseUse: async (setId: string, slot: string, poseId: string, style?: string) => {
    const key = `${setId}/${slot}`;
    const u = (mocks.usage.get(key) as { uses: Record<string, unknown>; choices: Record<string, string> }) || { uses: {}, choices: {} };
    mocks.usage.set(key, { uses: { ...u.uses, [poseId]: { count: 1, lastUsed: new Date().toISOString() } }, choices: style ? { ...u.choices, [style]: poseId } : u.choices });
  },
  readCachedGarmentRead: async () => null,
  writeCachedGarmentRead: async () => {},
}));
vi.mock('next/cache', () => ({ unstable_cache: (fn: unknown) => fn }));
import { POST } from './route';

const W = 1024, H = 1536;
let photo: Buffer, generated: Buffer, sha = '', hosted = new Map<string, Buffer>();
const base = '/user-assets/user-models/vision-dd70049/poses/';
const pose = (id: string, view: UserPose['view'], framing: UserPose['framing'], arms: UserPose['arms'] = 'at-sides', extra: Partial<UserPose> = {}): UserPose => ({
  id, view, framing, stance: 'standing', arms, url: `${base}${id}.png`, thumbUrl: `${base}${id}-thumb.jpg`,
  contour: { kind: 'contour', width: W, height: H, sha256: sha, source: 'recast-mask-v1', detectedAt: '', featherPixels: 16,
    points: [[400, 60], [620, 60], [640, 300], [600, 420], [420, 420], [380, 300]], garmentBoundaryY: 440 },
  checks: { pass: true }, ...extra,
});
const recastSet = (): UserModel => {
  const poses = [pose('front-01', 'front', 'crop', 'hand-in-pocket'), pose('front-03', 'front', 'crop'), pose('front-08', 'front', 'full'),
    pose('side-05', 'side', 'crop'), pose('back-09', 'back', 'crop', 'at-sides', { removed: { by: 'Jeonga', at: '2026-10-31T00:00:00Z' } }), pose('back-10', 'back', 'crop')];
  return { id: 'vision-dd70049', name: 'Vision · DD70049', createdAt: '', views: { front: poses[0].url, side: poses[3].url, back: poses[5].url, full: poses[2].url }, poses };
};
const request = (body: object) => new Request('https://studio.test/api/model-shots', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-DDTO-TOKEN': 'test' },
  body: JSON.stringify({ garmentImageUrls: ['https://erp/front.png'], humanModelId: 'vision-dd70049', view: 'front', known: { category: 'top', styleCode: 'DJ62039A', title: 'Denim Jacket with Pockets' }, modelId: 'gpt-image-25', editMode: 'simple', ...body }) });

beforeEach(async () => {
  vi.stubEnv('MODEL_SHOTS_TOKEN', 'test'); vi.stubEnv('VERCEL', '1'); hosted = new Map(); mocks.usage.clear();
  photo = await sharp({ create: { width: W, height: H, channels: 4, background: '#c8b4a0' } }).png().toBuffer();
  generated = await sharp({ create: { width: W, height: H, channels: 4, background: '#304050' } }).png().toBuffer();
  sha = (await referencePixels(photo)).sha256;
  mocks.list.mockResolvedValue([recastSet()]);
  mocks.garment.mockResolvedValue(null);
  mocks.ground.mockResolvedValue([]);
  mocks.upload.mockImplementation(async (blob: Blob, name: string) => { const url = 'https://host/' + name; hosted.set(url, Buffer.from(await blob.arrayBuffer())); return url; });
  mocks.generate.mockImplementation(async () => Response.json({ images: [{ url: 'https://generated/result.png' }] }));
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
    const u = String(input);
    return new Response(new Uint8Array(hosted.get(u) || (u.startsWith('https://generated/') ? generated : photo)));
  }));
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.clearAllMocks(); });

describe('rendering on a recast set', () => {
  it('picks a pose that keeps the front pockets in view and protects the face with its recast outline', async () => {
    const res = await POST(request({ poseId: 'vision-dd70049-pose' }));
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data).toMatchObject({ ok: true, poseId: 'front-03', faceProtection: 'recast-mask-contour-v1', pose: { id: 'front-03', framing: 'crop', arms: 'at-sides', thumbUrl: `${base}front-03-thumb.jpg` } });
    expect(data.poseReason).toContain('hand-in-pocket skipped: front pockets');
    const payload = await mocks.generate.mock.calls[0][0].json();
    expect(payload.canvasImageUrl).toBe(`https://studio.test${base}front-03.png`);
    expect(payload.poseId).toBe('vision-dd70049-pose');
    expect(data.preservation).toMatchObject({ verified: true, changedProtectedPixels: 0 });
    // The face inside the outline is the shoot photo's own pixels.
    const out = await sharp(hosted.get(data.url)!).ensureAlpha().raw().toBuffer();
    const at = (200 * W + 510) * 4;
    expect([...out.subarray(at, at + 3)]).toEqual([0xc8, 0xb4, 0xa0]);
  });
  it("gives the style's next colour the same pose without reading the garment again", async () => {
    await POST(request({}));
    expect(mocks.garment).toHaveBeenCalledTimes(1);
    const again = await (await POST(request({ known: { category: 'top', styleCode: 'DJ62039A', title: 'Denim Jacket with Pockets', color: 'Black' } }))).json();
    expect(again).toMatchObject({ ok: true, poseId: 'front-03', poseReason: "same pose as this style's other colours" });
    expect(mocks.garment).toHaveBeenCalledTimes(1);
  });
  it('shoots on a pose chosen by hand, and refuses a removed one', async () => {
    expect(await (await POST(request({ poseId: 'front-01' }))).json()).toMatchObject({ ok: true, poseId: 'front-01', poseReason: 'chosen by hand' });
    const removed = await POST(request({ view: 'back', poseId: 'back-09' }));
    expect(removed.status).toBe(400);
    expect((await removed.json()).error).toBe('Pose back-09 was removed from Vision · DD70049. Choose another pose.');
    expect(await (await POST(request({ view: 'back' }))).json()).toMatchObject({ ok: true, poseId: 'back-10' });
  });
  it('refuses a pose whose outline no longer matches its photo', async () => {
    const s = recastSet();
    s.poses = s.poses!.map((p) => (p.view === 'side' ? { ...p, contour: { ...p.contour!, sha256: 'f'.repeat(64) } } : p));
    mocks.list.mockResolvedValue([s]);
    const res = await POST(request({ view: 'side' }));
    expect(res.status).toBe(502);
    expect((await res.json()).error).toContain('The model reference changed');
    expect(mocks.generate).not.toHaveBeenCalled();
  });
});
