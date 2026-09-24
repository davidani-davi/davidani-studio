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
  // Open-front layers (2026-09-24, DWJ50270 on Celine): "the new top is worn
  // alone" stripped the plate's tee and left an open cardigan over a bare
  // chest, a shot no buyer can use. The product photo for that style is
  // itself bare under the cardigan, so "copy image 2" cannot decide it: an
  // inner top is styling, not construction. Open-front tops and outerwear
  // always get a plain inner layer (image 2's, when it shows one), never
  // image 1's own top; an operator note about the layer wins.
  const openFront = scope === 'top' && /\b(cardigans?|kimonos?|dusters?|shrugs?|boleros?|open[- ]front|blazers?|jackets?|shackets?|coats?|overshirts?|vests?)\b/i.test(String(o.garmentName || ''))
    && !/\b(under-?layer|inner (top|layer)|tank|cami|camisole|bralette|tee|bare (chest|skin)|no top)\b/i.test(o.note || '');
  // Conditional wording lost to a bare product photo on the first live check
  // (DWJ50270 still came back bare), so garments that are always worn open
  // state the tank as a fact, early; jackets that may be buttoned keep the
  // condition so a closed shacket gains nothing (checked on DJ69018).
  const alwaysOpen = openFront && /\b(cardigans?|kimonos?|dusters?|shrugs?|boleros?|open[- ]front)\b/i.test(String(o.garmentName || ''));
  const layer = "The inner top is styling, not part of the product: never image 1's own top, never merged into the garment, never shown below or past the garment's own sleeves (no undersleeves at the arms or wrists), and it never changes the garment's sleeve length. Bare skin in image 2 is a styling choice, not part of the product: do not reproduce a bare chest.";
  const inner = !openFront ? '' : alwaysOpen
    ? ` INNER LAYER: She wears a plain white fitted tank top under the open garment, clearly visible in the open front and covering her chest from a scoop neckline down to the waist; if image 2 shows a coloured inner top, use that colour instead. No print, logo or text on it. ${layer}`
    : ` INNER LAYER: If this garment is worn open or unbuttoned so the chest or neckline shows, she wears a plain white fitted tank top under it (or the inner top image 2 shows, same colour and neckline, no print, logo or text). ${layer}`;
  const anchor = o.view !== 'front' && o.anchorImageUrl ? o.anchorImageUrl : '';
  const colour = anchor
    ? 'Image 3 is this same garment already rendered on the front view of this set: use it for consistent garment body colour and lighting, but image 2 remains the authority for construction and small details. Match image 3’s garment hue, saturation and midtone brightness exactly, overriding the lighting of image 2. Keep the garment one single layer with one hem, as shown in the product photograph; do not add an under-layer or a second hemline' + (openFront ? ' to the garment itself; the plain inner top described under INNER LAYER stays, matching image 3.' : '.')
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
  const setScope = o.category === 'set' ? " Replace BOTH pieces of image 1's outfit: its top AND its bottoms. Image 1's shorts, trousers, skirt, exposed legs and garment hems are not a template for the new set. Preserve only the wearer, pose, background and footwear outside the replacement outfit." : '';
  const legs = o.category === 'set' || scope === 'bottoms' ? " TROUSER CONSTRUCTION: Determine the bottom garment type and leg length independently from the top, using the product photograph in image 2. If the product has long pants, reproduce long pants with the same wide/straight/tapered leg and actual hem position, even when image 1 wears shorts. Cover the previously bare legs as needed without changing the underlying leg pose. Never turn long pants into shorts or place their hem or hem trim at the reference shorts' edge. In a thigh-cropped photograph, long pant legs continue out of the bottom of the frame: do not invent a visible hem, ankle trim, knee or bare thigh to fit the crop. In a full-body photograph show both real pant hems at the source length. Preserve genuine shorts or cropped trousers when the product shows them; do not infer the bottom length from a cropped top or the selected model's clothes. Apply the same bottom construction to side and inferred back views. An approved front is not allowed to override product leg length." : '';
  const keep = (scope === 'top'
    ? `Keep image 1's exact pose, framing, background, lighting, bottoms and shoes. ${openFront ? "Remove any top or tee image 1 wears, so none of image 1's clothing shows at the neckline, shoulders, cuffs or below the hem; the only thing under the new garment is the inner top described under INNER LAYER." : 'The new top is worn alone: remove any top or tee image 1 wears under it, so nothing shows at the neckline, shoulders, cuffs or below the hem.'}${noGhost}`
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
  const sleeves = scope === 'bottoms' ? '' : " SLEEVE CONSTRUCTION: Image 1 supplies only the wearer and pose, never the replacement garment's sleeve shape or exposed-arm coverage. Determine sleeve length from the product photograph in image 2 even when no garment title is supplied. If it shows long sleeves, render full-length sleeves down to the wrists in every view, with cuffs at the wrists; do not shorten them to elbow or three-quarter length, push them up, or retain image 1's bare forearms. Preserve the source sleeve volume, drop shoulder and cuff construction. If the source is short-sleeved or sleeveless, preserve that instead. Replacing a sleeve may cover skin that was exposed in image 1; keep the underlying arm and hand pose. An inferred back keeps the same sleeve length and cuffs as the supplied front.";
  const fit = scope === 'bottoms' ? '' : " GARMENT EASE: Transfer the product photograph's chest width, body ease, shoulder placement, armhole depth, sleeve fullness and hem width relative to its wearer. The outline of image 1's old top is not an edit boundary: let the new garment extend beyond it into the background when needed. A relaxed or boxy product hangs away from the waist; do not taper it to match a fitted reference top. Preserve fitted products as fitted, without adding volume. Cropped describes length, not a tight fit. Keep the underlying body and hand pose, allowing fabric to drape naturally around the arms rather than pulling the body panel tight. Preserve the size and spacing of cable and pointelle motifs and visible button count; do not compress or stretch the knit pattern to fit the old top's outline.";
  const details = "Preserve every visible contrast stitch, thread color, seam row, trim and binding from image 2, especially around the neckline, shoulders, cuffs and hem. Keep their placement, width and contrast against the fabric; never replace contrasting thread with fabric-colored stitching. Removing styling layers or jewelry must not remove garment stitching. If image 3 omits a product detail visible in image 2, restore the detail from image 2 instead of copying that omission.";
  const prompt = `Edit image 1 as the exact base photograph. Replace only the ${scope} with the garment in image 2. Match its fabric, cut, length, print and construction.${inner} ${details}${fit}${sleeves}${setScope}${legs}${cut} ${colour} Allow natural fold shadows and highlights, but do not tint the garment to match image 1’s clothing or background. ${keep} Preserve the face, expression, head position and hairstyle unchanged. No sharpening, retouching or enhancement. One clean photograph of one person.${inferred ? ' No back garment photo is supplied; use a plain continuation of the fabric without invented rear graphics.' : ''}${o.note ? ` Requested change: ${o.note}` : ''}`;
  const image_urls = anchor ? [o.referenceUrl, garment, anchor] : [o.referenceUrl, garment];
  return {prompt, openFront, garmentImageUrls:anchor ? [garment, anchor] : [garment], image_urls, garmentBackInferred:inferred, anchored: Boolean(anchor)};
}

/** Exact source-bound review. Never fall back to horizontal head restoration. */
export const isReviewedContour = (publicPath: string) => Object.prototype.hasOwnProperty.call(contourPresets, publicPath.split('?')[0]);

export function simpleFaceMask(ref: ReferencePixels, publicPath: string, _view: string, _framing: string, _legacyReview?: import('./model-admin').FaceProtection, auto?: import('./model-admin-core').AutoContour): Buffer | undefined {
  const reviewed = (contourPresets as Record<string, {kind:string;width:number;height:number;sha256:string}>)[publicPath.split('?')[0]];
  // A Listing Team draft set has no reviewed contour yet; it carries the outline found when it was saved.
  const preset = reviewed || (auto?.source === 'auto-draft-v1' ? auto : undefined);
  if (!preset) throw Error('This reference needs a face/hair contour review before Simple garment swap. Choose a reviewed reference.');
  if (ref.width !== preset.width || ref.height !== preset.height || ref.sha256 !== preset.sha256)
    throw Error('The model reference changed. Its face/hair contour must be reviewed before generating.');
  if (preset.kind === 'no-head') return undefined;
  return contourFaceMask(ref, preset as ReviewedFaceContour & {kind:string});
}
