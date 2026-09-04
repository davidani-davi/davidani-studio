import type { PresetView } from "./models-registry";

/**
 * The four-view photoshoot: which views, how each one is asked for, and how a
 * front/back pair is reconciled into one garment identity.
 *
 * Extracted from ModelStudioClient when the Faire extension needed the same
 * four shots without a browser tab open on the studio. There is exactly one
 * copy on purpose — these are the sentences that keep four renders looking
 * like one garment on one person, and a second copy in an API route would
 * drift from the studio the day either was edited.
 */

export const MULTI_MODEL_VIEWS: PresetView[] = ["front", "side", "back", "full"];
// How many views generate concurrently in a Multi Model run. 4 = all views
// at once; the old 4-at-once provider timeouts were on the previous fal
// backend, and kie's async task API tolerates it. If timeout retries show
// up in the [timing] console logs, drop back to 2.
export const MULTI_MODEL_WORKERS = 4;

export function multiModelPoseVariantIndex(view: PresetView): number {
  // The primary Kylie back canvas is an over-shoulder pose that exposes the
  // face, which encourages Nano Banana to generate a 3/4 "back" result. The
  // first numbered back alternate is the straight rear pose when available;
  // models without that alternate safely fall back on the server.
  return view === "back" ? 1 : 0;
}

export function buildMultiModelViewSuffix(view: PresetView, hasBackReference: boolean): string {
  const label = view === "full" ? "full-body complete outfit" : view;
  return (
    ` Multi Model Studio directive: generate the ${label} view only. ` +
    `This run is part of one four-view ecommerce photoshoot set: front, side, back, and full. ` +
    `Keep the exact same model identity, face, body proportions, lighting, warm beige studio background, camera quality, garment color, construction, trims, texture, and styling continuity across the set. ` +
    (hasBackReference
      ? "Combined garment contract: the first garment reference and second garment reference together define one exact SKU. The first image supplies the front-facing truth; the second image supplies the back-facing truth. Merge both references into one physical garment identity, not two garments, not two design options, and not inspiration images. "
      : "") +
    (view === "back" && hasBackReference
      ? "For this back view, use the second uploaded garment image as the back-reference source of truth for back artwork, seams, pockets, hem shape, wash, construction, and trim placement. The model must face away from camera in a true rear view: show the back of the head, shoulders, torso, sleeves, and garment back. Do not show the model's face, do not use an over-the-shoulder glance, and do not rotate into a 3/4 back pose. "
      : view === "back"
      ? "For this back view, infer the back logically from the front garment image while preserving the same garment category, fabric, construction, trims, and realistic production details. The model must face away from camera in a true rear view; do not show the model's face or an over-the-shoulder glance. "
      : view === "side" && hasBackReference
      ? "For this side view, bridge the uploaded front and back references into one continuous garment: front details should wrap naturally toward the side, back details should only appear where they would truly be visible from the side, and no new alternate garment design should appear. "
      : view === "full" && hasBackReference
      ? "For this full-body view, use the uploaded front and back references together as continuity anchors so the garment reads as the same SKU already shown in the front, side, and back outputs. "
      : "") +
    `Do not generate variants, do not create a collage, and do not change the selected view into another angle.`
  );
}

export function buildMultiModelConsistencySuffix(garment: string, features: string): string {
  const cleanGarment = garment.trim();
  const cleanFeatures = features.trim();
  const garmentLine = cleanGarment
    ? `Combined garment identity contract for this four-view set: ${cleanGarment}. `
    : "Combined garment identity contract for this four-view set: use the uploaded front and back product images together as the single source of truth. ";
  const featureLine = cleanFeatures
    ? `The same physical SKU must keep the combined front/back feature map in every angle: ${cleanFeatures}. `
    : "The same physical SKU must keep the exact same silhouette, fabric, color, seams, trims, pockets, hardware, hem, and construction in every angle. ";
  return (
    ` ${garmentLine}${featureLine}` +
    "The front and back uploads are paired evidence for the same garment and must be reconciled into one complete product map before generating any angle. " +
    "All four outputs must look like one real garment photographed from front, side, back, and full-body angles, not four related garments, not four colorways, and not four reinterpretations. " +
    "Keep the same garment length, volume, fit, fabric texture, color, construction logic, pocket size and placement, closure type, cuff/hem behavior, graphics, and trim placement across the set. " +
    "ALL-OVER PATTERN RULE: if the garment reference shows a scattered, all-over, or repeat graphic/patch/print that covers the full body surface (chest, torso, sleeves), reproduce that pattern across ALL those areas in every view — do not simplify to sleeve-only or partial placement. The pattern density and surface coverage must match the reference exactly. " +
    "Only reveal angle-specific information that would naturally be visible from that view."
  );
}

export function mergeMultiModelGarmentIdentity(
  frontData: any,
  backData?: any
): { garment: string; features: string } {
  const frontGarment = String(frontData?.garment || "").trim();
  const frontFeatures = String(frontData?.features || "").trim();
  const backGarment = String(backData?.garment || "").trim();
  const backFeatures = String(backData?.features || "").trim();
  const garment = frontGarment || backGarment;
  const features = [
    frontFeatures ? `Front-facing source of truth: ${frontFeatures}` : "",
    backFeatures ? `Back-facing source of truth: ${backFeatures}` : "",
  ]
    .filter(Boolean)
    .join(". ");
  return { garment, features: features || frontFeatures || backFeatures };
}
