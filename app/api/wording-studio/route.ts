import { NextResponse } from 'next/server';
import { authorized, unauthorized } from '@/lib/request-auth';
import { wordingStore, validJobId } from '@/lib/wording-studio/store';
import { chooseIdeas, createJob, InputError, publicJob } from '@/lib/wording-studio/jobs';
import { StaleWriteError } from '@/lib/wording-studio/types';
import { validPhotoUrl } from '@/lib/wording-studio/upload';
import { CATEGORIES, type Category } from '@/lib/wording-studio/types';

export const runtime = 'nodejs';
const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

export async function POST(req: Request) {
  if (!(await authorized(req))) return unauthorized();
  const body = await req.json().catch(() => null);
  if (!validPhotoUrl(body?.photoUrl)) return bad('Upload the photo first.');
  const category = CATEGORIES.includes(body?.category) ? (body.category as Category) : 'top';
  const job = await createJob(wordingStore(), { photoUrl: body.photoUrl, style: body?.style ? String(body.style) : undefined, note: body?.note ? String(body.note) : undefined, category });
  return NextResponse.json({ job: publicJob(job) }, { status: 202 });
}

export async function GET(req: Request) {
  if (!(await authorized(req))) return unauthorized();
  const id = new URL(req.url).searchParams.get('id');
  const store = wordingStore();
  if (id) {
    if (!validJobId(id)) return bad('Bad job id.');
    const job = await store.read(id);
    return job ? NextResponse.json({ job: publicJob(job) }, { headers: { 'cache-control': 'no-store' } }) : bad('Job not found.', 404);
  }
  return NextResponse.json({ jobs: (await store.list(20)).map(publicJob) }, { headers: { 'cache-control': 'no-store' } });
}

export async function PATCH(req: Request) {
  if (!(await authorized(req))) return unauthorized();
  const body = await req.json().catch(() => null);
  if (!validJobId(String(body?.id))) return bad('Bad job id.');
  try { return NextResponse.json({ job: publicJob(await chooseIdeas(wordingStore(), body.id, body.chosen)) }); }
  catch (e) {
    if (e instanceof InputError) return bad(e.message);
    if (e instanceof StaleWriteError) return NextResponse.json({ error: e.message }, { status: 409 });
    throw e;
  }
}
