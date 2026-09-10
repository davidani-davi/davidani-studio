import { fal } from '@fal-ai/client';
import type { PresetView } from './models-registry';
import type { PlateFraming, ShotCategory } from './plate-framing';

export const NANO_REFERENCE_MODEL = 'nano-banana-pro';
export const NANO_REFERENCE_ENDPOINT = 'fal-ai/nano-banana-pro/edit';
export interface ReferenceShot {
  view: PresetView;
  referenceUrl: string;
  garmentImageUrls: string[];
  anchorImageUrl?: string;
  category: ShotCategory;
  framing: PlateFraming;
  color?: string;
  note?: string;
}

/** Approved DET67046 method: one edit for front; each later view is its sibling. */
export function buildReferenceShot(o: ReferenceShot) {
  if (!o.referenceUrl || !o.garmentImageUrls[0]) throw new Error('Model reference and original garment photo are required');
  if (o.view !== 'front' && !o.anchorImageUrl) throw new Error('Generate the front first, then use it for the remaining views');
  const later = o.view !== 'front';
  const back = o.view === 'back' && o.garmentImageUrls[1];
  const garment = back || o.garmentImageUrls[0];
  const scope = o.category === 'pants' || o.category === 'skirt' ? 'bottoms'
    : o.category === 'dress' || o.category === 'set' ? 'outfit' : 'top or outer layer';
  const framing = o.framing === 'full' ? 'Show the entire head and both shoes with small margins, natural body proportions and a soft contact shadow. Preserve existing footwear; if none is visible, use plain white low-top canvas sneakers.'
    : o.framing === 'low' ? 'Frame from waist to both shoes, showing the entire garment.'
    : 'Frame the entire head to mid-thigh, with the complete garment hem visible. Never shorten the garment to fit.';
  const continuity = 'Preserve the exact facial structure, head shape, hairstyle, skin, expression, body proportions, jewelry and all clothing outside the garment being replaced. Match the soft photographic focus, gentle skin finish, warm backdrop and lighting of image 1. Do not sharpen, enhance pores or add fabric grain. One natural catalog photograph.';
  const prompt = later
    ? `Image 1 is the finished front of this shoot. Preserve this exact person and outfit. Image 2 is the original model identity reference only; never copy its replaced garment. Image 3 shows the actual garment construction only; never copy that model or their styling. ${continuity} ${o.view === 'side' ? 'Turn the person and head 90 degrees to the camera, facing left in true side profile. Keep hair loose and arms relaxed.' : o.view === 'back' ? 'Photograph directly from behind, shoulders and hips square to camera, no face showing. Sweep hair forward over one shoulder to show the back of the garment. Arms relaxed.' : 'Widen the frame. Keep the front-facing head, expression and relaxed pose from image 1.'} ${framing} ${o.view === 'back' ? back ? 'Reproduce the back construction from image 3, keeping the color from image 1.' : 'No back photo is supplied. Use a simple continuation of the material; do not invent back graphics, logos, seams or closures.' : 'Preserve the garment color, length, fit, print and construction from image 1; image 3 supplies construction details.'}`
    : `Replace only the ${scope} in image 1 with the exact garment in image 2. Match its actual color, cut, neckline, sleeves, hem, print, distressing and construction. Keep the garment untucked when appropriate. Do not copy image 2 model identity, hair, pose or other clothing. ${continuity} ${framing}`;
  return {
    image_urls: later ? [o.anchorImageUrl!, o.referenceUrl, garment] : [o.referenceUrl, garment],
    prompt: `${prompt}${o.color ? ` Requested color: ${o.color}; the original garment photograph is the color authority.` : ''}${o.note ? ` Operator correction: ${o.note}` : ''}`,
    resolution: '1K' as const, aspect_ratio: '2:3' as const, output_format: 'png' as const, num_images: 1,
  };
}

export async function runReferenceShot(input: ReturnType<typeof buildReferenceShot>) {
  if (!process.env.FAL_KEY) throw new Error('FAL_KEY environment variable is missing');
  fal.config({ credentials: process.env.FAL_KEY });
  const result = await fal.subscribe(NANO_REFERENCE_ENDPOINT, { input, logs: false });
  const url = (result.data as { images?: { url: string }[] })?.images?.[0]?.url;
  if (!url) throw new Error('Nano Banana Pro returned no image');
  // Deliberately return the native image: no restore, sharpening or second AI pass.
  return { url, requestId: result.requestId };
}
