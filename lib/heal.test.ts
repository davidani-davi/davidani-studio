import { describe, expect, it, vi } from 'vitest';
import sharp from 'sharp';
import { garmentDifference, garmentRows, isHealableUrl, matchRawFrame, parseHeal, rawFrameCandidates, sameReference } from './heal';

const item = (id: string, base: string, out: string, ended: string, status = 200) =>
  ({ request_id: id, status_code: status, ended_at: ended, json_input: { image_urls: [base, 'https://erp/garment.png'] }, json_output: { images: [{ url: out }] } });

describe('heal inputs', () => {
  it('only fetches renders from our own image hosts', () => {
    expect(isHealableUrl('https://v3b.fal.media/files/b/x/garment-only.png')).toBe(true);
    expect(isHealableUrl('https://abc.public.blob.vercel-storage.com/saved/a.png')).toBe(true);
    for (const bad of ['http://v3b.fal.media/x.png', 'https://evil.example/fal.media.png', 'https://fal.media.evil.com/x.png', 'file:///etc/passwd', 42])
      expect(isHealableUrl(bad)).toBe(false);
    expect(() => parseHeal({ url: 'https://example.com/a.png' })).toThrow(/render image link/);
    expect(parseHeal({ url: 'https://v3.fal.media/a.png', renderedAt: '2026-11-02T17:00:00Z' }).renderedAt).toBe(Date.parse('2026-11-02T17:00:00Z'));
  });
  it('matches the same reference photo across studio hosts, never across Blob stores', () => {
    expect(sameReference('https://davidani-studio.vercel.app/models/studio%20100/full.png', 'https://studio.test/models/studio%20100/full.png')).toBe(true);
    expect(sameReference('https://a.public.blob.vercel-storage.com/user-models/x.png', 'https://a.public.blob.vercel-storage.com/user-models/x.png')).toBe(true);
    expect(sameReference('https://a.public.blob.vercel-storage.com/user-models/x.png', 'https://b.public.blob.vercel-storage.com/user-models/x.png')).toBe(false);
    expect(sameReference('https://studio.test/models/studio%20100/full.png', 'https://studio.test/models/studio%20101/full.png')).toBe(false);
  });
});

describe('raw frame lookup in fal history', () => {
  it('pages both edit endpoints, keeps successful generations on this photo, newest first', async () => {
    const base = 'https://a.public.blob.vercel-storage.com/user-models/draft/front.png';
    const pages: Record<string, any> = {
      'sunburst:': { items: [item('r1', base, 'https://v3.fal.media/r1.png', '2026-11-02T17:01:00Z'), item('x', 'https://other/photo.png', 'https://v3.fal.media/x.png', '2026-11-02T17:02:00Z')], has_more: true, next_cursor: 'c2' },
      'sunburst:c2': { items: [item('r0', base, 'https://v3.fal.media/r0.png', '2026-11-02T16:50:00Z'), item('bad', base, 'https://v3.fal.media/bad.png', '2026-11-02T17:03:00Z', 500)], has_more: false },
      'gpt-image-2/edit:': { items: [item('g1', base, 'https://v3.fal.media/g1.png', '2026-11-02T17:05:00Z')], has_more: false },
    };
    const urls: URL[] = [];
    const fetcher = vi.fn(async (input: any, init: any) => {
      const u = new URL(String(input)); urls.push(u);
      expect(init.headers.Authorization).toBe('Key k');
      const name = u.searchParams.get('endpoint_id')!.includes('sunburst') ? 'sunburst' : 'gpt-image-2/edit';
      return Response.json(pages[`${name}:${u.searchParams.get('cursor') || ''}`]);
    });
    const at = Date.parse('2026-11-02T17:00:00Z');
    const found = await rawFrameCandidates(base, { renderedAt: at, key: 'k', fetcher: fetcher as any });
    expect(found.map(f => f.requestId)).toEqual(['g1', 'r1', 'r0']);
    expect(urls).toHaveLength(3);
    // A known render time searches 45 min before to 20 min after it.
    expect(urls[0].searchParams.get('start')).toBe(new Date(at - 45 * 60e3).toISOString());
    expect(urls[0].searchParams.get('end')).toBe(new Date(at + 20 * 60e3).toISOString());
    expect(urls[0].searchParams.get('expand')).toBe('payloads');
  });
  it('refuses without a fal key and reports a failing history', async () => {
    await expect(rawFrameCandidates('https://x/y.png', { key: '' })).rejects.toThrow(/not configured/);
    await expect(rawFrameCandidates('https://x/y.png', { key: 'k', fetcher: (async () => new Response('', { status: 403 })) as any })).rejects.toThrow(/403/);
  });
});

describe('matching the render to its frame', () => {
  const W = 64, H = 96;
  const solid = (r: number, g: number, b: number) => sharp({ create: { width: W, height: H, channels: 4, background: { r, g, b } } }).png().toBuffer();
  const mask = () => { const m = Buffer.alloc(W * H, 255); for (let y = 0; y < 30; y++) m.fill(0, y * W + 20, y * W + 44); return m; };
  it('compares only below the face outline', () => {
    expect(garmentRows(mask(), W, H)).toBe(29 + Math.round(H * 0.04));
    const a = Buffer.alloc(W * H * 4, 10), b = Buffer.from(a);
    b.fill(200, 0, 20 * W * 4); // a different face does not count
    expect(garmentDifference(a, b, W, H, garmentRows(mask(), W, H))).toBe(0);
  });
  it('picks the frame whose garment area the render copied, and says when none fits', async () => {
    const frames = new Map([['https://f/a.png', await solid(200, 10, 10)], ['https://f/b.png', await solid(10, 200, 10)]]);
    const fetcher = (async (u: any) => new Response(new Uint8Array(frames.get(String(u))!))) as any;
    const render = await sharp(await solid(10, 200, 10)).ensureAlpha().raw().toBuffer();
    const cands = [...frames.keys()].map((url, i) => ({ url, requestId: 'r' + i, endedAt: '', endpoint: 'e' }));
    const hit = await matchRawFrame(render, { width: W, height: H }, mask(), cands, fetcher);
    expect(hit.matched).toBe(true); expect(hit.frame?.requestId).toBe('r1'); expect(hit.difference).toBe(0);
    const miss = await matchRawFrame(await sharp(await solid(90, 90, 90)).ensureAlpha().raw().toBuffer(), { width: W, height: H }, mask(), cands, fetcher);
    expect(miss.matched).toBe(false);
  });
});
