import { randomUUID, timingSafeEqual } from 'node:crypto';
import { put } from '@vercel/blob';
import { NextResponse } from 'next/server';
import { wordingPrefix, wordingStore } from '@/lib/wording-studio/store';
import { claimNext, completeIdeas, completeMockups, failJob, heartbeat, LeaseError } from '@/lib/wording-studio/jobs';
import type { Idea, Mockup } from '@/lib/wording-studio/types';

export const runtime = 'nodejs';
export const maxDuration = 60;
const MAX_PNG = 6_000_000;

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
      case 'complete': {
        const id = String(body.id), lease = String(body.lease);
        if (Array.isArray(body.mockups)) {
          const bufs = body.mockups.slice(0, 3).map((m: any) => ({ wording: (Array.isArray(m?.wording) ? m.wording : []).map(String).slice(0, 3), bytes: Buffer.from(String(m?.png_base64 || ''), 'base64') }));
          if (bufs.some((b: any) => b.bytes.length > MAX_PNG)) return NextResponse.json({ error: 'Mockup too large' }, { status: 413 });
          if (bufs.some((b: any) => b.bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a')) return NextResponse.json({ error: 'Mockup is not a PNG' }, { status: 400 });
          const prefix = wordingPrefix();
          const mockups: Mockup[] = [];
          for (const [n, b] of bufs.entries()) {
            const r = await put(`${prefix}${id}/mockup-${n + 1}-${randomUUID()}.png`, b.bytes, { access: 'public', addRandomSuffix: false, contentType: 'image/png' });
            mockups.push({ wording: b.wording, url: r.url });
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
    if (e instanceof LeaseError) return NextResponse.json({ error: e.message }, { status: 409 });
    throw e;
  }
}
