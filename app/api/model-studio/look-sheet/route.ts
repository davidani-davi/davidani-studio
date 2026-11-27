import { NextResponse } from 'next/server';
import { authorized, unauthorized } from '@/lib/request-auth';
import { parseLookSheet, lookSheetInput, LOOK_SHEET_SIZE } from '@/lib/look-sheet';
import { POST as generateModel } from '../../generate-model/route';

export const maxDuration = 300;

/** POST — one look sheet from the approved front render (lib/look-sheet.ts). Paid: needs `confirmSpend: true`. */
export async function POST(req: Request) {
  if (!(await authorized(req))) return unauthorized();
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  if (body.confirmSpend !== true) return NextResponse.json({ ok: false, error: 'A look sheet is one paid render. Send confirmSpend: true.' }, { status: 400 });
  const parsed = parseLookSheet(body);
  if (typeof parsed === 'string') return NextResponse.json({ ok: false, error: parsed }, { status: 400 });
  const humanModelId = typeof body.humanModelId === 'string' ? body.humanModelId : '';
  const poseId = typeof body.poseId === 'string' ? body.poseId : '';
  if (!humanModelId || !poseId) return NextResponse.json({ ok: false, error: 'humanModelId and poseId are required.' }, { status: 400 });
  const input = lookSheetInput(parsed);
  const res = await generateModel(new Request(new URL('/api/generate-model', req.url), {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ modelId: 'gpt-image-25', humanModelId, poseId, view: 'front',
      canvasImageUrl: input.canvasImageUrl, garmentImageUrls: input.garmentImageUrls, preserveSecondaryReferences: true,
      rawPrompt: true, prompt: input.prompt, imageSize: LOOK_SHEET_SIZE, aspectRatio: '3:2', resolution: '2K', format: 'png', numImages: 1 }),
  }));
  const result = await res.json().catch(() => ({}));
  const url = result?.images?.[0]?.url;
  if (!res.ok || !url) return NextResponse.json({ ok: false, error: result?.error || 'The look sheet did not render.' }, { status: 502 });
  return NextResponse.json({ ok: true, url, prompt: input.prompt });
}
