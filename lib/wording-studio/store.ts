import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto';
import { list, put } from '@vercel/blob';
import type { Job, JobStore } from './types';

const ID = /^[0-9a-f-]{36}$/;
export const validJobId = (id: string) => ID.test(id);

function byNewest(a: Job, b: Job) { return b.createdAt.localeCompare(a.createdAt); }

export function memoryStore(): JobStore & { keys(): string[] } {
  const map = new Map<string, Job>();
  const latest = (id: string) => {
    let best: Job | null = null;
    for (const [k, v] of map) if (k.startsWith(id + '/') && (!best || v.seq > best.seq)) best = v;
    return best;
  };
  return {
    keys: () => [...map.keys()],
    async read(id) { const j = latest(id); return j ? structuredClone(j) : null; },
    async write(job) {
      const cur = latest(job.id); const next = { ...structuredClone(job), seq: (cur?.seq ?? 0) + 1 };
      const key = `${job.id}/${next.seq}.json`;
      if (map.has(key)) throw Error('pathname reused');
      map.set(key, next); return structuredClone(next);
    },
    async list(limit) {
      const ids = new Set([...map.keys()].map(k => k.split('/')[0]));
      return [...ids].map(id => latest(id)!).sort(byNewest).slice(0, limit).map(j => structuredClone(j));
    },
  };
}

export function wordingStore(): JobStore {
  const secret = process.env.AUTH_SECRET || process.env.APP_PASSWORD;
  if (!secret || !process.env.BLOB_READ_WRITE_TOKEN) throw Error('Wording Studio storage is not configured.');
  const key = createHmac('sha256', secret).update('wording-studio-encryption-v1').digest();
  const ns = createHmac('sha256', secret).update('wording-studio-v1').digest('hex');
  const prefix = `wording-studio-v1/${ns}/`;
  const encode = (v: unknown) => {
    const n = randomBytes(12), c = createCipheriv('aes-256-gcm', key, n);
    const d = Buffer.concat([c.update(JSON.stringify(v), 'utf8'), c.final()]);
    return JSON.stringify({ v: 1, n: n.toString('base64'), t: c.getAuthTag().toString('base64'), d: d.toString('base64') });
  };
  const decode = (s: string): Job => {
    const b = JSON.parse(s); if (b.v !== 1) throw Error('Unknown job format');
    const c = createDecipheriv('aes-256-gcm', key, Buffer.from(b.n, 'base64')); c.setAuthTag(Buffer.from(b.t, 'base64'));
    return JSON.parse(Buffer.concat([c.update(Buffer.from(b.d, 'base64')), c.final()]).toString('utf8'));
  };
  const seqOf = (p: string) => Number(p.match(/\/(\d+)\.json$/)?.[1] ?? -1);
  async function allBlobs(p: string) {
    const out: { pathname: string; url: string; uploadedAt: Date }[] = []; let cursor: string | undefined;
    do { const page = await list({ prefix: p, cursor, limit: 1000 }); out.push(...page.blobs); cursor = page.hasMore ? page.cursor : undefined; } while (cursor);
    return out.filter(b => /\/\d+\.json$/.test(b.pathname));
  }
  async function fetchJob(url: string) {
    const r = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(15000) });
    if (!r.ok) throw Error('Wording job unavailable'); return decode(await r.text());
  }
  async function newest(id: string) {
    const blobs = await allBlobs(prefix + id + '/'); if (!blobs.length) return null;
    return blobs.reduce((a, b) => (seqOf(b.pathname) > seqOf(a.pathname) ? b : a));
  }
  return {
    async read(id) { if (!validJobId(id)) return null; const b = await newest(id); return b ? fetchJob(b.url) : null; },
    async write(job) {
      if (!validJobId(job.id)) throw Error('Invalid job id');
      const cur = await newest(job.id); const next = { ...job, seq: cur ? seqOf(cur.pathname) + 1 : 1 };
      await put(`${prefix}${job.id}/${next.seq}.json`, encode(next), { access: 'public', addRandomSuffix: false, allowOverwrite: false, contentType: 'application/json' });
      return next;
    },
    async list(limit) {
      const blobs = await allBlobs(prefix); const best = new Map<string, (typeof blobs)[number]>();
      for (const b of blobs) { const id = b.pathname.slice(prefix.length).split('/')[0]; const c = best.get(id); if (!c || seqOf(b.pathname) > seqOf(c.pathname)) best.set(id, b); }
      const recent = [...best.values()].sort((a, b) => +new Date(b.uploadedAt) - +new Date(a.uploadedAt)).slice(0, limit * 2);
      return (await Promise.all(recent.map(b => fetchJob(b.url).catch(() => null)))).filter((j): j is Job => !!j).sort(byNewest).slice(0, limit);
    },
  };
}
