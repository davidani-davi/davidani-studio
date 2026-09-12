import sharp from 'sharp';
import { createHash } from 'node:crypto';

export type Point = [number, number];
export interface GarmentEdit {
  version: 1; referencePath: string; referenceSha256: string;
  width: number; height: number; regions: Point[][]; protectedRegions: Point[][];
  reviewed: true; protectedHeadReviewed: boolean;
}
export interface ReferencePixels { data: Buffer; width: number; height: number; sha256: string }
const digest = (b: Buffer) => createHash('sha256').update(b).digest('hex');

/** Canonical displayed reference pixels. Never resize the reference. */
export async function referencePixels(bytes: Buffer): Promise<ReferencePixels> {
  const { data, info } = await sharp(bytes, { limitInputPixels: 20_000_000 })
    .rotate().toColourspace('srgb').ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (!info.width || !info.height || info.width > 4096 || info.height > 4096) throw Error('Reference must be at most 4096 pixels on either side.');
  return { data, width: info.width, height: info.height, sha256: digest(data) };
}

export function validateEdit(input: unknown): GarmentEdit {
  const e = input as GarmentEdit;
  if (!e || e.version !== 1 || e.reviewed !== true || typeof e.protectedHeadReviewed !== 'boolean' ||
      typeof e.referencePath !== 'string' || !e.referencePath.startsWith('/models/') || e.referencePath.length > 500 ||
      !/^[a-f0-9]{64}$/.test(e.referenceSha256 || '') ||
      !Number.isInteger(e.width) || !Number.isInteger(e.height) || e.width < 1 || e.height < 1 || e.width > 4096 || e.height > 4096)
    throw Error('Review the edit area on the current reference before generating.');
  let points = 0;
  for (const polygons of [e.regions, e.protectedRegions]) {
    if (!Array.isArray(polygons) || polygons.length > 32) throw Error('Use at most 32 regions per mask.');
    for (const polygon of polygons) {
      if (!Array.isArray(polygon) || polygon.length < 3 || polygon.length > 256) throw Error('Each region needs 3–256 points.');
      points += polygon.length;
      if (points > 2000 || polygon.some(p => !Array.isArray(p) || p.length !== 2 || p.some(n => typeof n !== 'number' || !Number.isFinite(n) || n < 0 || n > 1)))
        throw Error('Invalid edit-area coordinates.');
    }
  }
  if (!e.regions.length) throw Error('Mark the garment area first.');
  return e;
}

/** White = editable; protected polygons always win, including edge pixels. */
export async function editMask(e: GarmentEdit, ref: ReferencePixels, needsHead: boolean) {
  validateEdit(e);
  if (e.width !== ref.width || e.height !== ref.height || e.referenceSha256 !== ref.sha256)
    throw Error('The reference changed. Review a new mask before generating.');
  if (needsHead && (!e.protectedHeadReviewed || !e.protectedRegions.length))
    throw Error('Mark and confirm the protected head region first.');
  const render = async (polygons: Point[][]) => {
    const shapes = polygons.map(p => `<polygon points="${p.map(([x,y]) => `${x*ref.width},${y*ref.height}`).join(' ')}" fill="white"/>`).join('');
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${ref.width}" height="${ref.height}"><rect width="100%" height="100%" fill="black"/>${shapes}</svg>`;
    return sharp(Buffer.from(svg)).removeAlpha().greyscale().raw().toBuffer();
  };
  const [paint, protect] = await Promise.all([render(e.regions), render(e.protectedRegions)]);
  // Feather inward only. No protected pixel acquires generated content.
  const softened = await sharp(paint, { raw: { width: ref.width, height: ref.height, channels: 1 } })
    .blur(0.7).greyscale().raw().toBuffer();
  const alpha = Buffer.alloc(paint.length);
  let edited = 0, headProtected = 0;
  for (let i=0;i<alpha.length;i++) {
    if (protect[i] > 0) headProtected++;
    alpha[i] = protect[i] > 0 || paint[i] === 0 ? 0 : Math.min(paint[i], softened[i]);
    if (alpha[i]) edited++;
  }
  if (!edited || edited === alpha.length) throw Error('The mask must contain editable and protected pixels.');
  if (needsHead && headProtected < alpha.length * 0.005) throw Error('The protected head region is too small. Review the full head.');
  return alpha;
}

/** Hard composition, not AI restoration. Model output can NEVER replace a zero-mask pixel. */
/**
 * Seam tone match (2026-09-11, DWJ62316 on studio 97): the model's output runs a
 * touch darker than the plate, so the few-row blend under the protected head
 * showed as a hard horizontal line across the whole frame. When the mask is a
 * row band, measure the per-channel offset just below the boundary (neck, hair
 * and backdrop are the same picture in both) and fade it out over the next
 * rows, so the join is invisible while the garment keeps its own colour.
 * The offset is per column (smoothed over 2*radius px) because the drift
 * differs across the backdrop gradient.
 */
export function seamMatch(ref: ReferencePixels, candidate: Buffer, mask: Buffer, band = 24, fade = 192, radius = 48) {
  const { width: w, height: h } = ref;
  let boundary = -1;
  for (let y = 0; y < h; y++) {
    const a = mask[y * w];
    for (let x = 1; x < w; x++) if (mask[y * w + x] !== a) return; // not a row band
    if (a && boundary < 0) boundary = y;
  }
  if (boundary <= 0 || boundary + band > h) return;
  // Per-column offset over the band, then a wide horizontal box blur: the
  // drift differs left to right (backdrop gradient), but hair and skin must
  // not print their own detail into the correction.
  const col = new Float64Array(w * 3);
  for (let y = boundary; y < boundary + band; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    for (let c = 0; c < 3; c++) col[x * 3 + c] += (ref.data[i + c] - candidate[i + c]) / band;
  }
  const diff = new Float64Array(w * 3);
  for (let c = 0; c < 3; c++) {
    let sum = 0, n = 0;
    for (let x = 0; x < Math.min(w, radius); x++) { sum += col[x * 3 + c]; n++; }
    for (let x = 0; x < w; x++) {
      if (x + radius < w) { sum += col[(x + radius) * 3 + c]; n++; }
      if (x - radius - 1 >= 0) { sum -= col[(x - radius - 1) * 3 + c]; n--; }
      diff[x * 3 + c] = sum / n;
    }
  }
  let maxAbs = 0;
  for (let k = 0; k < diff.length; k++) maxAbs = Math.max(maxAbs, Math.abs(diff[k]));
  if (maxAbs < 0.25) return;
  const end = Math.min(h, boundary + fade);
  for (let y = boundary; y < end; y++) {
    const wgt = 1 - (y - boundary) / fade;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      for (let c = 0; c < 3; c++) candidate[i + c] = Math.max(0, Math.min(255, Math.round(candidate[i + c] + diff[x * 3 + c] * wgt)));
    }
  }
}

export async function compositeGarment(ref: ReferencePixels, generated: Buffer, mask: Buffer) {
  if (mask.length !== ref.width * ref.height) throw Error('Mask dimensions do not match the reference.');
  const meta = await sharp(generated).metadata();
  if (!meta.width || !meta.height || Math.abs(meta.width/meta.height - ref.width/ref.height) > 0.005)
    throw Error('Generated framing differs from the reference. No protected-pixel result was produced.');
  const candidate = await sharp(generated).rotate().resize(ref.width,ref.height,{fit:'fill'})
    .toColourspace('srgb').ensureAlpha().raw().toBuffer();
  seamMatch(ref, candidate, mask);
  const pixels = Buffer.from(ref.data);
  let protectedPixels = 0;
  for (let i=0;i<mask.length;i++) {
    const a=mask[i];
    if (!a) { protectedPixels++; continue; }
    for (let c=0;c<4;c++) pixels[i*4+c]=Math.round((ref.data[i*4+c]*(255-a)+candidate[i*4+c]*a)/255);
  }
  const png = await sharp(pixels,{raw:{width:ref.width,height:ref.height,channels:4}}).png().toBuffer();
  const decoded = await sharp(png).ensureAlpha().raw().toBuffer();
  const originalProtected = Buffer.alloc(protectedPixels*4), resultProtected = Buffer.alloc(protectedPixels*4);
  let j=0, changed=0;
  for(let i=0;i<mask.length;i++) if(mask[i]===0) {
    let different=false;
    for(let c=0;c<4;c++) { originalProtected[j]=ref.data[i*4+c];resultProtected[j]=decoded[i*4+c];if(originalProtected[j]!==resultProtected[j])different=true;j++; }
    if(different)changed++;
  }
  if(changed) throw Error('Protected-pixel verification failed. Output withheld.');
  return { png, report: { method:'garment-only' as const, verified:true, width:ref.width, height:ref.height,
    protectedPixels, changedProtectedPixels:changed, referenceSha256:ref.sha256,
    protectedSourceSha256:digest(originalProtected), protectedOutputSha256:digest(resultProtected),
    outputSha256:digest(png), maskSha256:digest(mask), generatedWidth:meta.width, generatedHeight:meta.height } };
}

/** fal edit mask: white = editable, black = protected. */
export async function providerMask(alpha: Buffer, width: number, height: number) {
  return sharp(alpha,{raw:{width,height,channels:1}}).png().toBuffer();
}

/** Reviewed DONUTS full reference: the entire head/hair stays above row 520. */
export function donutsFaceMask(ref: ReferencePixels, referencePath: string) {
  if(referencePath!=='/models/studio 103/full.png'||ref.width!==1024||ref.height!==1536||ref.sha256!=='3fc5f5b51716759caf409869405770a1ccbb9d8e0ca3a8024000d0804b3cd1b9')
    throw Error('Keep original face needs the reviewed DONUTS full-shot reference.');
  const mask=Buffer.alloc(ref.width*ref.height);
  for(let y=520;y<ref.height;y++)mask.fill(Math.min(255,Math.round((y-520)/32*255)),y*ref.width,(y+1)*ref.width);
  return mask;
}
