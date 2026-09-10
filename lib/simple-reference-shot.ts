import type { ReferenceShot } from './nano-reference-shots';
import type { ReferencePixels } from './garment-only';
import presets from './simple-face-presets.json';

export const SIMPLE_IMAGE_SIZE = { width: 1024, height: 1536 };
export function simpleReferenceShot(o: ReferenceShot) {
  const garment = o.view === 'back' && o.garmentImageUrls[1] ? o.garmentImageUrls[1] : o.garmentImageUrls[0];
  if (!o.referenceUrl || !garment) throw Error('Choose a model reference and garment photo.');
  const scope = o.category === 'pants' || o.category === 'skirt' ? 'bottoms' : o.category === 'dress' || o.category === 'set' ? 'outfit' : 'top';
  const inferred = o.view === 'back' && !o.garmentImageUrls[1];
  const prompt = `Edit image 1 as the exact base photograph. Replace only the ${scope} with the garment in image 2. Match its fabric, cut, length, print and construction. Image 2 is the sole garment-color reference: match its hue, saturation and midtone brightness exactly. Allow natural fold shadows and highlights, but do not tint the garment to match image 1’s clothing or background. Keep image 1's exact pose, framing, background, lighting and other clothing. Preserve the face, expression, head position and hairstyle unchanged. No sharpening, retouching or enhancement. One clean photograph of one person.${inferred ? ' No back garment photo is supplied; use a plain continuation of the fabric without invented rear graphics.' : ''}${o.note ? ` Requested change: ${o.note}` : ''}`;
  return {prompt, garmentImageUrls:[garment], image_urls:[o.referenceUrl,garment], garmentBackInferred:inferred};
}

/** Reviewed original pixels only; no face detector or second AI pass. */
export function simpleFaceMask(ref: ReferencePixels, publicPath: string, view: string, framing: string, reviewed?: import('./model-admin').FaceProtection): Buffer | undefined {
  if (!reviewed && (framing === 'low' || view === 'back')) return undefined;
  const preset = reviewed || presets[publicPath.split('?')[0] as keyof typeof presets];
  if (!preset) throw Error('This reference has no reviewed face protection yet. Choose an installed reference or Previous workflow.');
  if (ref.width !== preset.width || ref.height !== preset.height || ref.sha256 !== preset.sha256)
    throw Error('The model reference changed. Its face protection must be reviewed before generating.');
  const mask=Buffer.alloc(ref.width*ref.height);
  for(let y=preset.protectedRows;y<ref.height;y++) {
    const t=Math.min(1,(y-preset.protectedRows+1)/preset.transitionRows);
    mask.fill(Math.round(255*t*t*(3-2*t)),y*ref.width,(y+1)*ref.width);
  }
  return mask;
}
