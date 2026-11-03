import { readFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import presets from './simple-contour-presets.json';
import { referencePixels } from './garment-only';
import { simpleFaceMask } from './simple-reference-shot';
import type { AutoContour } from './model-admin-core';
import { cropContour, isFullLength, silhouette, thighUpReference, viewCropBox } from './view-crop';

const photo = (p: string) => readFile(path.join(process.cwd(), 'public', p));
async function shape(p: string) {
  const { data, info } = await sharp(await photo(p)).resize({ width: 400 }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return silhouette(data, info.width, info.height, info.channels);
}
/** A reviewed library outline dressed up as the outline a draft set carries. */
const draftOutline = (p: string) => ({ ...(presets as Record<string, any>)[p], source: 'auto-draft-v1', detectedAt: '2026-11-02T00:00:00Z' }) as AutoContour;

describe('view-crop', { timeout: 30_000 }, () => {
  it('tells a full-length photo from one already framed thigh-up', async () => {
    expect(isFullLength(await shape('models/studio 108/front.png'))).toBe(true);
    expect(isFullLength(await shape('models/crop 108/front.png'))).toBe(false);
    expect(isFullLength(await shape('models/crop 97/front.png'))).toBe(false);
  });

  it('puts the thigh-up window where the house crop of the same shoot sits', async () => {
    const s = (await shape('models/studio 108/front.png'))!;
    const box = viewCropBox(2000, 3000, s, 'crop')!;
    expect(box.width * 3).toBe(box.height * 2);
    // house crop 108 front was cut from this photo at rows ~35-1972
    expect(Math.abs(box.y - 35)).toBeLessThan(60);
    expect(Math.abs(box.y + box.height - 1972)).toBeLessThan(90);
    const knee = viewCropBox(2000, 3000, s, 'knee')!;
    expect(knee.height).toBeGreaterThan(box.height);
  });

  it('moves the face outline into the window and refuses a window that cuts the head', () => {
    const c = draftOutline('/models/studio 108/front.png');
    const moved = cropContour(c, { x: 100, y: 20, width: 1200, height: 1800 }, 'abc')!;
    expect(moved.points![0]).toEqual([c.points![0][0] - 100, c.points![0][1] - 20]);
    expect(moved.garmentBoundaryY).toBe(c.garmentBoundaryY! - 20);
    expect([moved.width, moved.height, moved.sha256]).toEqual([1200, 1800, 'abc']);
    const top = Math.min(...c.points!.map(p => p[1]));
    expect(cropContour(c, { x: 0, y: top + 5, width: 1200, height: 1800 }, 'abc')).toBeNull();
  });

  it('builds a thigh-up reference the Simple face mask accepts, under one fixed name', async () => {
    const ref = await referencePixels(await photo('models/studio 108/front.png'));
    const outline = draftOutline('/models/studio 108/front.png');
    expect(ref.sha256).toBe(outline.sha256);
    const keys: string[] = [];
    const store = async (key: string) => { keys.push(key); return `https://blob.test/${key}`; };
    const crop = (await thighUpReference(ref, outline, 'crop', store))!;
    expect(crop).not.toBeNull();
    expect([crop.ref.width, crop.ref.height]).toEqual([2000, 3000]);
    expect(crop.contour).toMatchObject({ width: 2000, height: 3000, sha256: crop.ref.sha256, source: 'auto-draft-v1' });
    expect(crop.url).toBe(`https://blob.test/${keys[0]}`);
    // the outline still sits on the face: the mask protects the same share of it, scaled
    const before = simpleFaceMask(ref, '/user-assets/x.png', 'front', 'full', undefined, outline)!;
    const after = simpleFaceMask(crop.ref, '/user-assets/x.png', 'front', 'crop', undefined, crop.contour)!;
    const covered = (m: Buffer) => m.reduce((n, v) => n + (v < 128 ? 1 : 0), 0); // 0 = protected face
    expect(covered(after) / (covered(before) * crop.scale ** 2)).toBeGreaterThan(0.9);
    expect(covered(after) / (covered(before) * crop.scale ** 2)).toBeLessThan(1.1);
    // a retry (or Heal) asks for the very same picture
    await thighUpReference(ref, outline, 'crop', store);
    expect(keys[1]).toBe(keys[0]);
  });

  it('leaves a photo that is already framed alone', async () => {
    const ref = await referencePixels(await photo('models/crop 108/front.png'));
    const store = async () => { throw Error('should not store'); };
    expect(await thighUpReference(ref, draftOutline('/models/crop 108/front.png'), 'crop', store)).toBeNull();
  });
});
