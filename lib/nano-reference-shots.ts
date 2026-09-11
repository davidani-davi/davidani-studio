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
  /** The listing title we approved (KnownGarment.title), e.g. "Oversized Sweater Poncho". */
  garmentName?: string;
  category: ShotCategory;
  framing: PlateFraming;
  color?: string;
  note?: string;
}

/** Every output is one independent edit of its matching pose reference. */
export function buildReferenceShot(o: ReferenceShot) {
  if (!o.referenceUrl || !o.garmentImageUrls[0]) throw new Error('Model reference and original garment photo are required');
  const bottoms = o.category === 'pants' || o.category === 'skirt';
  const scope = bottoms ? 'bottoms' : o.category === 'dress' || o.category === 'set' ? 'outfit' : 'top or outer layer';
  const framing = o.framing === 'low'
    ? 'Frame from waist to both shoes. No head, shoulders or chest in the frame. Show the entire waistband, both hems and both shoes.'
    : o.framing === 'full'
    ? 'Show one complete person from the top of the head to both shoes, with small margins. Keep natural body proportions.'
    : 'Frame the entire head to mid-thigh with the complete garment hem visible. Never shorten the garment to fit.';
  const pose = o.view === 'side' ? 'True side profile, hips and shoulders turned 90 degrees, matching image 1.'
    : o.view === 'back' ? 'Straight rear view, shoulders and hips facing away, no face visible, matching image 1.'
    : 'Front-facing view, matching the pose in image 1.';
  const back = o.garmentImageUrls.length > 1;
  const prompt = `Image 1 is the ${o.view} pose and styling reference. Replace only the ${scope} in image 1 with the garment from image 2 (original front photograph). ${back ? 'Image 3 is the actual back garment photograph; use it for rear construction and back print placement.' : 'No back photo is supplied. Unseen details are inferred: use a plain continuation of the material without invented rear graphics or decorative details.'}
The original garment photos determine color, fit, length, fabric, print placement, seams and construction. Never transfer the reference outfit print onto the replacement garment. Do not copy the garment-photo wearer or their other clothing.
${bottoms ? 'PANTS-ONLY SWAP: keep the existing top, sleeves, torso, arms and footwear from image 1. In the full shot the reference top remains worn normally above the waistband. Never remove the top or extend pants over the torso.' : 'Preserve all clothing outside the replaced garment and preserve footwear. Remove any necklace, chain or pendant from image 1 so the neckline shows only skin and the new garment; keep bracelets and rings.'}
${pose} ${framing}
Preserve the reference identity, face, head shape, hairstyle, expression and natural proportions wherever visible. Match image 1 lighting, background color and soft photographic detail. One continuous photograph, one person; no collage, split screen, duplicate person, inset or detached body parts. Do not sharpen, enhance pores or add fabric grain.
${o.color ? `Requested color: ${o.color}; original garment photography is the color authority.` : ''}${o.note ? ` Operator correction for the replacement garment: ${o.note}` : ''}`;
  return { image_urls: [o.referenceUrl, ...o.garmentImageUrls.slice(0,2)], prompt,
    resolution: '1K' as const, aspect_ratio: '2:3' as const, output_format: 'png' as const, num_images: 1 };
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
