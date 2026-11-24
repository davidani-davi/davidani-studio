import { NextResponse } from 'next/server';
import { handleUpload } from '@vercel/blob/client';
import { authorized, unauthorized } from '@/lib/request-auth';
import { uploadPolicy } from '@/lib/wording-studio/upload';

export const runtime = 'nodejs';

/** Hands the browser a one-time token to put one garment photo straight into Blob. */
export async function POST(req: Request) {
  if (!(await authorized(req))) return unauthorized();
  try {
    const body = await req.json();
    if (body?.type !== 'blob.generate-client-token') throw Error('Invalid upload request.');
    return NextResponse.json(await handleUpload({ request: req, body, onBeforeGenerateToken: async (pathname) => uploadPolicy(pathname) }));
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Upload failed.' }, { status: 400 });
  }
}
