import { randomUUID, timingSafeEqual } from 'node:crypto';
import { put } from '@vercel/blob';
import { NextResponse } from 'next/server';
import { wordingPrefix, wordingStore } from '@/lib/wording-studio/store';
import { StaleWriteError } from '@/lib/wording-studio/types';
import { claimNext, completeIdeas, completeMockups, failJob, heartbeat, leased, LeaseError } from '@/lib/wording-studio/jobs';
import type { Idea, Mockup } from '@/lib/wording-studio/types';

export const runtime = 'nodejs';
export const maxDuration = 60;
const MAX_PNG = 6_000_000;
const PNG = '89504e470d0a1a0a', JPEG = 'ffd8ff';
const kind = (b: Buffer) => (b.subarray(0, 8).toString('hex') === PNG ? 'png' : b.subarray(0, 3).toString('hex') === JPEG ? 'jpg' : null);

async function saveMockup(id: string, n: number, bytes: Buffer) {
  const ext = kind(bytes); if (!ext) throw new InputError('Mockup is not a PNG or JPEG');
  const r = await put(`${wordingPrefix()}${id}/mockup-${n}-${randomUUID()}.${ext}`, bytes, { access: 'public', addRandomSuffix: false, contentType: ext === 'png' ? 'image/png' : 'image/jpeg' });
  return r.url;
}
class InputError extends Error {}

function authorized(req: Request): 'ok' | 'missing' | 'bad' {
  const want = process.env.WORDING_WORKER_TOKEN;
  if (!want) return 'missing';
  const got = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const a = Buffer.from(got), b = Buffer.from(want);
  return a.length === b.length && timingSafeEqual(a, b) ? 'ok' : 'bad';
}

function cleanIdeas(raw: unknown): Idea[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 12).map((r: any, i) => ({
    id: String(r?.id || i + 1).slice(0, 40),
    main: (Array.isArray(r?.main) ? r.main : []).map((l: unknown) => String(l).slice(0, 40)).slice(0, 3),
    small_top: r?.small_top ? String(r.small_top).slice(0, 60) : undefined,
    small_bottom: r?.small_bottom ? String(r.small_bottom).slice(0, 60) : undefined,
    evidence: String(r?.evidence || 'untested').slice(0, 120),
    why: String(r?.why || '').slice(0, 240),
  })).filter(i => i.main.length > 0);
}

export async function POST(req: Request) {
  const auth = authorized(req);
  if (auth === 'missing') return NextResponse.json({ error: 'Worker not configured' }, { status: 503 });
  if (auth === 'bad') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Bad JSON' }, { status: 400 }); }
  const store = wordingStore();
  try {
    switch (body?.action) {
      case 'claim': return NextResponse.json({ job: await claimNext(store) });
      case 'heartbeat': await heartbeat(store, String(body.id), String(body.lease)); return NextResponse.json({ ok: true });
      case 'fail': await failJob(store, String(body.id), String(body.lease), String(body.error || 'Failed')); return NextResponse.json({ ok: true });
      case 'mockup': {
        const id = String(body.id), lease = String(body.lease);
        const bytes = Buffer.from(String(body.image_base64 || ''), 'base64');
        if (bytes.length > MAX_PNG) return NextResponse.json({ error: 'Mockup too large' }, { status: 413 });
        await leased(store, id, lease, Date.now());
        return NextResponse.json({ url: await saveMockup(id, Math.max(1, Math.min(3, Number(body.n) || 1)), bytes) });
      }
      case 'complete': {
        const id = String(body.id), lease = String(body.lease);
        if (Array.isArray(body.mockups)) {
          const entries = body.mockups.slice(0, 3);
          const bufs = entries.map((m: any) => (m?.png_base64 ? Buffer.from(String(m.png_base64), 'base64') : null));
          if (bufs.some((b: Buffer | null) => b && b.length > MAX_PNG)) return NextResponse.json({ error: 'Mockup too large' }, { status: 413 });
          await leased(store, id, lease, Date.now());
          const mine = `/${wordingPrefix()}${id}/mockup-`;
          const mockups: Mockup[] = [];
          for (const [n, m] of entries.entries()) {
            const wording = (Array.isArray(m?.wording) ? m.wording : []).map(String).slice(0, 3);
            if (bufs[n]) { mockups.push({ wording, url: await saveMockup(id, n + 1, bufs[n]!) }); continue; }
            let u: URL; try { u = new URL(String(m?.url)); } catch { throw new InputError('Bad mockup URL'); }
            if (u.protocol !== 'https:' || !u.pathname.startsWith(mine)) throw new InputError('Mockup URL is not one of ours');
            mockups.push({ wording, url: u.toString() });
          }
          await completeMockups(store, id, lease, mockups);
        } else {
          await completeIdeas(store, id, lease, cleanIdeas(body.ideas));
        }
        return NextResponse.json({ ok: true });
      }
      default: return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    }
  } catch (e) {
    if (e instanceof LeaseError || e instanceof StaleWriteError) return NextResponse.json({ error: e.message }, { status: 409 });
    if (e instanceof InputError) return NextResponse.json({ error: e.message }, { status: 400 });
    throw e;
  }
}
