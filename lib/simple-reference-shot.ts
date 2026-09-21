import type { ReferenceShot } from './nano-reference-shots';
import type { ReferencePixels } from './garment-only';
import { lengthFor } from './garment-contract';
import contourPresets from './simple-contour-presets.json';
import {contourFaceMask, type ReviewedFaceContour} from './contour-face-mask';

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
    ? 'Image 3 is this same garment already rendered on the front view of this set: use it for consistent garment body colour and lighting, but image 2 remains the authority for construction and small details. Match image 3’s garment hue, saturation and midtone brightness exactly, overriding the lighting of image 2. Keep the garment one single layer with one hem, as shown in the product photograph; do not add an under-layer or a second hemline.'
    : 'Image 2 is the sole garment-color reference: match its hue, saturation and midtone brightness exactly.';
  // A top is worn alone: the plate's own tee must not peek out at the
  // neckline, shoulders or hem (the oversized-poncho case).
  // No necklace under a new neckline (2026-09-11, DWJ62316 on studio 97): the
  // plate's chain and pendant were half-erased where the cardigan's crew band
  // now sits, leaving a ghost chain on the skin. Bottoms leave the neck alone.
  const neck = scope === 'bottoms' ? '' : " Remove any necklace, chain or pendant image 1 wears, so the neckline shows only her skin and the new garment; keep bracelets and rings.";
  // Same half-erased failure, at the shoulder instead of the neck (DJ60404,
  // 2026-09-12): a faint translucent patch of the plate's original collar
  // survived under the new jacket's shoulder, a partial removal rather than
  // a clean one. "Remove" alone left room for a model to blend instead of
  // delete; naming the failure directly (no ghosting, no double exposure)
  // gives it something concrete to avoid.
  // Same failure recurred at the cuff (still DJ60404, still this exact
  // render): a different print — the plate's own sleeve — showed through at
  // the wrist. "Neckline, shoulders or below the hem" never named cuffs, so
  // the model had no reason to check there. Naming every seam the old top
  // could still be hiding behind, not just the ones caught so far.
  const noGhost = scope === 'top' ? ' The removed layer must be completely gone, not blended or faded beneath the new garment — no ghosting, no translucent patches, no doubled collar, cuff or fabric anywhere on the body, including at the wrists and sleeve ends.' : '';
  const keep = (scope === 'top'
    ? `Keep image 1's exact pose, framing, background, lighting, bottoms and shoes. The new top is worn alone: remove any top or tee image 1 wears under it, so nothing shows at the neckline, shoulders, cuffs or below the hem.${noGhost}`
    : "Keep image 1's exact pose, framing, background, lighting and other clothing.") + neck;
  // The listing title names the cut (2026-09-11, DET60277 Oatmeal): an
  // oversized poncho swapped onto a plate wearing a boxy elbow-sleeve tee came
  // back as that tee, recoloured. The model edits image 1 in place, so the
  // garment's own silhouette has to be spelled out or the plate's wins.
  const name = String(o.garmentName || '').replace(/["\n\r]+/g, ' ').trim().slice(0, 120);
  // Length: DJ60404 (a "Tapestry Floral Cotton Twill Shirt Jacket" swapped via
  // this exact path) came back with the hem stretched past hip to mid-thigh
  // even though the prompt already said "reproduce ... hem exactly" — telling
  // an edit model to copy an unstated hem from a photo it is also asked to
  // reinterpret isn't an anchor on its own. The source of truth is always
  // image 2, the actual garment product photograph — never image 1, which is
  // only a pose/body/background reference and whose own original garment's
  // proportions must not leak into the new one. lengthFor's adjective
  // (lib/garment-contract.ts — hip-length for an unlabeled shirt
  // jacket/shacket, knee-length for an unlabeled coat) is a named checkpoint
  // that reinforces what image 2 already shows for the common cases; it is
  // stated as "typically", not as a fact overriding the photo, so a style
  // whose real photo disagrees (a longer coat, an exception cut) still reads
  // correctly, and an operator note asking for a different length is never
  // fighting a hard "do not extend" rule.
  const length = name ? lengthFor({ title: o.garmentName }) : null;
  // A note is the operator overriding a specific run; don't have the default
  // length checkpoint argue with an explicit correction they just typed.
  const noteOverridesLength = /\b(hem|length|longer|shorter|crop|cropped|knee|thigh|calf|ankle|floor|waist)\b/i.test(o.note || '');
  const hem = length && !noteOverridesLength
    ? ` As a checkpoint, a "${name}" like this is typically ${length.adj} (${length.hem}) — but image 2's own proportions decide the actual hem, not this checkpoint and not image 1.`
    : '';
  const cut = name ? ` The garment is a "${name}": reproduce that cut, silhouette, sleeve length and hem exactly as shown in image 2, the actual garment photograph — image 2 alone decides where the hem falls, never the shape, length or proportions of the ${scope} image 1 wears.${hem}` : '';
  const details = "Preserve every visible contrast stitch, thread color, seam row, trim and binding from image 2, especially around the neckline, shoulders, cuffs and hem. Keep their placement, width and contrast against the fabric; never replace contrasting thread with fabric-colored stitching. Removing styling layers or jewelry must not remove garment stitching. If image 3 omits a product detail visible in image 2, restore the detail from image 2 instead of copying that omission.";
  const prompt = `Edit image 1 as the exact base photograph. Replace only the ${scope} with the garment in image 2. Match its fabric, cut, length, print and construction. ${details}${cut} ${colour} Allow natural fold shadows and highlights, but do not tint the garment to match image 1’s clothing or background. ${keep} Preserve the face, expression, head position and hairstyle unchanged. No sharpening, retouching or enhancement. One clean photograph of one person.${inferred ? ' No back garment photo is supplied; use a plain continuation of the fabric without invented rear graphics.' : ''}${o.note ? ` Requested change: ${o.note}` : ''}`;
  const image_urls = anchor ? [o.referenceUrl, garment, anchor] : [o.referenceUrl, garment];
  return {prompt, garmentImageUrls:[garment], image_urls, garmentBackInferred:inferred, anchored: Boolean(anchor)};
}

/** Exact source-bound review. Never fall back to horizontal head restoration. */
export function simpleFaceMask(ref: ReferencePixels, publicPath: string, _view: string, _framing: string, _legacyReview?: import('./model-admin').FaceProtection): Buffer | undefined {
  const preset = (contourPresets as Record<string, {kind:string;width:number;height:number;sha256:string}>)[publicPath.split('?')[0]];
  if (!preset) throw Error('This reference needs a face/hair contour review before Simple garment swap. Choose a reviewed reference.');
  if (ref.width !== preset.width || ref.height !== preset.height || ref.sha256 !== preset.sha256)
    throw Error('The model reference changed. Its face/hair contour must be reviewed before generating.');
  if (preset.kind === 'no-head') return undefined;
  return contourFaceMask(ref, preset as ReviewedFaceContour & {kind:string});
}
