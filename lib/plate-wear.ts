/**
 * What the model wears below the waist, per plate.
 *
 * A bottom — pants, a skirt — is shot on the "low NN" plate: the waist-down
 * crop of the same photograph (lib/plate-framing.ts). The generator repaints
 * the model's legs with the garment, which only works when those legs are
 * already trousers: a dress or a long skirt gives it nothing to repaint and
 * the hem bleeds into the result. So each house plate is tagged
 * (faire-management plate_wear.py, Claude vision over the front plate) with
 * `wears` and `low_ok` in plates.json, and both the automatic assignment and
 * the extension's picker keep bottoms to the tagged subset.
 */
export type PlateWear = {
  /** Human-facing name supplied by a curated reference set. */
  name?: string;
  wears?: string; lowOk?: boolean; silhouette?: string;
  /** House character plates (plates.json `face`): the same AI face on a real
   *  photograph, several to a pose — one per expression. */
  character?: string; expression?: string; slug?: string; poseKey?: string; pose?: string;
  /** Short outfit descriptors from plate_wear.py ("polka-dot barrel jeans"). */
  outfitAbove?: string; outfitBelow?: string;
  /** plates.json `auto: false` — a plate the assigner must not pick on its own
   *  (studio 65, 2026-09-08: an off-centre front and a different face on the
   *  full view; the wardrobe plates wait for QC). */
  autoPool?: boolean;
};

/** One plates.json row, as written by faire-management plate_install.py / plate_wear.py. */
export type PlateRow = {
  display_name?: string;
  name?: string; wears?: string; low_ok?: boolean; silhouette?: string; pose?: string;
  face?: string; expression?: string; slug?: string; outfit_above?: string; outfit_below?: string;
  /** false = kept out of automatic assignment (still pickable by hand) until it passes plate QC. */
  auto?: boolean;
};

/**
 * Which half of the house character's wardrobe to pick by, from the style
 * code being shot: a top or jacket is chosen by what she wears BELOW it, a
 * bottom by what she wears ABOVE. Sets, dresses, rompers and unknown codes
 * get no wardrobe filter. Codes: region letter (D regular / P plus), an
 * optional line letter (W, E), then the type letter — DWT62170 is a top,
 * DP62206 pants, DS42505 a skirt, DJ67204 a jacket, DTP a set.
 */
export function wardrobeHalf(styleNumber: unknown): "below" | "above" | null {
  const s = String(styleNumber || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (s.length < 2) return null;
  if (s.includes("TP")) return null;
  const type = s[1] === "W" || s[1] === "E" ? s[2] || "" : s[1];
  if (type === "T" || type === "J") return "below";
  if (type === "P" || type === "S") return "above";
  return null;
}

const EXPRESSION_ORDER = ["neutral", "smile", "teeth", "smirk", "grin"];

export type WardrobeGroup<T> = {
  key: string; poseKey: string; pose: string;
  outfitAbove: string; outfitBelow: string;
  /** Sorted neutral → smile → teeth → smirk. */
  plates: T[];
};

/**
 * The house character's plates folded into pose × outfit groups, expressions
 * inside each group, so the picker shows one card per look with a face
 * toggle instead of one card per expression.
 */
export function wardrobeGroups<T extends { id: string } & PlateWear>(
  models: T[],
  character = "vision"
): WardrobeGroup<T>[] {
  const groups = new Map<string, WardrobeGroup<T>>();
  for (const m of models || []) {
    if (m.character !== character || !/^studio\s*\d+$/i.test(String(m.id || "").trim())) continue;
    const poseKey = m.poseKey || m.id;
    const key = [poseKey, m.outfitBelow || "", m.outfitAbove || ""].join("|");
    let g = groups.get(key);
    if (!g) {
      g = { key, poseKey, pose: m.pose || "", outfitAbove: m.outfitAbove || "", outfitBelow: m.outfitBelow || "", plates: [] };
      groups.set(key, g);
    }
    g.plates.push(m);
  }
  const rank = (m: T) => {
    const i = EXPRESSION_ORDER.indexOf(String(m.expression || ""));
    return i < 0 ? EXPRESSION_ORDER.length : i;
  };
  for (const g of groups.values()) g.plates.sort((a, b) => rank(a) - rank(b));
  return [...groups.values()];
}

/** The outfit a group is filed under for the half being picked. */
export function outfitFor<T>(g: WardrobeGroup<T>, half: "below" | "above" | null): string {
  return half === "above" ? g.outfitAbove : g.outfitBelow;
}

/**
 * The leg silhouette a bottom's title names, as the key a plate is tagged
 * with in plates.json (`silhouette`): "Barrel Leg Jeans" -> "barrel". A
 * plate harvested from our own DP67305 (the barrel body, David 2026-09-06)
 * carries `silhouette: "barrel"`, and a barrel style shoots on it so the
 * leg shape comes from a photograph of that body, not from a guess.
 */
const SILHOUETTES: Array<[RegExp, string]> = [
  [/\bbarrel\b/i, "barrel"],
  [/\bballoon\b/i, "balloon"],
  [/\bwide[\s-]?leg\b|\bpalazzo\b/i, "wide"],
  [/\bstraight[\s-]?leg\b|\bstraight\b/i, "straight"],
  [/\bflare[ds]?\b|\bbootcut\b|\bboot[\s-]?cut\b/i, "flare"],
  [/\bjogger[s]?\b/i, "jogger"],
  [/\bskinny\b|\bslim\b/i, "skinny"],
  [/\bcargo\b/i, "cargo"],
];
export function silhouetteOf(title: unknown): string | undefined {
  const t = String(title || "");
  for (const [re, key] of SILHOUETTES) if (re.test(t)) return key;
  return undefined;
}

/** The tagged bottom plates whose silhouette matches; empty when none does. */
export function silhouettePlates<T extends { id: string; lowOk?: boolean; silhouette?: string }>(
  plates: T[],
  silhouette: string | undefined
): T[] {
  if (!silhouette) return [];
  return bottomPlates(plates).filter((p) => String(p.silhouette || "").toLowerCase() === silhouette);
}

export function isBottom(category: unknown): boolean {
  return category === "pants" || category === "skirt";
}

/** The house plates a bottom can be painted onto. Empty when none is tagged. */
export function bottomPlates<T extends { id: string; lowOk?: boolean }>(plates: T[]): T[] {
  return (plates || []).filter(
    (p) => /^(studio\s*\d+|pants-[a-z0-9]+)$/i.test(String(p.id || "").trim()) && p.lowOk === true
  );
}

/**
 * plates.json's `wears` / `low_ok` attached to "studio NN" and to its
 * "crop NN" / "low NN" siblings — the same photograph, the same legs. A plate
 * the file does not know keeps whatever it had (a user's own plate: nothing).
 */
export function mergePlateWear<T extends { id: string } & PlateWear>(
  models: T[],
  plates: PlateRow[] | null | undefined
): T[] {
  const byNum = new Map<number, PlateWear>();
  for (const p of plates || []) {
    const m = /^studio\s*(\d+)$/i.exec(String(p.name || "").trim());
    if (m && p.wears !== undefined) {
      const slug = p.slug ? String(p.slug) : undefined;
      byNum.set(Number(m[1]), {
        ...(p.display_name?.trim() ? { name: p.display_name.trim() } : {}),
        wears: String(p.wears), lowOk: p.low_ok === true,
        ...(p.silhouette ? { silhouette: String(p.silhouette).toLowerCase() } : {}),
        ...(p.pose ? { pose: String(p.pose) } : {}),
        ...(p.face ? { character: String(p.face) } : {}),
        ...(p.expression ? { expression: String(p.expression) } : {}),
        ...(slug ? { slug, poseKey: slug.replace(/-[a-z]+$/, "") } : {}),
        ...(p.outfit_above ? { outfitAbove: String(p.outfit_above) } : {}),
        ...(p.outfit_below ? { outfitBelow: String(p.outfit_below) } : {}),
        // explicit either way (2026-09-08): the deployed function kept
        // answering autoPool:true for auto:false rows while the bundled
        // plates.json plainly carried them — a stale compiled module in the
        // restored build cache is the only explanation left, and a changed
        // source line is what evicts it
        autoPool: p.auto !== false,
      });
    }
  }
  return (models || []).map((model) => {
    const m = /^(studio|crop|low)\s*(\d+)$/i.exec(String(model.id || "").trim());
    const tag = m ? byNum.get(Number(m[2])) : undefined;
    return tag ? { ...model, ...tag } : model;
  });
}
