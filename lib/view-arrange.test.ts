// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { arrangeViews, parseViewRead, type ViewRead } from './view-arrange';
import { outlineDraftSet } from './draft-outlines';
import type { UserModel } from './user-assets';

const F = (feet = false): ViewRead => ({ facing: 'front', feet });
const S = (feet = false): ViewRead => ({ facing: 'side', feet });
const B = (feet = false): ViewRead => ({ facing: 'back', feet });

describe('putting uploaded photos under the right view', () => {
  it("fixes CELINE 4: back photo as Front, full-length as Back, waist-up as Full", () => {
    expect(arrangeViews({ front: B(), side: S(), back: F(true), full: F() })).toEqual({ front: 'full', back: 'front', full: 'back' });
  });
  it('leaves a correct set, a dress set shot full-length twice, and anything not fully read alone', () => {
    expect(arrangeViews({ front: F(), side: S(), back: B(), full: F(true) })).toBeNull();
    expect(arrangeViews({ front: F(true), side: S(true), back: B(true), full: F(true) })).toBeNull();
    expect(arrangeViews({ front: B(), side: S(), back: F(true), full: null })).toBeNull();
    // Two back photos: no way to tell which belongs under Back.
    expect(arrangeViews({ front: B(), side: B(), back: F(), full: F(true) })).toBeNull();
  });
  it('swaps a turned Front with a front-facing Side, and a full-length Front with a cropped Full', () => {
    expect(arrangeViews({ front: S(), side: F(), back: B(), full: F(true) })).toEqual({ front: 'side', side: 'front' });
    expect(arrangeViews({ front: F(true), side: S(), back: B(), full: F() })).toEqual({ front: 'full', full: 'front' });
  });
  it('reads only the exact JSON shape from the vision model', () => {
    expect(parseViewRead('```json\n{"facing":"back","feet":false}\n```')).toEqual({ facing: 'back', feet: false });
    expect(parseViewRead('{"facing":"diagonal","feet":false}')).toBeNull();
    expect(parseViewRead('{"facing":"front"}')).toBeNull();
    expect(parseViewRead('I cannot tell.')).toBeNull();
  });
});

describe('preparing a Listing Team set', () => {
  const model: UserModel = { id: 'draft-jeonga-celine-4', name: 'Draft · Jeonga · CELINE 4', createdAt: '', views: { front: 'u/front.jpg', side: 'u/side.jpg', back: 'u/back.jpg', full: 'u/full.jpg' } };
  const reads: Record<string, ViewRead> = { 'u/front.jpg': B(), 'u/side.jpg': S(), 'u/back.jpg': F(true), 'u/full.jpg': F() };
  const contour = (url: string, view: string) => ({ kind: 'contour' as const, width: 1, height: 1, sha256: url + '@' + view, source: 'auto-draft-v1' as const, detectedAt: '' });

  it('moves the photos, then outlines every view against its new place', async () => {
    const saves: UserModel[] = [];
    const out = await outlineDraftSet(model, {
      read: async (u) => reads[u], detect: async (u, v) => contour(u, v),
      save: async (m, contours, views) => { const s = { ...m, contours, views }; saves.push(s); return s; },
    }, { arrange: true });
    expect(out.arranged).toEqual({ front: 'full', back: 'front', full: 'back' });
    expect(out.model.views).toEqual({ front: 'u/full.jpg', side: 'u/side.jpg', back: 'u/front.jpg', full: 'u/back.jpg' });
    expect(out.model.contours!.back!.sha256).toBe('u/front.jpg@back');
    expect(out.outlines).toEqual({ front: 'contour', side: 'contour', back: 'contour', full: 'contour' });
    expect(saves).toHaveLength(1);
  });
  it('on a re-check keeps every outline already found and only fills the missing one', async () => {
    const withSome = { ...model, contours: { side: contour('u/side.jpg', 'side'), back: contour('u/back.jpg', 'back'), full: contour('u/full.jpg', 'full') } };
    const detected: string[] = [];
    const out = await outlineDraftSet(withSome, {
      read: async () => { throw Error('not called'); }, detect: async (u, v) => { detected.push(v); return contour(u, v); },
      save: async (m, contours, views) => ({ ...m, contours, views }),
    }, { arrange: false });
    expect(detected).toEqual(['front']);
    expect(out.arranged).toBeNull();
    expect(out.model.contours!.side).toBe(withSome.contours.side);
  });
  it('still outlines the set when the vision read fails', async () => {
    const out = await outlineDraftSet(model, {
      read: async () => { throw Error('fal down'); }, detect: async (u, v) => contour(u, v),
      save: async (m, contours, views) => ({ ...m, contours, views }),
    }, { arrange: true });
    expect(out.arranged).toBeNull();
    expect(out.model.views).toEqual(model.views);
    expect(Object.values(out.outlines)).toEqual(['contour', 'contour', 'contour', 'contour']);
  });
});
