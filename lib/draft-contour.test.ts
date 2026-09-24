// @vitest-environment node
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { buildAutoContour, detectAutoContour, type Grounding } from './draft-contour';
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
});
