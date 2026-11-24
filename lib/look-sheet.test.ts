import { describe, it, expect, vi, beforeEach } from 'vitest';
import { simpleReferenceShot, parseAnchorKind } from './simple-reference-shot';
import { parseLookSheet, lookSheetInput } from './look-sheet';

const base = { referenceUrl: 'https://ref/back.png', garmentImageUrls: ['https://erp/front.png', 'https://erp/back.png'], category: 'top' as const, framing: 'crop' as const, color: 'NAVY', garmentName: 'Cotton Shirt' };

describe('look sheet anchor in the Simple prompt', () => {
  it('a front-render anchor is unchanged when anchorKind is not sent', () => {
    const a = simpleReferenceShot({ ...base, view: 'back', anchorImageUrl: 'https://gen/front.png' });
    const b = simpleReferenceShot({ ...base, view: 'back', anchorImageUrl: 'https://gen/front.png', anchorKind: 'front' });
    expect(b.prompt).toBe(a.prompt);
    expect(a.anchorKind).toBe('front');
    expect(a.prompt).toContain('Image 3 is this same garment already rendered on the front view');
  });
  it('a sheet anchor rides as image 3 with sheet wording and keeps the face out of it', () => {
    const s = simpleReferenceShot({ ...base, view: 'back', anchorImageUrl: 'https://gen/sheet.png', anchorKind: 'look-sheet' });
    expect(s.anchorKind).toBe('look-sheet');
    expect(s.image_urls[2]).toBe('https://gen/sheet.png');
    expect(s.prompt).toContain('Image 3 is a look sheet of this same garment');
    expect(s.prompt).toContain('never from the figures on the sheet');
    expect(s.prompt).not.toContain('Image 3 is this same garment already rendered on the front view');
  });
  it('the front view ignores a sheet', () => {
    const s = simpleReferenceShot({ ...base, view: 'front', anchorImageUrl: 'https://gen/sheet.png', anchorKind: 'look-sheet' });
    expect(s.anchorKind).toBeUndefined();
    expect(s.prompt).not.toContain('look sheet');
  });
  it('roles-v1 names the sheet role', () => {
    const s = simpleReferenceShot({ ...base, view: 'side', anchorImageUrl: 'https://gen/sheet.png', anchorKind: 'look-sheet', promptRules: 'roles-v1' });
    expect(s.prompt).toContain('image 3 = a look sheet of this garment as rendered for this set');
  });
  it('parses only known kinds', () => {
    expect(parseAnchorKind('look-sheet')).toBe('look-sheet');
    expect(parseAnchorKind('front')).toBe('front');
    expect(parseAnchorKind('x')).toBeUndefined();
  });
});

describe('look sheet render input', () => {
  it('needs an approved front render', () => {
    expect(parseLookSheet({})).toMatch(/front first/);
    expect(parseLookSheet({ frontRenderUrl: 'javascript:x' })).toMatch(/front first/);
  });
  it('sends the front render as the canvas and the product back and side photos as the garment images', () => {
    const p = parseLookSheet({ frontRenderUrl: 'https://gen/front.png', backPhotoUrl: 'https://erp/back.png', sidePhotoUrl: 'https://erp/side.png', title: 'Cotton Shirt', color: 'NAVY' });
    if (typeof p === 'string') throw Error(p);
    const i = lookSheetInput(p);
    expect(i.canvasImageUrl).toBe('https://gen/front.png');
    expect(i.garmentImageUrls).toEqual(['https://erp/back.png', 'https://erp/side.png']);
    expect(i.prompt).toContain('image 2 = the product photographed from the back');
    expect(i.prompt).toContain('image 3 = the product photographed from the side');
    expect(i.prompt).toContain('NAVY Cotton Shirt');
    expect(i.prompt).not.toMatch(/\b(eyes?|nose|lips|jaw|cheek)\b/i);
  });
  it('with no product back or side photo it still has one garment image', () => {
    const p = parseLookSheet({ frontRenderUrl: 'https://gen/front.png' });
    if (typeof p === 'string') throw Error(p);
    expect(lookSheetInput(p).garmentImageUrls).toEqual(['https://gen/front.png']);
  });
});

const gen = vi.fn();
vi.mock('../app/api/generate-model/route', () => ({ POST: (...a: unknown[]) => gen(...a) }));
vi.mock('./request-auth', () => ({ authorized: async () => true, unauthorized: () => new Response('no', { status: 401 }) }));

describe('POST /api/model-studio/look-sheet', () => {
  beforeEach(() => gen.mockReset());
  const call = async (body: unknown) => {
    const { POST } = await import('../app/api/model-studio/look-sheet/route');
    return POST(new Request('http://x/api/model-studio/look-sheet', { method: 'POST', body: JSON.stringify(body) }));
  };
  it('refuses without confirmSpend and renders nothing', async () => {
    const res = await call({ frontRenderUrl: 'https://gen/front.png', humanModelId: 'studio 98', poseId: 'p' });
    expect(res.status).toBe(400);
    expect(gen).not.toHaveBeenCalled();
  });
  it('renders once on GPT 2.5 and returns the sheet url', async () => {
    gen.mockResolvedValue(new Response(JSON.stringify({ images: [{ url: 'https://fal/sheet.png' }] })));
    const res = await call({ confirmSpend: true, frontRenderUrl: 'https://gen/front.png', backPhotoUrl: 'https://erp/back.png', humanModelId: 'studio 98', poseId: 'p' });
    expect(res.status).toBe(200);
    expect((await res.json()).url).toBe('https://fal/sheet.png');
    expect(gen).toHaveBeenCalledTimes(1);
    const sent = JSON.parse(await (gen.mock.calls[0][0] as Request).text());
    expect(sent.modelId).toBe('gpt-image-25');
    expect(sent.numImages).toBe(1);
    expect(sent.canvasImageUrl).toBe('https://gen/front.png');
  });
});
