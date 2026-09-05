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
 * The extension plans the run with the same category rule (model_shots_core.js
 * categoryFor) so the views it queues and the plates served here agree.
 */
export type PlateFraming = "full" | "crop" | "low";
export type ShotCategory = GarmentCategory;
export const SHOT_CATEGORIES: ShotCategory[] = ["top", "outerwear", "dress", "set", "pants", "skirt", "unknown"];

export interface ShotStep {
  view: PresetView;
  framing: PlateFraming;
}

/** The views a run shoots for a category, in shooting order, with the plate framing each is handed. */
export function shotPlan(category: ShotCategory): ShotStep[] {
  if (category === "pants" || category === "skirt") {
    return [
      { view: "front", framing: "low" },
      { view: "side", framing: "low" },
      { view: "full", framing: "full" },
    ];
  }
  if (category === "top" || category === "outerwear") {
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

export function framingFor(category: ShotCategory, view: PresetView): PlateFraming {
  return shotPlan(category).find((s) => s.view === view)?.framing ?? "full";
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
