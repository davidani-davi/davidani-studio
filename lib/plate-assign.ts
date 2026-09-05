import { bottomPlates, isBottom } from "./plate-wear";

/**
 * Which model a style gets shot on.
 *
 * Until now every model shot in the catalogue was the same woman in the same
 * stance, because the panel defaulted to one plate and nobody changes a
 * default forty times a day. A wholesale catalogue where every garment hangs
 * on one body reads as a template, not a lookbook.
 *
 * So the plate is assigned from the style code: deterministic, so a style
 * always comes back on the same model — a re-run, a retry, or a fifth view
 * added next week all match the shots already published — and spread, so the
 * catalogue as a whole moves through the whole plate set.
 *
 * Deliberately not random. Random gives you a different model every time you
 * press the button on the same garment, which is worse than one model.
 */

/**
 * The plates that meet the house standard (docs/MODEL_PLATE_STANDARD.md).
 *
 * The old kylie/celine/sydney plates are still installed — nothing is deleted
 * until the eval says so — but they are head-to-thigh crops at 19-23% head,
 * which is the framing every render inherits and the reason this work exists.
 * So automatic assignment draws only from the house set; naming one of the old
 * plates explicitly still works.
 */
export function housePlates<T extends { id: string }>(plates: T[]): T[] {
  return (plates || []).filter((p) => /^studio\s*\d+$/i.test(p.id.trim()));
}

export interface PlateChoice {
  humanModelId: string;
  poseId: string;
}

/**
 * FNV-1a over the style code. Small, stable across languages (the extension
 * needs the same answer as the server), and with no dependency to pin.
 */
export function plateHash(styleCode: string): number {
  let h = 0x811c9dc5;
  const s = (styleCode || "").trim().toUpperCase();
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/**
 * Pick a plate for a style.
 *
 * `plates` is the model catalogue in a stable order (the studio's own
 * listing). Twins share a body on purpose: DWJ62218 and PWJ62218 are the same
 * garment in two size runs, and shooting them on different women makes the
 * pair look like two products.
 */
export function assignPlate(
  styleCode: string,
  plates: Array<{ id: string; poses: Array<{ id: string }>; lowOk?: boolean }>,
  opts: { preferPrefix?: string; category?: string } = {}
): PlateChoice | null {
  const usable = (plates || []).filter((p) => p.poses && p.poses.length);
  if (!usable.length) return null;

  // Explicit preference first, then the house set, then whatever exists —
  // never nothing, because a missing plate is a failed run.
  let preferred = opts.preferPrefix
    ? usable.filter((p) => p.id.toLowerCase().startsWith(opts.preferPrefix!.toLowerCase()))
    : housePlates(usable);
  // A bottom is painted onto the waist-down sibling of its plate, which only
  // works when the model already wears trousers (lib/plate-wear.ts): pants
  // and skirts draw from the tagged subset when there is one.
  if (!opts.preferPrefix && isBottom(opts.category)) {
    const lows = bottomPlates(usable);
    if (lows.length) preferred = lows;
  }
  const list = preferred.length ? preferred : usable;

  // A Plus twin is the same garment: strip the leading P so the pair lands on
  // the same model.
  const code = (styleCode || "").trim().toUpperCase();
  const key = /^P[A-Z]/.test(code) ? "D" + code.slice(1) : code;

  const h = plateHash(key);
  const model = list[h % list.length];
  const pose = model.poses[(h >>> 8) % model.poses.length];
  return { humanModelId: model.id, poseId: pose.id };
}

/** How evenly a set of style codes would spread over the plates — used by the
 *  tests, and by anyone wondering whether the hash is doing its job. */
export function spread(
  codes: string[],
  plates: Array<{ id: string; poses: Array<{ id: string }> }>
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const code of codes) {
    const got = assignPlate(code, plates);
    if (got) out[got.humanModelId] = (out[got.humanModelId] || 0) + 1;
  }
  return out;
}
