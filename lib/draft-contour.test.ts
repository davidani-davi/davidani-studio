// @vitest-environment node
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { buildAutoContour, buildLooseContour, detectAutoContour, type Grounding } from './draft-contour';
import { contourFaceMask } from './contour-face-mask';
import { simpleFaceMask } from './simple-reference-shot';
import { referencePixels } from './garment-only';
import { viewReference } from './view-reference';
import presets from './simple-contour-presets.json';

const REF = { width: 1024, height: 1536, sha256: 'abc' };
// Florence-2 boxes measured on crop 97/side.png (reviewed garment row 383).
const g: Grounding = { head: [{ x: 288, y: 36, w: 272, h: 321 }], face: [{ x: 307, y: 110, w: 193, h: 244 }], clothing: [{ x: 269, y: 371, w: 534, h: 1074 }] };
const inside = (pt: number[], poly: number[][]) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, yi] = poly[i], [xj, yj] = poly[j]; if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < (xj - xi) * (pt[1] - yi) / (yj - yi) + xi) c = !c; } return c; };

describe('draft reference outlines', () => {
  it('encloses the whole face box and ends its feather above the garment line', () => {
    const c = buildAutoContour(REF, g, 'side')!;
    expect(c.kind).toBe('contour'); expect(c.source).toBe('auto-draft-v1');
    const f = g.face![0];
    for (const corner of [[f.x, f.y], [f.x + f.w, f.y], [f.x + f.w, f.y + f.h], [f.x, f.y + f.h]]) expect(inside(corner, c.points!)).toBe(true);
    expect(Math.max(...c.points!.map(p => p[1])) + c.featherPixels!).toBeLessThanOrEqual(c.garmentBoundaryY!);
    expect(c.garmentBoundaryY).toBeLessThanOrEqual(383);
    expect(c.featherPixels).toBeGreaterThanOrEqual(6);
  });
  it('refuses when the clothing box reaches the chin, and keeps a wider margin under hair on a back view', () => {
    expect(buildAutoContour(REF, { ...g, clothing: [{ x: 269, y: 350, w: 534, h: 1074 }] }, 'side')).toBeNull();
    const back = buildAutoContour(REF, { head: [{ x: 396, y: 31, w: 298, h: 397 }], face: [], clothing: [{ x: 152, y: 392, w: 706, h: 1054 }] }, 'back')!;
    expect(back.garmentBoundaryY).toBeLessThan(365); // reviewed studio 97/back.png garment row
    expect(buildAutoContour(REF, { head: [{ x: 396, y: 31, w: 298, h: 397 }], face: [], clothing: [{ x: 152, y: 392, w: 706, h: 1054 }] }, 'front')).toBeNull();
  });
  it('outlines Listing Team photos whose face box ends just inside the feather band, and ignores face boxes on backs', () => {
    // Florence-2 boxes measured 2026-10-30 on Jeonga's 1365x2048 sets that were refused before.
    const R = { width: 1365, height: 2048, sha256: 'abc' };
    const cases: [string, Grounding][] = [
      ['front', { head: [{ x: 497.5, y: 70.7, w: 324.9, h: 399.4 }], face: [{ x: 541.2, y: 166.9, w: 215.7, h: 297.0 }], clothing: [{ x: 180.9, y: 476.2, w: 911.8, h: 1566.7 }] }], // VISION 3
      ['side', { head: [{ x: 402.0, y: 52.2, w: 455.9, h: 458.8 }], face: [{ x: 432.0, y: 183.3, w: 245.7, h: 323.6 }], clothing: [{ x: 296.9, y: 521.2, w: 774.0, h: 1519.6 }] }], // CELINE 3
      ['full', { head: [{ x: 528.9, y: 52.2, w: 217.0, h: 256 }], face: [{ x: 605.4, y: 107.5, w: 125.6, h: 186.4 }], clothing: [{ x: 408.8, y: 310.3, w: 544.6, h: 1669.1 }] }], // CELINE 3
      ['back', { head: [{ x: 425.2, y: 46.1, w: 446.4, h: 512 }], face: [{ x: 425.2, y: 191.5, w: 152.9, h: 327.7 }], clothing: [{ x: 149.5, y: 539.6, w: 1131.6, h: 1503.2 }] }], // CELINE 1
      ['back', { head: [{ x: 421.1, y: 60.4, w: 404.0, h: 434.2 }], face: [{ x: 448.4, y: 189.4, w: 151.5, h: 290.8 }], clothing: [{ x: 232.7, y: 511.0, w: 898.2, h: 1529.9 }] }], // CELINE 2
      ['back', { head: [{ x: 561.7, y: 54.3, w: 278.5, h: 305.2 }], face: [{ x: 565.8, y: 195.6, w: 75.1, h: 118.8 }], clothing: [{ x: 408.8, y: 341.0, w: 551.5, h: 1036.3 }, { x: 408.8, y: 537.6, w: 551.5, h: 837.6 }] }], // VISION 2
    ];
    for (const [view, box] of cases) {
      const c = buildAutoContour(R, box, view)!;
      expect(c?.kind).toBe('contour');
      expect(Math.max(...c.points!.map(p => p[1])) + c.featherPixels!).toBeLessThanOrEqual(c.garmentBoundaryY!);
      const f = box.face![0], h = box.head[0];
      // The outline still covers the face down to its chin on a front/side/full, and the head on a back.
      const probe = view === 'back' ? [h.x + h.w / 2, h.y + h.h * .4] : [f.x + f.w / 2, f.y + f.h * .9];
      expect(inside(probe, c.points!)).toBe(true);
    }
  });
  it('refuses implausible or cut-off heads and records waist-down crops as headless', () => {
    expect(buildAutoContour(REF, { ...g, head: [{ x: 288, y: 36, w: 20, h: 321 }] }, 'front')).toBeNull();
    expect(buildAutoContour(REF, { ...g, head: [{ x: 288, y: 2, w: 272, h: 321 }] }, 'front')).toBeNull();
    expect(buildAutoContour(REF, { ...g, clothing: [] }, 'front')).toBeNull();
    expect(buildAutoContour(REF, { head: [{ x: 272, y: 1, w: 164, h: 77 }], clothing: [{ x: 100, y: 40, w: 600, h: 1400 }] }, 'back')).toMatchObject({ kind: 'no-head', sha256: 'abc' });
  });
  it('lets Simple garment swap protect a draft photo with its outline, bound to its pixels', async () => {
    const bytes = fs.readFileSync('public/models/crop 100/front.png'), ref = await referencePixels(bytes);
    const reviewed = (presets as any)['/models/crop 100/front.png'];
    const pts = reviewed.points as [number, number][];
    const ys = pts.map(p => p[1]), xs = pts.map(p => p[0]);
    const x0 = Math.min(...xs), y0 = Math.min(...ys), x1 = Math.max(...xs), y1 = Math.max(...ys);
    const auto = buildAutoContour(ref, { head: [{ x: x0, y: y0, w: x1 - x0, h: y1 - y0 }], clothing: [{ x: 0, y: reviewed.garmentBoundaryY, w: ref.width, h: ref.height / 2 }] }, 'front')!;
    expect(auto).not.toBeNull();
    const mask = simpleFaceMask(ref, 'https://blob.example/user-models/draft/front.jpg', 'front', 'full', undefined, auto)!;
    expect(mask.length).toBe(ref.width * ref.height);
    const cx = Math.round((x0 + x1) / 2), cy = Math.round((y0 + y1) / 2);
    expect(mask[cy * ref.width + cx]).toBe(0);                       // face kept from the original
    expect(mask[(ref.height - 10) * ref.width + cx]).toBe(255);      // garment area generated
    expect(() => simpleFaceMask({ ...ref, sha256: 'changed' }, 'https://blob.example/x.jpg', 'front', 'full', undefined, auto)).toThrow();
    expect(() => simpleFaceMask(ref, 'https://blob.example/x.jpg', 'front', 'full')).toThrow('contour review');
    expect(() => simpleFaceMask(ref, 'https://blob.example/x.jpg', 'front', 'full', undefined, { ...auto, source: 'other' as any })).toThrow('contour review');
  });
  it('detects from the stored bytes and carries the outline through the catalogue', async () => {
    const bytes = fs.readFileSync('public/models/crop 100/front.png');
    const asked: string[] = [];
    const c = await detectAutoContour('https://blob.example/f.png', 'side', { fetch: (async () => new Response(bytes)) as any, referencePixels, ground: async (_u, text) => { asked.push(text); return (g as any)[text]; } });
    expect(asked.sort()).toEqual(['clothing', 'face', 'head']); expect(c?.kind).toBe('contour');
    expect(c?.sha256).toBe((await referencePixels(bytes)).sha256);
    const models: any = [{ id: 'user-x', name: 'Draft · Jeonga · test', userAdded: true, poses: [{ id: 'user-x-pose', views: { side: { filename: 'side', publicPath: 'https://blob.example/side.jpg', autoContour: c } } }] }];
    const r = viewReference(models, 'user-x', 'user-x-pose', 'side', 'crop');
    expect(r.autoContour).toBe(c); expect(r.reframed).toBe(false);
  });
  it('never leaves a photo with a head unoutlined: back rule for a back photo in a front slot, then a loose outline', async () => {
    const bytes = fs.readFileSync('public/models/crop 100/front.png'), ref = await referencePixels(bytes);
    const detect = (box: Grounding, view: string) => detectAutoContour('https://blob.example/f.png', view, { fetch: (async () => new Response(bytes)) as any, referencePixels, ground: async (_u, text) => (box as any)[text] || [] });
    // CELINE 4: her back photo saved as Front. The front rule refuses it (hair over the collar); the back rule takes it.
    const backPhoto: Grounding = { head: [{ x: 396, y: 31, w: 298, h: 397 }], face: [], clothing: [{ x: 152, y: 392, w: 706, h: 1054 }] };
    expect(buildAutoContour(ref, backPhoto, 'front')).toBeNull();
    expect(await detect(backPhoto, 'front')).toMatchObject({ kind: 'contour', fit: 'back-rule' });
    // A head touching the top edge fails both rules: the loose outline still protects the upper head.
    const cut: Grounding = { ...g, head: [{ x: 288, y: 2, w: 272, h: 321 }] };
    const loose = (await detect(cut, 'front'))!;
    expect(loose).toMatchObject({ kind: 'contour', fit: 'loose' });
    const mask = contourFaceMask(ref, loose as any);
    expect(mask[(2 + 321 * .4 | 0) * ref.width + (288 + 136)]).toBe(0);   // forehead/eyes kept
    expect(mask[(ref.height - 10) * ref.width + (288 + 136)]).toBe(255);  // garment generated
    // Face only, no head box: grown out to the hair. Nothing at all: headless, nothing protected.
    expect(buildLooseContour(ref, { head: [], face: g.face, clothing: g.clothing }, 'side')).toMatchObject({ kind: 'contour', fit: 'loose' });
    expect(buildLooseContour(ref, { head: [], face: [], clothing: g.clothing }, 'front')).toMatchObject({ kind: 'no-head', fit: 'none-found' });
  });
  it('keeps a loose outline inside the frame and above the garment line', () => {
    for (const box of [{ x: 0, y: 0, w: 500, h: 600 }, { x: 900, y: 10, w: 124, h: 200 }, { x: 300, y: 40, w: 300, h: 340 }]) {
      const c = buildLooseContour(REF, { head: [box], clothing: [{ x: 100, y: box.y + box.h * .9, w: 800, h: 900 }] }, 'front');
      expect(c.kind).toBe('contour');
      for (const [x, y] of c.points!) { expect(x).toBeGreaterThanOrEqual(0); expect(x).toBeLessThan(REF.width); expect(y).toBeGreaterThanOrEqual(0); expect(y).toBeLessThan(REF.height); }
      expect(c.featherPixels!).toBeGreaterThanOrEqual(6); expect(c.featherPixels!).toBeLessThanOrEqual(Math.min(REF.width, REF.height) / 4);
      expect(Math.max(...c.points!.map(p => p[1]))).toBeGreaterThanOrEqual(box.y + box.h * .55 - 1);
    }
  });
});
