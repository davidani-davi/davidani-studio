import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { referencePixels } from './garment-only';
import { faceProtectionOf, simpleFaceMask } from './simple-reference-shot';
import type { AutoContour } from './model-admin-core';

const REVIEWED = '/models/studio 97/back.png';
const auto = (source: AutoContour['source'], kind: AutoContour['kind'] = 'contour') =>
  ({ kind, width: 1, height: 1, sha256: 'x', source, detectedAt: '' }) as AutoContour;

describe('which outline protects the face', () => {
  it('reports the reviewed preset first, then the recast mask, then the draft outline', () => {
    expect(faceProtectionOf(REVIEWED, auto('recast-mask-v1'), true)).toBe('reviewed-contour-v1');
    expect(faceProtectionOf('/user-assets/user-models/vision-dd70049/poses/front-03.png', auto('recast-mask-v1'), true)).toBe('recast-mask-contour-v1');
    expect(faceProtectionOf('/user-assets/u.png', auto('recast-mask-v1', 'no-head'), false)).toBe('recast-mask-no-head-v1');
    expect(faceProtectionOf('/user-assets/u.png', auto('auto-draft-v1'), true)).toBe('auto-draft-contour-v1');
    expect(faceProtectionOf(REVIEWED, undefined, true)).toBe('reviewed-contour-v1');
  });

  it("masks a recast pose with its own outline (0 inside, 255 outside) and refuses a changed photo", async () => {
    const bytes = await sharp({ create: { width: 40, height: 60, channels: 4, background: '#c8b4a0' } }).png().toBuffer();
    const ref = await referencePixels(bytes);
    const outline: AutoContour = {
      kind: 'contour', width: 40, height: 60, sha256: ref.sha256, source: 'recast-mask-v1', detectedAt: '',
      points: [[10, 4], [30, 4], [30, 22], [10, 22]], featherPixels: 4,
    };
    const mask = simpleFaceMask(ref, '/user-assets/u.png', 'front', 'crop', undefined, outline)!;
    expect(mask[13 * 40 + 20]).toBe(0);
    expect(mask[55 * 40 + 2]).toBe(255);
    expect(() => simpleFaceMask(ref, '/user-assets/u.png', 'front', 'crop', undefined, { ...outline, sha256: 'other' })).toThrow('The model reference changed');
    expect(() => simpleFaceMask(ref, '/user-assets/u.png', 'front', 'crop', undefined, undefined)).toThrow('needs a face/hair contour review');
  });
});
