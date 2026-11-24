// @vitest-environment node
import { it, expect, vi, beforeEach } from 'vitest';
import { memoryStore } from '@/lib/wording-studio/store';
let store = memoryStore();
vi.mock('@/lib/wording-studio/store', async (orig) => ({ ...(await orig<typeof import('@/lib/wording-studio/store')>()), wordingStore: () => store }));
vi.mock('@vercel/blob', () => ({ put: vi.fn(async (p: string) => ({ url: 'https://blob.test/' + p })) }));
import { POST } from './route';
import { put } from '@vercel/blob';
import { createJob } from '@/lib/wording-studio/jobs';

const call = (body: unknown, token: string | null = 'tok') =>
  POST(new Request('https://studio/api/wording-studio/worker', { method: 'POST', headers: token ? { authorization: 'Bearer ' + token } : {}, body: JSON.stringify(body) }));
const PNG = Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), Buffer.alloc(40)]).toString('base64');

beforeEach(() => { store = memoryStore(); vi.clearAllMocks(); process.env.WORDING_WORKER_TOKEN = 'tok'; process.env.AUTH_SECRET = 's'; });

it('401 without bearer', async () => {
  expect((await call({ action: 'claim' }, null)).status).toBe(401);
  expect((await call({ action: 'claim' }, 'nope')).status).toBe(401);
});
it('503 when WORDING_WORKER_TOKEN unset', async () => {
  delete process.env.WORDING_WORKER_TOKEN;
  expect((await call({ action: 'claim' })).status).toBe(503);
});
it('claim returns null on empty store', async () => {
  const r = await call({ action: 'claim' });
  expect(r.status).toBe(200);
  expect(await r.json()).toEqual({ job: null });
});
it('complete with stale lease → 409', async () => {
  const j = await createJob(store, { photoUrl: 'https://x/a.jpg' });
  await call({ action: 'claim' });
  expect((await call({ action: 'complete', id: j.id, lease: 'stale', ideas: [] })).status).toBe(409);
});
it('complete mockups stores PNG URLs', async () => {
  const j = await createJob(store, { photoUrl: 'https://x/a.jpg' });
  const c = await (await call({ action: 'claim' })).json();
  await call({ action: 'complete', id: j.id, lease: c.job.lease.token, ideas: [{ main: ['DREAM', 'FREE'], evidence: 'untested', why: 'w' }] });
  const { chooseIdeas } = await import('@/lib/wording-studio/jobs');
  await chooseIdeas(store, j.id, [['DREAM', 'FREE']]);
  const m = await (await call({ action: 'claim' })).json();
  const r = await call({ action: 'complete', id: j.id, lease: m.job.lease.token, mockups: [{ wording: ['DREAM', 'FREE'], png_base64: PNG }] });
  expect(r.status).toBe(200);
  expect(put).toHaveBeenCalledOnce();
  const done = await store.read(j.id);
  expect(done?.status).toBe('done');
  expect(done?.mockups[0].url).toMatch(/^https:\/\/blob\.test\/wording-studio-v1\/[0-9a-f]+\/.+\/mockup-1-.+\.png$/);
});
it('rejects a mockup over 6 MB with 413', async () => {
  const j = await createJob(store, { photoUrl: 'https://x/a.jpg' });
  const c = await (await call({ action: 'claim' })).json();
  const big = Buffer.alloc(6_000_001).toString('base64');
  expect((await call({ action: 'complete', id: j.id, lease: c.job.lease.token, mockups: [{ wording: ['A'], png_base64: big }] })).status).toBe(413);
});
