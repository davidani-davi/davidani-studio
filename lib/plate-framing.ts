import type { PresetView } from "./models-registry";
import type { GarmentCategory } from "./canvas-registry";
import { inferCategory } from "./canvas-registry";
import { MULTI_MODEL_VIEWS } from "./multi-model-prompt";

/**
 * Which plate a view is shot on, per garment category.
 *
 * Faire's listing photos are not full-length figures. A top or a jacket is
 * shot head-to-mid-thigh with the garment filling the frame; pants and skirts
 * from the waist down with no head in frame; only dresses, sets and the one
 * "full shot" show the whole figure. The generator takes its framing from the
 * plate it is handed, so each framing exists as a plate family, cut from the
 * very same photograph as the house plate (faire-management plate_crop.py):
 *
 *   studio NN   full-length, the harvested house plate
 *   crop NN     head to mid-thigh, head ~20% of frame   -> tops, outerwear
 *   low NN      waist to shoes, no head                  -> pants, skirts
 *
 * The crop family only works when the garment ends above its bottom edge. A
 * longline coat on "crop NN" has nowhere to put its hem: DJ67094 (2026-09-05)
 * came back as a hip-length shacket on the side view and as an oversized,
 * stretched figure on the front and back, because the generator either obeys
 * the crop and shortens the coat or breaks it and extends the body. So the
 * hem is a second planning dimension (hemFor): a top or outerwear piece whose
 * copy says it is long — longline, duster, knee-length, midi, maxi, or simply
 * a coat — is shot on the full-length plate in every view, like a dress.
 *
 * The extension plans the run with the same category and hem rules
 * (model_shots_core.js categoryFor / hemFor) so the views it queues and the
 * plates served here agree.
 */
export type PlateFraming = "full" | "crop" | "low";
/** Where the garment ends, read from our own copy: "long" reaches below the
 *  crop plate's mid-thigh edge, "short" is explicitly cropped, "" is unknown. */
export type Hem = "long" | "short" | "";
export type ShotCategory = GarmentCategory;
export const SHOT_CATEGORIES: ShotCategory[] = ["top", "outerwear", "dress", "set", "pants", "skirt", "unknown"];

export interface ShotStep {
  view: PresetView;
  framing: PlateFraming;
}

/**
 * Length words in a title or taxonomy name that put the hem below the crop
 * plate's mid-thigh edge. A coat of any kind counts: a coat that ends above
 * the thigh is the exception and its title says "cropped". "Long sleeve"
 * deliberately does not match. Mirrored in model_shots_core.js LONG_HEM.
 */
const LONG_HEM_RE =
  /\b(pea|over|top|rain|trench|duster|long)?coat\b|\btrench\b|\bduster\b|long-?line|\bmaxi\b|\bmidi\b|mid-?calf|calf-?length|knee-?length|below[- ]the[- ]knee|below-?knee|ankle-?length|floor-?length|full-?length/i;
const SHORT_HEM_RE = /\bcropped\b|\bcrop\b/i;

/** The hem a run is planned with: an explicit one wins, then the taxonomy name and the title. */
export function hemFor(known: { hem?: unknown; type?: unknown; title?: unknown } | null | undefined): Hem {
  const k = known || {};
  const explicit = String(k.hem || "").toLowerCase();
  if (explicit === "long" || explicit === "short") return explicit;
  const text = `${typeof k.type === "string" ? k.type : ""} ${typeof k.title === "string" ? k.title : ""}`;
  if (SHORT_HEM_RE.test(text)) return "short";
  return LONG_HEM_RE.test(text) ? "long" : "";
}

/** True when a layer's hem is in every frame, so the plate's own legs would show under it. */
export function showsBottoms(category: ShotCategory, hem: Hem): boolean {
  return (category === "top" || category === "outerwear") && hem === "long";
}

/** The views a run shoots for a category, in shooting order, with the plate framing each is handed. */
export function shotPlan(category: ShotCategory, hem: Hem = ""): ShotStep[] {
  if (category === "pants" || category === "skirt") {
    return [
      { view: "front", framing: "low" },
      { view: "side", framing: "low" },
      { view: "full", framing: "full" },
    ];
  }
  if ((category === "top" || category === "outerwear") && hem !== "long") {
    return [
      { view: "front", framing: "crop" },
      { view: "side", framing: "crop" },
      { view: "back", framing: "crop" },
      { view: "full", framing: "full" },
    ];
  }
  return MULTI_MODEL_VIEWS.map((view) => ({ view, framing: "full" as const }));
}

export function shotViews(category: ShotCategory): PresetView[] {
  return shotPlan(category).map((s) => s.view);
}

export function framingFor(category: ShotCategory, view: PresetView, hem: Hem = ""): PlateFraming {
  return shotPlan(category, hem).find((s) => s.view === view)?.framing ?? "full";
}

/**
 * Faire taxonomy name -> category. The extension names the type from the
 * style code (faire_taxonomy.json: "Pants - Women's", "Top & Pant Set (NOT
 * Loungewear) - Women's", ...), so this table is exact for everything it
 * sends. Order matters: a "Top & Pant Set" is a set before it is pants, a
 * "Shirt Jacket" is outerwear before it is a shirt, an "Outerwear Vest" is
 * outerwear before a vest is a top.
 */
const TYPE_RULES: Array<[RegExp, ShotCategory]> = [
  [/\bset\b/i, "set"],
  [/jumpsuit|romper|overall|dress|gown/i, "dress"],
  [/skirt|skort/i, "skirt"],
  [/pants|shorts|jeans|leggings|trousers|joggers|culottes/i, "pants"],
  [/jacket|coat|shacket|kimono|outerwear|bomber|puffer|blazer|cape|poncho/i, "outerwear"],
  [/top|shirt|blouse|sweater|cardigan|tee|hoodie|sweatshirt|tunic|vest|tank|cami/i, "top"],
];

export function categoryFromType(type: string | null | undefined): ShotCategory {
  const t = String(type || "");
  for (const [re, cat] of TYPE_RULES) if (re.test(t)) return cat;
  return "unknown";
}

/** The category a run is planned with: an explicit one wins, then the taxonomy name, then the title's words. */
export function shotCategory(
  known: { category?: unknown; type?: unknown; title?: unknown } | null | undefined
): ShotCategory {
  const k = known || {};
  const explicit = String(k.category || "").toLowerCase() as ShotCategory;
  if (explicit && explicit !== "unknown" && SHOT_CATEGORIES.includes(explicit)) return explicit;
  const byType = categoryFromType(typeof k.type === "string" ? k.type : "");
  if (byType !== "unknown") return byType;
  const title = typeof k.title === "string" ? k.title : "";
  const byTitle = categoryFromType(title);
  return byTitle !== "unknown" ? byTitle : inferCategory(title);
}

/** The derived families never show in a picker: they are the house plate re-framed. */
export function isDerivedPlate(id: string): boolean {
  return /^(crop|low)\s*\d+$/i.test(String(id || "").trim());
}

/**
 * Swap a house plate for its sibling of the framing this view needs:
 * "studio 07" + "crop" -> "crop 07" when that family is installed. Anything
 * else (a user plate, an uninstalled family, full framing) comes back as is,
 * so a missing crop degrades to the full-length plate rather than failing.
 */
export function plateForFraming(
  humanModelId: string,
  poseId: string,
  framing: PlateFraming,
  catalogue: Array<{ id: string; poses: Array<{ id: string }> }>
): { humanModelId: string; poseId: string; derived: boolean } {
  const m = /^studio\s*(\d+)$/i.exec(String(humanModelId || "").trim());
  if (framing === "full" || !m) return { humanModelId, poseId, derived: false };
  const want = `${framing} ${m[1]}`.toLowerCase();
  const sib = catalogue.find((p) => String(p.id).toLowerCase() === want);
  if (!sib || !sib.poses.length) return { humanModelId, poseId, derived: false };
  // one pose per derived folder, named after the folder
  return { humanModelId: sib.id, poseId: sib.poses[0].id, derived: true };
}
