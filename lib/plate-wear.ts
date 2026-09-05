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
export type PlateWear = { wears?: string; lowOk?: boolean };

export function isBottom(category: unknown): boolean {
  return category === "pants" || category === "skirt";
}

/** The house plates a bottom can be painted onto. Empty when none is tagged. */
export function bottomPlates<T extends { id: string; lowOk?: boolean }>(plates: T[]): T[] {
  return (plates || []).filter(
    (p) => /^studio\s*\d+$/i.test(String(p.id || "").trim()) && p.lowOk === true
  );
}

/**
 * plates.json's `wears` / `low_ok` attached to "studio NN" and to its
 * "crop NN" / "low NN" siblings — the same photograph, the same legs. A plate
 * the file does not know keeps whatever it had (a user's own plate: nothing).
 */
export function mergePlateWear<T extends { id: string } & PlateWear>(
  models: T[],
  plates: Array<{ name?: string; wears?: string; low_ok?: boolean }> | null | undefined
): T[] {
  const byNum = new Map<number, PlateWear>();
  for (const p of plates || []) {
    const m = /^studio\s*(\d+)$/i.exec(String(p.name || "").trim());
    if (m && p.wears !== undefined) byNum.set(Number(m[1]), { wears: String(p.wears), lowOk: p.low_ok === true });
  }
  return (models || []).map((model) => {
    const m = /^(studio|crop|low)\s*(\d+)$/i.exec(String(model.id || "").trim());
    const tag = m ? byNum.get(Number(m[2])) : undefined;
    return tag ? { ...model, ...tag } : model;
  });
}
