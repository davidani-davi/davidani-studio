// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

const blobs = new Map<string, string>();
vi.mock('@vercel/blob', () => ({
  put: vi.fn(async (path: string, body: string) => { if (blobs.has(path)) throw new Error('This blob already exists'); blobs.set(path, body); return { url: 'https://s/' + path }; }),
  del: vi.fn(async (p: string | string[]) => { for (const x of [p].flat()) blobs.delete(x.replace('https://s/', '')); }),
  list: vi.fn(async ({ prefix }: { prefix: string }) => ({ blobs: [...blobs.keys()].filter(k => k.startsWith(prefix)).map(k => ({ pathname: k, url: 'https://s/' + k, uploadedAt: new Date() })), hasMore: false })),
}));
vi.stubGlobal('fetch', vi.fn(async (u: string) => new Response(blobs.get(u.replace('https://s/', '')) ?? '', { status: blobs.has(u.replace('https://s/', '')) ? 200 : 404 })));
process.env.AUTH_SECRET = 'test-secret'; process.env.BLOB_READ_WRITE_TOKEN = 'x';

import { wordingStore } from './store';
import { StaleWriteError } from './types';

const id = '1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed';
const job = { id, createdAt: new Date(0).toISOString(), createdBy: 'studio' as const, photoUrl: 'https://p', category: 'top' as const, status: 'queued_ideas' as const, ideas: [], chosen: [], mockups: [], attempts: 0, seq: 0, queuedAt: 0 };

describe('wordingStore', () => {
  beforeEach(() => blobs.clear());

  it('rejects a write built on a stale copy', async () => {
    const s = wordingStore();
    const v1 = await s.write(job);
    await s.write({ ...v1, status: 'ideas_running' });
    await expect(s.write({ ...v1, status: 'failed' })).rejects.toBeInstanceOf(StaleWriteError);
    expect((await s.read(id))?.status).toBe('ideas_running');
  });

  it('keeps only the two newest versions of a job', async () => {
    const s = wordingStore();
    let j = await s.write(job);
    for (let i = 0; i < 4; i++) j = await s.write(j);
    const keys = [...blobs.keys()].map(k => k.split('/').pop());
    expect(keys.sort()).toEqual(['4.json', '5.json']);
    expect((await s.read(id))?.seq).toBe(5);
  });
});
