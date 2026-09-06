import type { PresetView } from "./models-registry";
import type { PlateFraming } from "./plate-framing";

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

const COUNT_WORD = ["zero", "one", "two", "three", "four", "five", "six"];
function countWord(n: number): string {
  return COUNT_WORD[n] || String(n);
}
function listViews(views: PresetView[]): string {
  if (views.length <= 1) return views.join("");
  if (views.length === 2) return `${views[0]} and ${views[1]}`;
  return `${views.slice(0, -1).join(", ")}, and ${views[views.length - 1]}`;
}

/**
 * The plate decides the framing (lib/plate-framing.ts); this sentence stops the
 * generator from "helpfully" zooming back out to a full-length figure when the
 * reference plate is a head-to-thigh or waist-down crop.
 */
const FRAMING_RULE: Record<PlateFraming, string> = {
  full: "FRAMING RULE: a full-length figure from head to shoes, framed exactly like the reference plate. ",
  crop:
    "FRAMING RULE: match the reference plate's crop exactly: a head-to-mid-thigh product shot, the top of the head near the top edge of the frame, the frame ending at mid-thigh, the garment filling the frame. Do not zoom out to a full-length figure, do not add knees, legs, or shoes below the frame edge, do not add headroom. ",
  low:
    "FRAMING RULE: match the reference plate's crop exactly: framed from the natural waist down to the shoes, with the head, shoulders, and chest outside the frame. Do not add a head or an upper body, do not zoom out to a full-length figure; the garment fills the frame with the shoes at the bottom edge. ",
};

export interface ViewSuffixOptions {
  /** How the reference plate is framed; "full" unless the category says otherwise. */
  framing?: PlateFraming;
  /** The views this run shoots; bottoms shoot three, everything else four. */
  views?: PresetView[];
  /** What the model wears below the garment, when the plate's own legs would show (stylingFor). */
  styling?: string;
}

/**
 * A long layer — a longline coat, a duster cardigan — has its hem in every
 * frame, and under it the plate's own trousers show. Those differ from view
 * to view (the side, back and full plates are generated from the front one,
 * each with its own invented bottoms), so the set reads as three outfits.
 * One plain house styling under every long layer keeps the four views one
 * shoot and lets the garment do the selling.
 */
export const LONG_LAYER_STYLING =
  "below the garment's hem the model wears plain black straight-leg trousers and plain black ankle boots — the same trousers and boots in every view of this set. Replace whatever the base image wears below the waist with them; none of the base image's trousers, skirt, shoes, or bare legs may show.";

export function stylingFor(category: string | null | undefined, hem: string | null | undefined): string {
  const c = String(category || "").toLowerCase();
  return (c === "top" || c === "outerwear") && String(hem || "").toLowerCase() === "long" ? LONG_LAYER_STYLING : "";
}

/** What a plate wears below the waist or on the feet, as the analyzer names it in the keep-list. */
const PLATE_BOTTOMS_RE =
  /\b(trousers?|pants?|jeans|denim|skirts?|shorts|leggings?|culottes?|joggers?|chinos?|slacks|shoes?|boots?|loafers?|sneakers?|heels|sandals?|mules|footwear|feet|foot|barefoot|legs?|socks?|hosiery|tights)\b/i;

/**
 * Put the styling INSIDE the analyzer's base prompt, because that is the only
 * part the GPT editor sees: optimizeForGptImage strips from "Negative
 * prompt:" to the end of the string, and every multi-view suffix (framing,
 * scale, styling) is appended after that marker. The base prompt also lists
 * the plate's own trousers and shoes among the things to keep "completely
 * unchanged"; those items go, and the styling follows the keep-list so it
 * reads as the one wardrobe edit below the hem. Without a keep-list it lands
 * just before the negative prompt, or at the end.
 */
export function applyStyling(basePrompt: string, styling: string): string {
  const s = String(styling || "").trim();
  const p = String(basePrompt || "");
  if (!s) return p;
  const line = `STYLING: ${s}`;
  const inKeepList = p.replace(/and background \(([^)]*)\) completely unchanged;/, (_m, list: string) => {
    const kept = list.split(/,\s*/).filter((item) => !PLATE_BOTTOMS_RE.test(item));
    return `and background (${kept.join(", ")}) completely unchanged; ${line}`;
  });
  if (inKeepList !== p) return inKeepList;
  const neg = p.search(/\s*Negative prompt:/i);
  return neg >= 0 ? `${p.slice(0, neg)} ${line}${p.slice(neg)}` : `${p.trim()} ${line}`;
}

export function buildMultiModelViewSuffix(
  view: PresetView,
  hasBackReference: boolean,
  opts: ViewSuffixOptions = {}
): string {
  const views = opts.views && opts.views.length ? opts.views : MULTI_MODEL_VIEWS;
  const framing: PlateFraming = opts.framing || "full";
  const label = view === "full" ? "full-body complete outfit" : view;
  return (
    ` Multi Model Studio directive: generate the ${label} view only. ` +
    `This run is part of one ${countWord(views.length)}-view ecommerce photoshoot set: ${listViews(views)}. ` +
    `Keep the exact same model identity, face, body proportions, lighting, warm beige studio background, camera quality, garment color, construction, trims, texture, and styling continuity across the set. ` +
    FRAMING_RULE[framing] +
    (opts.styling ? `STYLING RULE: ${opts.styling} ` : "") +
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

/**
 * The operator's note on a Redo ("zip-front stand collar, no lapels"), as one
 * clean line: no control characters, 300 characters at most, or nothing.
 */
export function sanitizeOperatorNote(note: unknown): string {
  return String(note ?? "")
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300);
}

/**
 * One view came back wrong while the others were approved. The person who
 * approved them says what is wrong; that sentence outranks the vision read,
 * because it is the only input here that has actually seen the garment.
 */
export function buildOperatorNoteSuffix(note: unknown, view: PresetView): string {
  const clean = sanitizeOperatorNote(note);
  if (!clean) return "";
  return (
    ` OPERATOR CORRECTION for this ${view} view, from the person who approved the other views of this set: ${clean}. ` +
    "This correction is the truth about the garment and overrides any conflicting reading of the garment photographs or of the reference plate. " +
    "Change only what the correction names; keep the model, framing, garment color, fabric, and every other detail exactly as in the approved views."
  );
}

export function buildMultiModelConsistencySuffix(
  garment: string,
  features: string,
  views: PresetView[] = MULTI_MODEL_VIEWS
): string {
  const cleanGarment = garment.trim();
  const cleanFeatures = features.trim();
  const n = countWord(views.length);
  const angles = listViews(views.map((v) => (v === "full" ? ("full-body" as PresetView) : v)));
  const garmentLine = cleanGarment
    ? `Combined garment identity contract for this ${n}-view set: ${cleanGarment}. `
    : `Combined garment identity contract for this ${n}-view set: use the uploaded front and back product images together as the single source of truth. `;
  const featureLine = cleanFeatures
    ? `The same physical SKU must keep the combined front/back feature map in every angle: ${cleanFeatures}. `
    : "The same physical SKU must keep the exact same silhouette, fabric, color, seams, trims, pockets, hardware, hem, and construction in every angle. ";
  return (
    ` ${garmentLine}${featureLine}` +
    "The front and back uploads are paired evidence for the same garment and must be reconciled into one complete product map before generating any angle. " +
    `All ${n} outputs must look like one real garment photographed from ${angles} angles, not ${n} related garments, not ${n} colorways, and not ${n} reinterpretations. ` +
    "Keep the same garment length, volume, fit, fabric texture, color, construction logic, pocket size and placement, closure type, cuff/hem behavior, graphics, and trim placement across the set. " +
    "SCALE RULE: the garment is worn in the model's own size: shoulder seams at her natural shoulder line, sleeves ending at the wrist bone, the hem at its stated length on her body. Do not enlarge or lengthen the garment beyond its stated fit, and do not shorten or crop it to fit the frame. " +
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
