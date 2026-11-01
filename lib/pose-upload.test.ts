import sharp from 'sharp';
import { describe, expect, it, vi } from 'vitest';
import { referencePixels, type ReferencePixels } from './garment-only';
import { imageExt, normalizeChecks, preparePoses, validatePoseInputs, verifyRecastOutline, type PoseInput } from './pose-upload';

const W = 40, H = 60;
const png = (seed = 0) => sharp({ create: { width: W, height: H, channels: 4, background: { r: 200 - seed, g: 180, b: 160, alpha: 1 } } }).png().toBuffer();
const URL1 = 'https://v3.fal.media/files/lion/front-01.png';
const outlineFor = (ref: ReferencePixels, extra: Record<string, unknown> = {}) => ({
  kind: 'contour', width: ref.width, height: ref.height, sha256: ref.sha256, featherPixels: 4, source: 'recast-mask-v1',
  points: [[10, 4], [30, 4], [30, 22], [10, 22]], garmentBoundaryY: 24, ...extra,
});
const input = (extra: Partial<PoseInput> = {}): PoseInput =>
  ({ id: 'front-01', view: 'front', framing: 'crop', stance: 'standing', arms: 'at-sides', url: URL1, checks: { pass: true }, ...extra });
const okFetch = (bytes: Buffer) => vi.fn(async () => new Response(new Uint8Array(bytes), { status: 200 })) as unknown as typeof fetch;

describe('validatePoseInputs', () => {
  it('refuses an empty or oversized list', () => {
    expect(() => validatePoseInputs([])).toThrow('poses must be a list of 1-40 photos.');
    expect(() => validatePoseInputs(Array.from({ length: 41 }, () => input()))).toThrow('1-40');
    expect(() => validatePoseInputs('front.png')).toThrow('1-40');
  });
  it('names every problem in one message', () => {
    let message = '';
    try {
      validatePoseInputs([
        { view: 'top', framing: 'waist', stance: 'sitting', arms: 'folded', url: 'http://example.com/a.png', checks: {} },
        input({ id: 'Front-01' }), input({ id: 'front-01' }), 'x',
      ]);
    } catch (err) { message = (err as Error).message; }
    expect(message).toContain('poses[0].view must be one of front, side, back');
    expect(message).toContain('poses[0].framing must be one of full, knee, crop, low');
    expect(message).toContain('poses[0].stance');
    expect(message).toContain('poses[0].arms');
    expect(message).toContain('poses[0].url must be an https fal storage or Blob URL');
    expect(message).toContain('poses[0].checks must be the recast checks');
    expect(message).toContain('poses[2].id front-01 is used twice');
    expect(message).toContain('poses[3] is not an object');
  });
  it('lowercases ids, numbers missing ones and keeps the shoot source', () => {
    const [a, b] = validatePoseInputs([
      input({ id: 'Front-03', source: { shoot: 'chloe', style: 'DD70049', photo: 'DD70049_03.jpg' } }),
      { ...input(), id: undefined, view: 'side' },
    ]);
    expect(a).toMatchObject({ id: 'front-03', source: { style: 'DD70049' } });
    expect(b.id).toBe('side-02');
  });
});

describe('imageExt', () => {
  it('knows PNG, JPEG and WebP by their first bytes', async () => {
    expect(imageExt(await png())).toBe('png');
    expect(imageExt(await sharp(await png()).jpeg().toBuffer())).toBe('jpg');
    expect(imageExt(await sharp(await png()).webp().toBuffer())).toBe('webp');
    expect(imageExt(Buffer.from('<html>not found</html>'))).toBeNull();
  });
});

describe('verifyRecastOutline', () => {
  it('keeps a recast outline that matches the decoded pixels', async () => {
    const ref = await referencePixels(await png());
    const v = verifyRecastOutline(outlineFor(ref), ref, 'crop', new Date('2026-10-31T00:00:00Z'));
    expect(v).toEqual({ use: {
      kind: 'contour', width: W, height: H, sha256: ref.sha256, source: 'recast-mask-v1', detectedAt: '2026-10-31T00:00:00.000Z',
      points: [[10, 4], [30, 4], [30, 22], [10, 22]], featherPixels: 4, garmentBoundaryY: 24,
    } });
  });
  it('fails the photo when the pixels or the size do not match', async () => {
    const ref = await referencePixels(await png());
    const other = await referencePixels(await png(9));
    expect(verifyRecastOutline(outlineFor(other), ref, 'crop')).toEqual({ fail: 'outline does not match the photo pixels (the file changed on the way)' });
    expect(verifyRecastOutline(outlineFor(ref, { width: 80 }), ref, 'crop')).toEqual({ fail: 'outline is for a 80x60 photo, this one is 40x60' });
  });
  it('fails an outline that a render would refuse', async () => {
    const ref = await referencePixels(await png());
    expect(verifyRecastOutline(outlineFor(ref, { points: [[10, 4], [50, 4], [30, 22]] }), ref, 'crop')).toEqual({ fail: 'outline is not valid: Invalid reviewed contour.' });
    expect(verifyRecastOutline(outlineFor(ref, { featherPixels: 40 }), ref, 'crop')).toMatchObject({ fail: expect.stringContaining('not valid') });
    expect(verifyRecastOutline(outlineFor(ref, { kind: 'box' }), ref, 'crop')).toEqual({ fail: 'outline kind must be contour or no-head' });
    expect(verifyRecastOutline('front.json', ref, 'crop')).toEqual({ fail: 'the outline is not an object' });
  });
  it('accepts "no head" only on a waist-down photo', async () => {
    const ref = await referencePixels(await png());
    const noHead = { kind: 'no-head', width: W, height: H, sha256: ref.sha256, source: 'recast-mask-v1' };
    expect(verifyRecastOutline(noHead, ref, 'low')).toMatchObject({ use: { kind: 'no-head' } });
    expect(verifyRecastOutline(noHead, ref, 'crop')).toEqual({ fail: 'no head found on a crop photo' });
  });
  it('leaves a photo sent with no outline at all to the automatic one', async () => {
    const ref = await referencePixels(await png());
    expect(verifyRecastOutline(undefined, ref, 'crop')).toEqual({ fill: 'no outline sent' });
  });
  it('fails a photo the recast tool could not outline, or whose outline is not a recast one', async () => {
    const ref = await referencePixels(await png());
    expect(verifyRecastOutline({ kind: 'missing', why: 'no head found' }, ref, 'crop')).toEqual({ fail: 'the recast tool made no outline (no head found)' });
    expect(verifyRecastOutline({ ...outlineFor(ref), source: 'auto-draft-v1' }, ref, 'crop')).toEqual({ fail: 'outline source must be recast-mask-v1, not auto-draft-v1' });
  });
});

describe('normalizeChecks', () => {
  it('keeps the recast check results under Studio names and drops oversized ones', () => {
    expect(normalizeChecks({ pass: true, face: { score: 0.9 }, hair_blend: { seam: 1.2 }, tattoo: 'x'.repeat(3000), extra: 1 }))
      .toEqual({ pass: true, face: { score: 0.9 }, hairBlend: { seam: 1.2 } });
    expect(normalizeChecks({ pass: 'yes' }).pass).toBe(false);
  });
});

describe('preparePoses', () => {
  const deps = (bytes: Buffer, detect = vi.fn(async () => null)) => ({ fetch: okFetch(bytes), referencePixels, detect, now: () => new Date('2026-10-31T00:00:00Z') });

  it('keeps a matching recast outline without looking for another', async () => {
    const bytes = await png();
    const ref = await referencePixels(bytes);
    const d = deps(bytes);
    const [p] = await preparePoses([input({ contour: outlineFor(ref), checks: { pass: true, hair_blend: { seam: 0.4 } } })], d);
    expect(d.detect).not.toHaveBeenCalled();
    expect(p.ext).toBe('png');
    expect(p.bytes.equals(bytes)).toBe(true);
    expect(p.pose).toMatchObject({ id: 'front-01', contour: { source: 'recast-mask-v1', sha256: ref.sha256 }, checks: { pass: true, hairBlend: { seam: 0.4 }, outline: { ok: true, source: 'recast-mask-v1' } } });
    expect(imageExt(p.thumb!)).toBe('jpg');
  });
  it('fails a photo whose outline does not match and never gives it an automatic one', async () => {
    const bytes = await png();
    const other = await referencePixels(await png(9));
    const d = deps(bytes, vi.fn(async () => ({ kind: 'contour', source: 'auto-draft-v1' }) as never));
    const [p] = await preparePoses([input({ contour: outlineFor(other) })], d);
    expect(d.detect).not.toHaveBeenCalled();
    expect(p.pose.contour).toBeUndefined();
    expect(p.pose.checks).toMatchObject({ pass: false, outline: { ok: false, reason: expect.stringContaining('does not match the photo pixels') } });
  });
  it('finds an outline for a photo sent without one, and fails it when none is found', async () => {
    const bytes = await png();
    const ref = await referencePixels(bytes);
    const found = { ...outlineFor(ref), source: 'auto-draft-v1', detectedAt: '' };
    const d = deps(bytes, vi.fn(async () => found as never));
    const [p] = await preparePoses([input()], d);
    expect(d.detect).toHaveBeenCalledWith(URL1, 'front');
    expect(p.pose).toMatchObject({ contour: { source: 'auto-draft-v1' }, checks: { pass: true, outline: { ok: true, source: 'auto-draft-v1', reason: 'no outline sent' } } });
    const [q] = await preparePoses([input()], deps(bytes));
    expect(q.pose.checks).toMatchObject({ pass: false, outline: { ok: false, reason: 'no outline sent; no outline found' } });
  });
  it("keeps the recast tool's own verdict", async () => {
    const bytes = await png();
    const ref = await referencePixels(bytes);
    const [p] = await preparePoses([input({ contour: outlineFor(ref), checks: { pass: false, hair: { reason: 'pasted hair edge' } } })], deps(bytes));
    expect(p.pose.checks).toMatchObject({ pass: false, hair: { reason: 'pasted hair edge' }, outline: { ok: true } });
  });
  it('reports a photo that cannot be downloaded or is not an image', async () => {
    const missing = { ...deps(await png()), fetch: vi.fn(async () => new Response('gone', { status: 404 })) as unknown as typeof fetch };
    await expect(preparePoses([input()], missing)).rejects.toMatchObject({ status: 502, message: 'front-01: download failed (HTTP 404)' });
    await expect(preparePoses([input()], deps(Buffer.from('<html>login</html>')))).rejects.toMatchObject({ status: 400, message: 'front-01: not a PNG, JPEG or WebP image' });
  });
});
