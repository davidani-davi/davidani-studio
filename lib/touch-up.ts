import sharp from 'sharp';
import { isHealableUrl } from '@/lib/heal';

/**
 * Touch up (2026-11-03): the operator circles a spot on a finished render with a red pen and says what to change
 * ("remove the scarf"). One GPT Image 2.5 edit sees the clean photo, a copy with the marks drawn on it and a mask
 * of the circled area; only the circled area of its answer is blended back into the original, so every pixel
 * outside the circles stays the original's (face, pose, background, the rest of the outfit).
 */

export type Point = [number, number];
export interface TouchUpInput { url: string; marks: Point[][]; note: string }
export interface TouchUpDeps {
  fetchBytes(url: string): Promise<Buffer>;
  upload(png: Buffer, name: string): Promise<string>;
  /** One image edit; answers the output image's URL. */
  edit(args: { prompt: string; imageUrls: string[]; maskUrl: string; size: { width: number; height: number } }): Promise<string>;
}

export const MAX_STROKES = 20, MAX_POINTS = 400, MAX_NOTE = 300;
export const PEN = '#E5322D';
const penWidth = (w: number) => Math.max(4, Math.round(0.006 * w));
const growBy = (w: number) => Math.max(6, Math.round(0.015 * w));

export function parseTouchUp(v: unknown): TouchUpInput {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw Error('Touch-up needs a photo, marks and a note.');
  const { url, marks, note } = v as Record<string, unknown>;
  if (!isHealableUrl(url)) throw Error('Touch-up needs the render image link.');
  if (!Array.isArray(marks) || marks.length < 1 || marks.length > MAX_STROKES) throw Error(`Draw 1 to ${MAX_STROKES} marks.`);
  const clean = marks.map((stroke) => {
    if (!Array.isArray(stroke) || stroke.length < 2 || stroke.length > MAX_POINTS) throw Error('A mark is too short or too long.');
    return stroke.map((p) => {
      if (!Array.isArray(p) || p.length !== 2 || !p.every((n) => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 1))
        throw Error('Mark points must be inside the photo.');
      return [p[0], p[1]] as Point;
    });
  });
  const text = typeof note === 'string' ? note.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim() : '';
  if (!text || text.length > MAX_NOTE) throw Error(`Say what to change (up to ${MAX_NOTE} characters).`);
  return { url, marks: clean, note: text };
}

function pathOf(stroke: Point[], w: number, h: number, close: boolean): string {
  const d = stroke.map(([x, y], i) => `${i ? 'L' : 'M'}${(x * w).toFixed(1)} ${(y * h).toFixed(1)}`).join(' ');
  return close ? d + ' Z' : d;
}

/**
 * The area that may change, white on black, w×h: every stroke closed and filled (a near-circle counts as its
 * inside, an open line as nothing but its band), plus the pen width, grown by 1.5% of the width.
 */
export async function changeMask(marks: Point[][], w: number, h: number, opts: { soft?: boolean } = {}): Promise<Buffer> {
  const grow = growBy(w), width = penWidth(w) + 2 * grow;
  const paths = marks.map((s) => `<path d="${pathOf(s, w, h, true)}" fill="white" fill-rule="nonzero" stroke="white" stroke-width="${width}" stroke-linejoin="round" stroke-linecap="round"/>`).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="black"/>${paths}</svg>`;
  let img = sharp(Buffer.from(svg)).resize(w, h, { fit: 'fill' }).flatten({ background: '#000' }).extractChannel(0);
  if (opts.soft) img = img.blur(Math.max(0.3, grow / 2));
  return img.png().toBuffer();
}

/** The marked copy the image model reads: the photo with the operator's red strokes on it. */
export async function drawMarks(png: Buffer, marks: Point[][]): Promise<Buffer> {
  const { width: w = 0, height: h = 0 } = await sharp(png).metadata();
  const paths = marks.map((s) => `<path d="${pathOf(s, w, h, false)}" fill="none" stroke="${PEN}" stroke-width="${penWidth(w)}" stroke-linejoin="round" stroke-linecap="round"/>`).join('');
  const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${paths}</svg>`);
  return sharp(png).composite([{ input: svg, top: 0, left: 0 }]).png().toBuffer();
}

async function rgba(png: Buffer, w?: number, h?: number) {
  const img = w && h ? sharp(png).resize(w, h, { fit: 'fill' }) : sharp(png);
  const { data, info } = await img.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

/**
 * The edit, only inside the mask. The image model can shift the whole frame's tone a little, so its mean
 * difference from the original over the untouched area is taken off first; otherwise the circle shows as a patch.
 * Where the mask is 0 the original's bytes are copied unchanged.
 */
export async function blendInside(original: Buffer, edited: Buffer, softMask: Buffer): Promise<{ png: Buffer; area: number }> {
  const o = await rgba(original);
  const { width: w, height: h } = o;
  const e = await rgba(edited, w, h);
  const m = await sharp(softMask).resize(w, h, { fit: 'fill' }).extractChannel(0).raw().toBuffer();
  const shift = [0, 0, 0];
  let outside = 0;
  for (let p = 0; p < w * h; p++) if (m[p] === 0) {
    outside++;
    for (let c = 0; c < 3; c++) shift[c] += e.data[p * 4 + c] - o.data[p * 4 + c];
  }
  if (outside) for (let c = 0; c < 3; c++) shift[c] = Math.round(shift[c] / outside);
  const out = Buffer.from(o.data);
  let changed = 0;
  for (let p = 0; p < w * h; p++) {
    const a = m[p];
    if (!a) continue;
    if (a >= 128) changed++;
    for (let c = 0; c < 3; c++) {
      const i = p * 4 + c, edit = Math.min(255, Math.max(0, e.data[i] - shift[c]));
      out[i] = a === 255 ? edit : Math.round(o.data[i] + ((edit - o.data[i]) * a) / 255);
    }
  }
  const png = await sharp(out, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer();
  return { png, area: +(changed / (w * h)).toFixed(4) };
}

const isRed = (d: Buffer, i: number) => d[i] >= 170 && d[i + 1] <= 110 && d[i + 2] <= 110 && d[i] - d[i + 1] >= 90;

/** True when the result shows pen ink along the strokes that the original did not have there. */
export async function newRedInk(original: Buffer, result: Buffer, marks: Point[][]): Promise<boolean> {
  const o = await rgba(original);
  const { width: w, height: h } = o;
  const r = await rgba(result, w, h);
  const paths = marks.map((s) => `<path d="${pathOf(s, w, h, false)}" fill="none" stroke="white" stroke-width="${penWidth(w) * 2}" stroke-linejoin="round" stroke-linecap="round"/>`).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="black"/>${paths}</svg>`;
  const band = await sharp(Buffer.from(svg)).resize(w, h, { fit: 'fill' }).flatten({ background: '#000' }).extractChannel(0).raw().toBuffer();
  let inBand = 0, ink = 0;
  for (let p = 0; p < w * h; p++) if (band[p] >= 128) {
    inBand++;
    if (isRed(r.data, p * 4) && !isRed(o.data, p * 4)) ink++;
  }
  return inBand > 0 && ink / inBand > 0.08;
}

export function touchUpPrompt(note: string): string {
  return [
    'Edit the first photograph. The second image is the same photograph with red pen marks a retoucher drew around the area to fix.',
    `Inside the red marks only: ${note}.`,
    'Everything outside the marks stays exactly as in the first photograph: the same person, face, hair, pose, hands, lighting, background, framing and the rest of the clothing.',
    'Where something is removed, show what would naturally be behind it, matching the surrounding fabric, skin or backdrop, with the same light and grain.',
    'The result must not contain any red lines, circles or pen marks.',
  ].join(' ');
}

/** The image model wants both edges in multiples of 16 and 0.66–8.3 MP; the output is resized back afterwards. */
export function editSize(w: number, h: number): { width: number; height: number } {
  const px = w * h, scale = px < 655360 ? Math.sqrt(655360 / px) : px > 8294400 ? Math.sqrt(8294400 / px) : 1;
  const r16 = (n: number, up: boolean) => (up ? Math.ceil(n / 16) : Math.floor(n / 16)) * 16;
  return { width: r16(w * scale, scale > 1), height: r16(h * scale, scale > 1) };
}

const defaultDeps: TouchUpDeps = {
  async fetchBytes(url) {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw Error(`Could not load the photo (${res.status}).`);
    return Buffer.from(await res.arrayBuffer());
  },
  async upload(png, name) {
    const { uploadToFal } = await import('@/lib/fal');
    return uploadToFal(new Blob([Uint8Array.from(png)], { type: 'image/png' }), name);
  },
  async edit({ prompt, imageUrls, maskUrl, size }) {
    const { generate } = await import('@/lib/fal');
    const out = await generate({ modelId: 'gpt-image-25', prompt, imageUrls, referenceImageUrl: null, useDefaultReference: false,
      verbatimPrompt: true, imageSize: size, maskUrl, resolution: '2K', format: 'png', numImages: 1 });
    const url = out.images?.[0]?.url;
    if (!url) throw Error('The image model returned no image.');
    return url;
  },
};

export async function runTouchUp(t: TouchUpInput, deps: TouchUpDeps = defaultDeps): Promise<{ url: string; area: number; attempts: number }> {
  const original = await deps.fetchBytes(t.url);
  const { width: w = 0, height: h = 0 } = await sharp(original).metadata();
  if (!w || !h) throw Error('The photo could not be read.');
  const size = editSize(w, h);
  const clean = await sharp(original).resize(size.width, size.height, { fit: 'fill' }).png().toBuffer();
  const [cleanUrl, markedUrl, maskUrl] = await Promise.all([
    deps.upload(clean, 'touch-up-photo.png'),
    drawMarks(clean, t.marks).then((b) => deps.upload(b, 'touch-up-marked.png')),
    changeMask(t.marks, size.width, size.height).then((b) => deps.upload(b, 'touch-up-mask.png')),
  ]);
  const softMask = await changeMask(t.marks, w, h, { soft: true });
  for (let attempts = 1; attempts <= 2; attempts++) {
    const edited = await deps.fetchBytes(await deps.edit({ prompt: touchUpPrompt(t.note), imageUrls: [cleanUrl, markedUrl], maskUrl, size }));
    const blended = await blendInside(original, edited, softMask);
    if (await newRedInk(original, blended.png, t.marks)) continue;   // the pen marks were copied: one more try
    const url = await deps.upload(blended.png, 'touch-up.png');
    // Never hand back an unverified file (same rule as protected renders).
    if (!(await deps.fetchBytes(url)).equals(blended.png)) throw Error('The touched-up photo did not upload correctly.');
    return { url, area: blended.area, attempts };
  }
  throw Error('the result still showed the red pen marks. Circle a little wider and try again');
}
