import type { GarmentCategory } from "./canvas-registry";

/**
 * Read a Davi & Dani style code's alpha prefix as a garment signal.
 *
 * WHY — THE ERP CATEGORY FIELD IS HAND-ENTERED AND SOMETIMES WRONG
 * ----------------------------------------------------------------
 * DWTS67099 is a poncho photographed over a matching maxi skirt, in all nine
 * gallery frames across all three colourways. Its ERP category reads
 * `JACKETS / OUTWEAR`, so it routed to the outerwear canvas and rendered as a
 * lone poncho — and the skirt kept "leaking" back in, which looked like a bug
 * and was really the product asserting itself.
 *
 * The style code already carried the answer. DWTS = Davi & Dani / Winter /
 * Top & Skirt. Two garment letters means a two-piece set, and the code is
 * assigned at style creation rather than typed into a dropdown later, so it is
 * the more reliable of the two fields.
 *
 * WHY A TABLE AND NOT A LETTER GRAMMAR
 * ------------------------------------
 * "Trailing letters name the garments" is tempting and wrong. Sampled live:
 *
 *   DWTS  6/6 SET      DCJT  2/2 TOP
 *   DETS  6/6 SET      DWDT  1/1 TOP
 *   DWTP  6/6 SET      DSCP  1/1 ACCESSORIES
 *   DCTP  6/6 SET
 *   DEJP  6/6 SET
 *   DTS   6/6 SET
 *
 * DCJT and DWDT look exactly like two-garment codes and are single garments.
 * A grammar would confidently mis-split them. So every prefix here was checked
 * against live ERP records first, and anything that did not come back clean is
 * simply absent — an unknown prefix yields no signal and the ERP decides.
 *
 * AUTHORITY IS GRADED, NOT ABSOLUTE
 * ---------------------------------
 * The code does not outrank the ERP everywhere, only where it demonstrably
 * knows better:
 *
 *   "override"    set codes — proven right where the category field was wrong.
 *   "bottom-hint" DS/DP — only refines the ERP's BOTTOM, which covers skirts
 *                 and trousers alike and cannot pick a canvas on its own.
 *                 Never overrides a category the ERP did state.
 *   "fill"        top/outerwear/dress codes — the ERP agreed unanimously on
 *                 every one sampled, so these earn nothing by overriding and
 *                 are used only when the ERP has no answer at all (DWJ styles
 *                 with the category left unset).
 */

/** How far a code's reading may push against the ERP's own category. */
export type StyleCodeAuthority = "override" | "bottom-hint" | "fill";

export interface StyleCodeSignal {
  category: GarmentCategory;
  authority: StyleCodeAuthority;
  /** The prefix that matched, for logging. */
  prefix: string;
}

/**
 * Validated prefixes. Longest match wins, so DWTS must beat DWT and DCTP must
 * beat DCT — see decodeStyleCode().
 *
 * Sample counts are from live ERP records; a prefix stays out of this table
 * unless its sample was clean. DET (4 TOP / 2 SET) is deliberately absent for
 * that reason.
 */
const PREFIXES: Array<{ prefix: string } & StyleCodeSignal> = [
  // --- two-piece sets: Top&Pants, Top&Skirt, Jacket&Pants, Pants&Top -------
  { prefix: "DWTS", category: "set", authority: "override" }, // Winter Top & Skirt
  { prefix: "DWTP", category: "set", authority: "override" }, // Winter Top & Pants
  { prefix: "DETS", category: "set", authority: "override" }, // Elevated Top & Skirt
  { prefix: "DETP", category: "set", authority: "override" }, // Elevated Top & Pants
  { prefix: "DEPT", category: "set", authority: "override" }, // Elevated Pants & Top
  { prefix: "DEJP", category: "set", authority: "override" }, // Elevated Jacket & Pants
  { prefix: "DCTP", category: "set", authority: "override" }, // Cotton Top & Pants
  { prefix: "DTP", category: "set", authority: "override" }, // Top & Pants
  { prefix: "DTS", category: "set", authority: "override" }, // Top & Skirt

  // --- single garments: fill only ------------------------------------------
  { prefix: "DWT", category: "top", authority: "fill" },
  { prefix: "DCT", category: "top", authority: "fill" },
  { prefix: "DWJ", category: "outerwear", authority: "fill" },
  { prefix: "DJ", category: "outerwear", authority: "fill" },
  { prefix: "DD", category: "dress", authority: "fill" },

  // --- bottoms: split the ERP's BOTTOM, nothing more ------------------------
  { prefix: "DS", category: "skirt", authority: "bottom-hint" },
  { prefix: "DP", category: "pants", authority: "bottom-hint" },
];

/**
 * Decode a style number's alpha prefix. Returns null for anything unvalidated,
 * which leaves the ERP in charge.
 *
 * Matching is longest-prefix-first and requires a DIGIT immediately after the
 * prefix. Both halves of that rule are load-bearing:
 *
 *   longest-first  "DWTS67099" reads as DWTS, not as DWT with a stray S.
 *   digit-anchored "DCJT22059" matches nothing at all, because no table entry
 *                  is followed by a digit there. That is what keeps the known
 *                  set-lookalikes (DCJT, DWDT, DSCP — all confirmed single
 *                  garments) out, without needing a deny-list to chase.
 */
export function decodeStyleCode(style: string | null | undefined): StyleCodeSignal | null {
  const key = String(style || "").trim().toUpperCase();
  if (!key) return null;

  let best: (typeof PREFIXES)[number] | null = null;
  for (const entry of PREFIXES) {
    if (!new RegExp(`^${entry.prefix}\\d`).test(key)) continue;
    if (!best || entry.prefix.length > best.prefix.length) best = entry;
  }
  if (!best) return null;
  return { category: best.category, authority: best.authority, prefix: best.prefix };
}

/**
 * Combine the style code with the ERP's own category, per the authority rules
 * documented above. `erpCategory` is the already-mapped ERP value, where
 * "ambiguous-bottom" means the ERP said BOTTOM without saying which kind.
 *
 * Pure — no network — so the caller can settle this before running vision. That
 * ordering matters: a style resolved to "set" must go through the two-piece
 * extractor, and the choice of extractor cannot be revisited afterwards.
 */
export function reconcileStyleCode(
  style: string | null | undefined,
  erpCategory: GarmentCategory | "ambiguous-bottom" | null
): { category: GarmentCategory | "ambiguous-bottom" | null; source: string } {
  const code = decodeStyleCode(style);
  if (!code) return { category: erpCategory, source: erpCategory ? "erp" : "none" };

  if (code.authority === "override") {
    if (erpCategory && erpCategory !== code.category) {
      console.log(
        `[style-code] ${code.prefix} says ${code.category}; ERP said ${erpCategory} — using the code`
      );
    }
    return { category: code.category, source: `style-code:${code.prefix}` };
  }

  if (code.authority === "bottom-hint") {
    // Only ever refines BOTTOM. An ERP category of DRESS on a DS style stands.
    if (erpCategory === "ambiguous-bottom") {
      return { category: code.category, source: `erp:BOTTOM+style-code:${code.prefix}` };
    }
    return { category: erpCategory, source: erpCategory ? "erp" : "none" };
  }

  // "fill": only speaks when the ERP has nothing to say.
  if (!erpCategory) return { category: code.category, source: `style-code:${code.prefix}` };
  return { category: erpCategory, source: "erp" };
}
