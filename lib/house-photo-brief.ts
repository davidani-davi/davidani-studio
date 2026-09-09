import type { KnownGarment } from './garment-contract';
import type { PresetView } from './models-registry';
import type { PlateFraming } from './plate-framing';
import { bodyRegionFor } from './gpt-variants';
import { PLAIN_BACK_RULE, BACK_REFERENCE_RULE } from './multi-model-prompt';

export const HOUSE_PHOTO_FINISH = 'reference-photo-v1';
export function usesHousePhotoBrief(modelId: string, humanModelId: string, variant: string): boolean {
  return modelId === 'gpt-image-25' && /^(?:studio|crop|low) (97|98|99|100)$/.test(humanModelId) && variant === 'native4k';
}

/** Product photos carry construction; model photos carry the photographic finish.
 * Avoid the repeated editorial/detail prose and synthesized face descriptions
 * that made the editor rebuild surfaces instead of preserving the photograph.
 */
export function housePhotoBrief(o: {
  known: KnownGarment; garment: string; category: string; view: PresetView;
  framing: PlateFraming; hasBackPhoto: boolean; hasAnchor: boolean; hasFace: boolean;
  styling?: string; note?: string;
}): string {
  const item = o.known.title?.trim() || o.garment.trim() || 'garment';
  // Faire option labels can include a size pack. It is not a second color.
  const color = o.known.color?.replace(/\s*\/\s*(?:S-M-L|1XL-2XL-3XL|XL-1XL-2XL)\s*\([^)]*\)\s*$/i, '').trim();
  const change = o.hasAnchor
    ? 'Photo 1 is the finished front from this same shoot. Keep this exact woman and outfit; change only the viewing angle and framing requested below.'
    : `Edit photo 1, replacing only ${bodyRegionFor(o.category)} with the exact garment shown in photo 2.`;
  const person = o.view === 'front'
    ? 'Preserve the woman’s face, hair, exposed skin, expression, hands, jewellery, pose, lighting, background and framing from photo 1.'
    : 'Preserve the woman’s identity, facial proportions, hair, skin tone, body proportions, jewellery, lighting and background from photo 1.';
  const view = o.view === 'side' ? 'Turn her into a true side profile, wearing the same outfit.'
    : o.view === 'back' ? 'Turn her fully away from the camera; no face or over-the-shoulder glance.'
    : o.view === 'full' ? 'Show the same woman and outfit head to toe, including her feet, with natural body proportions.' : '';
  const frame = o.view === 'front' ? '' : o.framing === 'low' ? 'Frame from natural waist to shoes; head and chest outside the frame.'
    : o.framing === 'crop' ? 'Frame head to mid-thigh with the whole garment visible.' : 'Frame the entire figure from head to shoes.';
  return [change, person,
    'Photo 2 supplies only the replacement garment.',
    o.hasBackPhoto ? 'Photo 3 is the back of that same garment.' : '',
    `Product: ${item}.${color ? ` Color: ${color}.` : ''}${o.known.fabric?.trim() ? ` Fabric: ${o.known.fabric.trim()}.` : ''}`,
    'Match the product photo’s actual print placement and scale, seams, closures, neckline, sleeve length, loose or fitted cut, and hem length. Keep its actual print edges and seams legible. Do not borrow fabric or garment details from the old outfit.',
    o.styling ? `Styling: ${o.styling}` : 'Keep clothing outside the replacement area unchanged.',
    view, frame,
    o.view === 'back' ? (o.hasBackPhoto ? BACK_REFERENCE_RULE : PLAIN_BACK_RULE) : '',
    o.hasAnchor ? 'Match the finished front’s fit, color, fabric finish and outfit. Keep asymmetric details on the same side of her body when she turns.' : '',
    o.hasFace ? 'The last image is a close crop of her face for identity only; it does not control framing or texture scale.' : '',
    'Match the gentle tonal transitions and understated photographic finish of photo 1 across skin and clothing. Ordinary soft studio light, naturally matte skin, subtle fabric detail at normal viewing distance. No added grain, clarity, sharpening, embossed pores or enhanced textile texture. Do not reinterpret or enhance the person. One continuous photograph.',
    o.note ? `Correction for this view: ${o.note}` : '',
  ].filter(Boolean).join(' ');
}
