import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { blendInside, changeMask, drawMarks, editSize, newRedInk, parseTouchUp, runTouchUp, touchUpPrompt, type Point, type TouchUpDeps } from './touch-up';

const W = 200, H = 300;
const solid = (r: number, g: number, b: number, w = W, h = H) =>
  sharp({ create: { width: w, height: h, channels: 4, background: { r, g, b, alpha: 1 } } }).png().toBuffer();
// A noisy photo, so "unchanged" means every byte, not just a flat colour.
async function photo(w = W, h = H) {
  const d = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) { d[i * 4] = (i * 7) % 200; d[i * 4 + 1] = (i * 13) % 180; d[i * 4 + 2] = (i * 3) % 160; d[i * 4 + 3] = 255; }
  return sharp(d, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer();
}
const raw = async (png: Buffer) => (await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true }));
const circle = (cx: number, cy: number, r: number, n = 40): Point[] =>
  Array.from({ length: n + 1 }, (_, i) => [cx + r * Math.cos((i / n) * 2 * Math.PI), cy + r * (W / H) * Math.sin((i / n) * 2 * Math.PI)] as Point);
const at = async (mask: Buffer, x: number, y: number) => (await sharp(mask).extractChannel(0).raw().toBuffer())[Math.round(y * H) * W + Math.round(x * W)];

describe('touch-up input', () => {
  const good = { url: 'https://v3b.fal.media/files/b/x/garment-only.png', marks: [circle(0.5, 0.5, 0.1)], note: '  remove the scarf ' };
  it('accepts a render link, marks inside the photo and a note', () => {
    const t = parseTouchUp(good);
    expect(t.note).toBe('remove the scarf');
    expect(t.marks[0].length).toBe(41);
  });
  it('refuses other hosts, empty or too many marks, points outside the photo and missing or long notes', () => {
    expect(() => parseTouchUp({ ...good, url: 'https://evil.example/a.png' })).toThrow(/render image link/);
    expect(() => parseTouchUp({ ...good, marks: [] })).toThrow(/1 to 20/);
    expect(() => parseTouchUp({ ...good, marks: Array(21).fill(circle(0.5, 0.5, 0.1)) })).toThrow(/1 to 20/);
    expect(() => parseTouchUp({ ...good, marks: [[[0.1, 0.1]]] })).toThrow(/too short/);
    expect(() => parseTouchUp({ ...good, marks: [Array(401).fill([0.1, 0.1])] })).toThrow(/too long/);
    expect(() => parseTouchUp({ ...good, marks: [[[0.1, 0.1], [1.2, 0.5]]] })).toThrow(/inside the photo/);
    expect(() => parseTouchUp({ ...good, note: '   ' })).toThrow(/Say what to change/);
    expect(() => parseTouchUp({ ...good, note: 'x'.repeat(301) })).toThrow(/Say what to change/);
    expect(() => parseTouchUp(null)).toThrow();
  });
  it('puts the note in the prompt and forbids pen marks in the result', () => {
    expect(touchUpPrompt('remove the scarf')).toMatch(/Inside the red marks only: remove the scarf\./);
    expect(touchUpPrompt('x')).toMatch(/must not contain any red lines/);
  });
});

describe('change mask', () => {
  it('fills the inside of a loop and leaves the far corner alone', async () => {
    const m = await changeMask([circle(0.5, 0.5, 0.15)], W, H);
    expect(await at(m, 0.5, 0.5)).toBe(255);
    expect(await at(m, 0.05, 0.05)).toBe(0);
  });
  it('turns an open line into a band around it, not an area', async () => {
    const m = await changeMask([[[0.2, 0.5], [0.8, 0.5]]], W, H);
    expect(await at(m, 0.5, 0.5)).toBe(255);
    expect(await at(m, 0.5, 0.6)).toBe(0);
  });
});

describe('blend inside the circles', () => {
  it('keeps every pixel outside the mask byte-identical and takes the edit inside', async () => {
    const original = await photo(), edited = await solid(10, 200, 40);
    const marks = [circle(0.5, 0.5, 0.15)];
    const soft = await changeMask(marks, W, H, { soft: true });
    const { png, area } = await blendInside(original, edited, soft);
    const [o, r, m] = await Promise.all([raw(original), raw(png), sharp(soft).extractChannel(0).raw().toBuffer()]);
    let outside = 0;
    for (let p = 0; p < W * H; p++) if (m[p] === 0) {
      outside++;
      for (let c = 0; c < 4; c++) expect(r.data[p * 4 + c]).toBe(o.data[p * 4 + c]);
    }
    expect(outside).toBeGreaterThan(W * H * 0.8);
    expect(area).toBeGreaterThan(0.03);
    expect(area).toBeLessThan(0.2);
  });
  it('takes the image model\'s overall tone shift off before blending', async () => {
    // Edit = original + 20 everywhere: no visible change should be pasted in.
    const original = await solid(100, 100, 100), edited = await solid(120, 120, 120);
    const soft = await changeMask([circle(0.5, 0.5, 0.15)], W, H, { soft: true });
    const r = await raw((await blendInside(original, edited, soft)).png);
    const mid = (Math.round(0.5 * H) * W + Math.round(0.5 * W)) * 4;
    expect(r.data[mid]).toBe(100);
  });
});

describe('red ink check', () => {
  it('finds pen marks copied into the result, and ignores a clean edit', async () => {
    const original = await solid(200, 200, 190);
    const marks = [circle(0.5, 0.5, 0.15)];
    expect(await newRedInk(original, await drawMarks(original, marks), marks)).toBe(true);
    expect(await newRedInk(original, await solid(150, 150, 150), marks)).toBe(false);
  });
});

describe('edit size', () => {
  it('rounds to multiples of 16 and scales small photos up', () => {
    expect(editSize(1024, 1536)).toEqual({ width: 1024, height: 1536 });
    const s = editSize(500, 750);
    expect(s.width % 16 + s.height % 16).toBe(0);
    expect(s.width * s.height).toBeGreaterThanOrEqual(655360);
  });
});

describe('runTouchUp', () => {
  function fakes(outputs: Buffer[]) {
    const files = new Map<string, Buffer>();
    let n = 0;
    const calls: Parameters<TouchUpDeps['edit']>[0][] = [];
    const deps: TouchUpDeps = {
      async fetchBytes(url) { const b = files.get(url); if (!b) throw Error('missing ' + url); return b; },
      async upload(png, name) { const url = `https://v3.fal.media/${++n}-${name}`; files.set(url, png); return url; },
      async edit(args) { calls.push(args); const url = `https://v3.fal.media/out-${calls.length}.png`; files.set(url, outputs[calls.length - 1]); return url; },
    };
    return { files, deps, calls };
  }
  it('retries once when the pen marks come back, then keeps the clean result', async () => {
    const original = await photo(1024, 1536);
    const marks = [circle(0.5, 0.5, 0.15)];
    const big = await sharp(original).png().toBuffer();
    const { files, deps, calls } = fakes([await drawMarks(big, marks), await solid(10, 200, 40, 1024, 1536)]);
    files.set('https://v3.fal.media/render.png', original);
    const out = await runTouchUp({ url: 'https://v3.fal.media/render.png', marks, note: 'remove the scarf' }, deps);
    expect(out.attempts).toBe(2);
    expect(calls).toHaveLength(2);
    expect(calls[0].imageUrls).toHaveLength(2);
    expect(calls[0].size).toEqual({ width: 1024, height: 1536 });
    expect(calls[0].prompt).toMatch(/remove the scarf/);
    expect(files.get(out.url)).toBeDefined();
  });
  it('fails with a reason when both tries copy the marks', async () => {
    const original = await photo(1024, 1536);
    const marks = [circle(0.5, 0.5, 0.15)];
    const inked = await drawMarks(original, marks);
    const { files, deps } = fakes([inked, inked]);
    files.set('https://v3.fal.media/render.png', original);
    await expect(runTouchUp({ url: 'https://v3.fal.media/render.png', marks, note: 'x' }, deps)).rejects.toThrow(/red pen marks/);
  });
});
