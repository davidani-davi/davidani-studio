import { STUDIO_BACKDROP_PATH, type BackgroundCanvasMode } from "./studio-background";

/**
 * Which studio canvas a given garment renders onto.
 *
 * WHY A REGISTRY RATHER THAN ONE CANVAS
 * -------------------------------------
 * `buildTwoImagePrompt`'s composition standard tells the model the garment must
 * "occupy the same proportional area of the frame" as the canvas. That is what
 * pins every SKU to the same framing — and it is also why one canvas cannot
 * serve every category. Measured across the approved flat lays, the garment
 * box spans a very different share of the frame per category:
 *
 *   outerwear  ~77% wide x ~54% tall
 *   top        ~82% wide x ~53% tall
 *   dress      ~50% wide x ~76% tall
 *   skirt      ~52% wide x ~69% tall
 *   set        ~63% wide x ~70% tall
 *
 * Rendering a maxi dress onto the bomber canvas asks it to fill 77% of the
 * frame width. So the canvas is chosen per category.
 *
 * WHY THERE IS ALWAYS A FALLBACK
 * ------------------------------
 * The template is written as a CANVAS EDIT — every clause says to preserve the
 * first image's background, lighting and framing. Send no canvas and
 * `image_urls[0]` becomes the user's own phone photo, so the model faithfully
 * preserves the floor, foam play-mat or bed it was shot on. That is the exact
 * failure back mode used to have.
 *
 * So a category with no approved canvas does NOT mean "no canvas". It falls
 * back to the empty #edeeee sweep with backgroundMode "backdrop", where
 * `buildTwoImagePrompt` switches from copying composition to SPECIFYING it in
 * words ("centered, comfortable even margins on all four sides, camera
 * straight-on, re-center and straighten rather than copying position, angle or
 * scale"). Background, ratio and colour stay pinned exactly; only framing
 * becomes verbal. Worse than a real canvas, vastly better than none.
 *
 * Adding a category later is: shoot one flat lay, drop it in
 * public/product-shots/, add a line here. Until then that category still
 * produces a clean centred #edeeee product shot.
 */
export type GarmentCategory =
  | "outerwear"
  | "top"
  | "dress"
  | "skirt"
  | "pants"
  | "set"
  | "unknown";

export interface CanvasChoice {
  /** Public path of the canvas that becomes image_urls[0]. */
  path: string;
  /** Must be passed to /api/analyze so the prompt describes the canvas sent. */
  mode: BackgroundCanvasMode;
  /**
   * The category this canvas was resolved FOR — preserved even when the sweep
   * fallback applied, so logs distinguish "recognised as pants, no canvas yet"
   * from "could not classify at all". Read `isFallback` to know which canvas
   * actually came back.
   */
  category: GarmentCategory;
  /** True when this is the empty sweep rather than an approved flat lay. */
  isFallback: boolean;
}

interface CanvasEntry {
  front: string;
  /** Only outerwear has an approved back flat lay so far. */
  back?: string;
}

/**
 * Approved canvases per category. Every file here must be 2160x2700 and
 * corner-exact #edeeee — enforced by lib/canvas-registry.test.ts, because a
 * canvas that drifts teaches the model the wrong background.
 */
const CANVASES: Partial<Record<GarmentCategory, CanvasEntry>> = {
  outerwear: {
    front: "/product-shots/canvas-outerwear-front.png",
    back: "/product-shots/canvas-outerwear-back.png",
  },
  top: { front: "/product-shots/canvas-top-front.png" },
  dress: { front: "/product-shots/canvas-dress-front.png" },
  skirt: { front: "/product-shots/canvas-skirt-front.png" },
  set: { front: "/product-shots/canvas-set-front.png" },
  // pants: no approved flat lay yet -> empty sweep. Deliberately left out
  // rather than pointed at a top canvas, which would ask trousers to fill the
  // frame like a bomber.
};

/**
 * Ordered category tests. FIRST MATCH WINS, so the order is load-bearing:
 *
 *  - "set" runs first: "matching top and skirt set" must not be read as a skirt.
 *  - "outerwear" runs before "top": a "denim jacket" is outerwear, and a
 *    "cardigan" is listed under top on purpose (it lies flat like a top).
 *  - "dress" runs before "skirt": "shirt dress" is a dress.
 *
 * Word lists avoid known false-positive traps, following the same reasoning as
 * the original pants-only inference: no bare "short" (matches "short sleeve"),
 * no bare "denim" (matches "denim jacket"), no bare "pant".
 */
const CATEGORY_PATTERNS: Array<{ category: GarmentCategory; words: string[] }> = [
  {
    category: "set",
    words: [
      "two-piece", "two piece", "twopiece", "coordinated set", "matching set",
      "co-ord", "coord set", "tracksuit", "loungewear set", "pajama set", "suit set",
    ],
  },
  {
    category: "outerwear",
    words: [
      "jacket", "coat", "blazer", "bomber", "parka", "anorak", "windbreaker",
      "puffer", "trench", "peacoat", "overcoat", "moto", "varsity", "letterman",
      "shacket", "poncho", "cape", "gilet", "outerwear",
    ],
  },
  {
    category: "dress",
    words: [
      "dress", "gown", "frock", "sundress", "midi dress", "maxi dress",
      "mini dress", "shirtdress", "jumpsuit", "romper", "playsuit", "overall dress",
    ],
  },
  {
    category: "skirt",
    words: ["skirt", "skort"],
  },
  {
    category: "pants",
    words: [
      "pants", "trousers", "jeans", "shorts", "chinos", "joggers",
      "sweatpants", "slacks", "leggings", "khakis", "corduroys", "culottes",
      "flares", "bottoms",
    ],
  },
  {
    category: "top",
    words: [
      "top", "shirt", "blouse", "tee", "t-shirt", "tank", "cami", "camisole",
      "sweater", "sweatshirt", "hoodie", "cardigan", "pullover", "jumper",
      "knit", "vest", "tunic", "bodysuit", "crop top", "halter", "polo", "henley",
    ],
  },
];

/**
 * Infer the garment category from analyzer text (the GARMENT line, or the
 * assembled prompt containing it). Returns "unknown" when nothing matches,
 * which routes to the sweep fallback rather than guessing.
 */
export function inferCategory(text: string): GarmentCategory {
  if (!text) return "unknown";
  for (const { category, words } of CATEGORY_PATTERNS) {
    for (const w of words) {
      // Escape regex metacharacters (hyphens are fine, but "t-shirt" and any
      // future entry with "." or "+" must not become a wildcard).
      const safe = w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      if (new RegExp(`\\b${safe}\\b`, "i").test(text)) return category;
    }
  }
  return "unknown";
}

/**
 * Resolve the canvas for a garment. `view` picks the back canvas where the
 * category has one; categories without a back flat lay fall back to the sweep
 * for back renders rather than reusing a front-facing canvas, which would ask
 * the model to match a front composition while rendering a back view.
 */
export function resolveCanvas(
  category: GarmentCategory,
  view: "front" | "back" = "front"
): CanvasChoice {
  const entry = CANVASES[category];
  const path = view === "back" ? entry?.back : entry?.front;
  if (!path) {
    return { path: STUDIO_BACKDROP_PATH, mode: "backdrop", category, isFallback: true };
  }
  return { path, mode: "preserve", category, isFallback: false };
}

/** Convenience: infer then resolve in one step. */
export function canvasForGarment(
  text: string,
  view: "front" | "back" = "front"
): CanvasChoice {
  return resolveCanvas(inferCategory(text), view);
}

/** Categories that currently have an approved canvas, for UI and diagnostics. */
export function coveredCategories(): GarmentCategory[] {
  return Object.keys(CANVASES) as GarmentCategory[];
}
