import fs from 'node:fs';
import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import presets from '@/lib/simple-contour-presets.json';
import type { AutoContour } from '@/lib/model-admin-core';
import type { UserModel } from '@/lib/user-assets';

// A Listing Team draft set built for pants (DP60418) has only head-to-toe photos. A top's Front on it must still
// come out head to mid-thigh (DCJ67197, 2026-11-02): the route shoots on the photo's thigh-up window.
const mocks = vi.hoisted(() => ({ upload: vi.fn(), generate: vi.fn(), ground: vi.fn(), garment: vi.fn(), list: vi.fn() }));
vi.mock('@/lib/fal', async (original) => ({ ...await original<typeof import('@/lib/fal')>(), uploadToFal: mocks.upload, groundPhrase: mocks.ground, readGarmentDetails: mocks.garment }));
vi.mock('../generate-model/route', () => ({ POST: mocks.generate }));
vi.mock('@/lib/user-assets', async (original) => ({ ...await original<typeof import('@/lib/user-assets')>(), listUserModels: mocks.list }));
vi.mock('@/lib/model-admin', async () => ({ ...await vi.importActual<object>('@/lib/model-admin'), readCatalogChanges: async () => [] }));
vi.mock('@/lib/pose-usage', () => ({ readPoseUsage: async () => ({ uses: {}, choices: {} }), recordPoseUse: async () => {}, readCachedGarmentRead: async () => null, writeCachedGarmentRead: async () => {} }));
vi.mock('next/cache', () => ({ unstable_cache: (fn: unknown) => fn }));
import { POST } from './route';

const fullPhoto = fs.readFileSync('public/models/studio 108/front.png'), framedPhoto = fs.readFileSync('public/models/crop 108/front.png');
const outline = (file: string) => ({ ...(presets as Record<string, object>)[file], source: 'auto-draft-v1', detectedAt: '2026-11-02T00:00:00Z' }) as AutoContour;
const base = '/user-assets/user-models/draft-celine-dp60418/';
const draftSet = (): UserModel => ({ id: 'draft-celine-dp60418', name: 'Draft · Jeonga · Celine · DP60418', createdAt: '',
  views: { front: `${base}front.png`, side: `${base}side.png`, full: `${base}full.png` },
  contours: { front: outline('/models/studio 108/front.png'), side: outline('/models/crop 108/front.png'), full: outline('/models/studio 108/front.png') } });
const request = (body: object) => new Request('https://studio.test/api/model-shots', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-DDTO-TOKEN': 'test' },
  body: JSON.stringify({ garmentImageUrls: ['https://erp/front.png'], humanModelId: 'draft-celine-dp60418', poseId: 'draft-celine-dp60418-pose', view: 'front',
    known: { category: 'top', styleCode: 'DCJ67197', title: 'Longline Cardigan' }, modelId: 'gpt-image-25', editMode: 'simple', ...body }) });
let generated: Buffer, hosted = new Map<string, Buffer>();

beforeEach(async () => {
  vi.stubEnv('MODEL_SHOTS_TOKEN', 'test'); vi.stubEnv('VERCEL', '1'); vi.stubEnv('BLOB_READ_WRITE_TOKEN', ''); hosted = new Map();
  generated = await sharp({ create: { width: 1024, height: 1536, channels: 4, background: '#304050' } }).png().toBuffer();
  mocks.list.mockResolvedValue([draftSet()]);
  mocks.garment.mockResolvedValue(null);
  mocks.ground.mockResolvedValue([]);
  mocks.upload.mockImplementation(async (blob: Blob, name: string) => { const url = 'https://host/' + name; hosted.set(url, Buffer.from(await blob.arrayBuffer())); return url; });
  mocks.generate.mockImplementation(async () => Response.json({ images: [{ url: 'https://generated/result.png' }] }));
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
    const u = String(input);
    return new Response(new Uint8Array(hosted.get(u) || (u.startsWith('https://generated/') ? generated : u.endsWith('/side.png') ? framedPhoto : fullPhoto)));
  }));
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.clearAllMocks(); });

describe('a full-length draft set for a top', () => {
  it("shoots the Front on the photo's thigh-up window and keeps the face pixels", async () => {
    const data = await (await POST(request({}))).json();
    expect(data.ok, data.error).toBe(true);
    expect(data.framing).toBe('crop');
    expect(data.referenceCrop).toMatchObject({ from: `https://studio.test${base}front.png`, width: 2000, height: 3000 });
    const payload = await mocks.generate.mock.calls[0][0].json();
    expect(payload.canvasImageUrl).toBe('https://host/view-crop.png');
    expect(data.reference.url).toBe('https://host/view-crop.png');
    expect(data.faceProtection).toBe('auto-draft-contour-v1');
    expect(data.preservation).toMatchObject({ verified: true, changedProtectedPixels: 0 });
    // The crop starts just above the head, so the sent photo's top rows are the photo's own rows near box.y.
    const { box, scale } = data.referenceCrop;
    expect(box.y).toBeLessThan(120);
    expect(box.height * scale).toBeCloseTo(3000, -1);
  });
  it('leaves the Full view and an already framed photo alone', async () => {
    const full = await (await POST(request({ view: 'full' }))).json();
    expect(full.ok, full.error).toBe(true);
    expect(full.referenceCrop).toBeUndefined();
    expect(full.reference.url).toBe(`https://studio.test${base}full.png`);
    const side = await (await POST(request({ view: 'side' }))).json();
    expect(side.ok, side.error).toBe(true);
    expect(side.referenceCrop).toBeUndefined();
    expect(side.reference.url).toBe(`https://studio.test${base}side.png`);
  });
  it('a mid-length top gets the knee window, a long one keeps the head-to-toe photo', async () => {
    const mid = await (await POST(request({ known: { category: 'top', styleCode: 'DCJ67197', title: 'Longline Cardigan', hem: 'mid' } }))).json();
    expect(mid.ok, mid.error).toBe(true);
    expect(mid.framing).toBe('knee');
    expect(mid.referenceCrop.box.height).toBeGreaterThan(2000);
    const long = await (await POST(request({ known: { category: 'top', styleCode: 'DCJ67197', title: 'Longline Cardigan', hem: 'long' } }))).json();
    expect(long.ok, long.error).toBe(true);
    expect(long.framing).toBe('full');
    expect(long.referenceCrop).toBeUndefined();
  });
});
