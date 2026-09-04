/**
 * How many garment photos a Model Studio run takes, and what they are called.
 *
 * The composer's tiles are not decoration: the order IS the meaning. The
 * two-photo set extractor reads the first URL as the TOP and the second as the
 * bottom, so a pair of tiles labelled "Photo 1" and "Photo 2" would let an
 * operator hand it a skirt as a blouse without anything on screen disagreeing.
 * A set held in one photo takes one tile, because a second upload there is
 * ignored server-side — offering the slot would promise something the run does
 * not do.
 */
export interface ComposerSlot {
  url: string | null;
  label: string;
  required?: boolean;
}

export type CoordinatedSetMode = "single-image" | "two-images";

export function modelComposerSlots(
  selected: string[],
  twoPiece: boolean,
  setMode: CoordinatedSetMode
): ComposerSlot[] {
  if (twoPiece && setMode === "two-images") {
    return [
      { url: selected[0] ?? null, label: "Top", required: true },
      { url: selected[1] ?? null, label: "Bottom", required: true },
    ];
  }
  return [{ url: selected[0] ?? null, label: twoPiece ? "Set" : "Garment", required: true }];
}
