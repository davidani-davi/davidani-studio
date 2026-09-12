import type { ReferenceShot } from './nano-reference-shots';
import type { ReferencePixels } from './garment-only';
import presets from './simple-face-presets.json';

export const SIMPLE_IMAGE_SIZE = { width: 1024, height: 1536 };
export function simpleReferenceShot(o: ReferenceShot) {
  const garment = o.view === 'back' && o.garmentImageUrls[1] ? o.garmentImageUrls[1] : o.garmentImageUrls[0];
  if (!o.referenceUrl || !garment) throw Error('Choose a model reference and garment photo.');
  const scope = o.category === 'pants' || o.category === 'skirt' ? 'bottoms' : o.category === 'dress' || o.category === 'set' ? 'outfit' : 'top';
  const inferred = o.view === 'back' && !o.garmentImageUrls[1];
  // The set's approved FRONT render (2026-09-11, DET60277): side, back and
  // full each re-read the garment colour from the warehouse photo and landed
  // on three different browns, and the inferred back grew a second hem tier.
  // With the front as image 3 every later view matches one colour and one
  // construction. The front itself never gets one.
  const anchor = o.view !== 'front' && o.anchorImageUrl ? o.anchorImageUrl : '';
  const colour = anchor
    ? 'Image 3 is this same garment already rendered on the front view of this set: it is the authoritative colour, fabric and construction reference. Match image 3’s garment hue, saturation and midtone brightness exactly, overriding the lighting of image 2. Keep the garment one single layer with one hem, exactly as in image 3; do not add an under-layer or a second hemline.'
    : 'Image 2 is the sole garment-color reference: match its hue, saturation and midtone brightness exactly.';
  // A top is worn alone: the plate's own tee must not peek out at the
  // neckline, shoulders or hem (the oversized-poncho case).
  // No necklace under a new neckline (2026-09-11, DWJ62316 on studio 97): the
  // plate's chain and pendant were half-erased where the cardigan's crew band
  // now sits, leaving a ghost chain on the skin. Bottoms leave the neck alone.
  const neck = scope === 'bottoms' ? '' : " Remove any necklace, chain or pendant image 1 wears, so the neckline shows only her skin and the new garment; keep bracelets and rings.";
  const keep = (scope === 'top'
    ? "Keep image 1's exact pose, framing, background, lighting, bottoms and shoes. The new top is worn alone: remove any top or tee image 1 wears under it, so nothing shows at the neckline, shoulders or below the hem."
    : "Keep image 1's exact pose, framing, background, lighting and other clothing.") + neck;
  // The listing title names the cut (2026-09-11, DET60277 Oatmeal): an
  // oversized poncho swapped onto a plate wearing a boxy elbow-sleeve tee came
  // back as that tee, recoloured. The model edits image 1 in place, so the
  // garment's own silhouette has to be spelled out or the plate's wins.
  const name = String(o.garmentName || '').replace(/["\n\r]+/g, ' ').trim().slice(0, 120);
  const cut = name ? ` The garment is a "${name}": reproduce that cut, silhouette, sleeve length and hem exactly, not the shape of the ${scope} image 1 wears.` : '';
  const prompt = `Edit image 1 as the exact base photograph. Replace only the ${scope} with the garment in image 2. Match its fabric, cut, length, print and construction.${cut} ${colour} Allow natural fold shadows and highlights, but do not tint the garment to match image 1’s clothing or background. ${keep} Preserve the face, expression, head position and hairstyle unchanged. No sharpening, retouching or enhancement. One clean photograph of one person.${inferred ? ' No back garment photo is supplied; use a plain continuation of the fabric without invented rear graphics.' : ''}${o.note ? ` Requested change: ${o.note}` : ''}`;
  const image_urls = anchor ? [o.referenceUrl, garment, anchor] : [o.referenceUrl, garment];
  return {prompt, garmentImageUrls:[garment], image_urls, garmentBackInferred:inferred, anchored: Boolean(anchor)};
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
    // At least 48 rows of blend (2026-09-11): 8 read as a hard line on the phone,
    // and the plate's grain meets the model's smoother output over that band.
    const t=Math.min(1,(y-preset.protectedRows+1)/Math.max(48,preset.transitionRows));
    mask.fill(Math.round(255*t*t*(3-2*t)),y*ref.width,(y+1)*ref.width);
  }
  return mask;
}
