// @vitest-environment node
import { it, expect, vi, beforeEach } from 'vitest';
import { memoryStore } from '@/lib/wording-studio/store';
let store = memoryStore();
vi.mock('@/lib/wording-studio/store', async (orig) => ({ ...(await orig<typeof import('@/lib/wording-studio/store')>()), wordingStore: () => store }));
vi.mock('@/lib/request-auth', async (orig) => ({ ...(await orig<typeof import('@/lib/request-auth')>()), authorized: vi.fn(async () => true) }));
import { POST, GET, PATCH } from './route';
import { authorized } from '@/lib/request-auth';
import { createJob, claimNext, completeIdeas } from '@/lib/wording-studio/jobs';

const url = 'https://studio/api/wording-studio';
const good = 'https://abc123.public.blob.vercel-storage.com/wording-studio-uploads/x.jpg';
const req = (method: string, body?: unknown, q = '') => new Request(url + q, { method, body: body === undefined ? undefined : JSON.stringify(body) });
beforeEach(() => { store = memoryStore(); vi.mocked(authorized).mockResolvedValue(true); });

it('refuses without a session', async () => {
  vi.mocked(authorized).mockResolvedValue(false);
  expect((await POST(req('POST', { photoUrl: good }))).status).toBe(401);
  expect((await GET(req('GET'))).status).toBe(401);
});
it('rejects a photoUrl not on the blob host', async () => {
  expect((await POST(req('POST', { photoUrl: 'https://evil.com/wording-studio-uploads/x.jpg' }))).status).toBe(400);
  expect((await POST(req('POST', { photoUrl: 'https://abc.public.blob.vercel-storage.com/other/x.jpg' }))).status).toBe(400);
});
it('creates queued_ideas job', async () => {
  const r = await POST(req('POST', { photoUrl: good, style: 'DT78036', note: 'remove charm', category: 'top' }));
  expect(r.status).toBe(202);
  const { job } = await r.json();
  expect(job.status).toBe('queued_ideas');
  expect(job.style).toBe('DT78036');
  const one = await (await GET(req('GET', undefined, '?id=' + job.id))).json();
  expect(one.job.id).toBe(job.id);
  const all = await (await GET(req('GET'))).json();
  expect(all.jobs).toHaveLength(1);
});
it('strips the lease from GET', async () => {
  const j = await createJob(store, { photoUrl: good });
  await claimNext(store);
  const one = await (await GET(req('GET', undefined, '?id=' + j.id))).json();
  expect(one.job.lease).toBeUndefined();
  expect(typeof one.job.leaseUntil).toBe('number');
});
it('PATCH with 4 choices → 400', async () => {
  const j = await createJob(store, { photoUrl: good });
  const c = await claimNext(store);
  await completeIdeas(store, j.id, c!.lease!.token, [{ id: '1', main: ['A'], evidence: 'untested', why: '' }]);
  expect((await PATCH(req('PATCH', { id: j.id, chosen: [['A'], ['B'], ['C'], ['D']] }))).status).toBe(400);
  const ok = await PATCH(req('PATCH', { id: j.id, chosen: [['A']] }));
  expect(ok.status).toBe(200);
  expect((await ok.json()).job.status).toBe('queued_mockups');
});
it('a choice racing another write answers 409, not 500', async () => {
  const { StaleWriteError } = await import('@/lib/wording-studio/types');
  const a = await createJob(store, { photoUrl: good }, 0);
  const c = await claimNext(store, 10);
  await completeIdeas(store, a.id, c!.lease!.token, [{ id: '1', main: ['JOY'], evidence: 'untested', why: '' }], 20);
  const write = store.write; store.write = async () => { throw new StaleWriteError(); };
  const r = await PATCH(req('PATCH', { id: a.id, chosen: [['JOY']] }));
  store.write = write;
  expect(r.status).toBe(409);
});
