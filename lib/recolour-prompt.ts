/**
 * The edit prompt for a recolour mockup (Faire Daily's Style Explorer, "See it in this colour").
 *
 * mode "solid": the garment becomes the new colour.
 * mode "pair":  a two-tone garment keeps its second colour and its stripe or print layout;
 *               only its main colour changes.
 * Everything that is not the garment's colour must stay as it is: the point is to judge
 * a colour on the real shape, so the shape, the model and the photo cannot drift.
 */
export type RecolourMode = "solid" | "pair";

export function cleanColour(input: unknown): string {
  const colour = String(input ?? "").replace(/[^A-Za-z0-9 /&'-]/g, "").replace(/\s+/g, " ").trim();
  if (!colour || colour.length > 40) throw new Error("Choose a colour name of 1–40 letters.");
  return colour;
}

export function buildRecolourPrompt(colour: string, mode: RecolourMode = "solid"): string {
  const c = cleanColour(colour);
  const change =
    mode === "pair"
      ? `Change only the garment's main colour to ${c}. Keep its second colour exactly as it is, and keep the stripe, print or colour-block layout in exactly the same places and proportions.`
      : `Recolour the garment the model is wearing to ${c}. If the garment has a stripe, print or contrast trim, keep that pattern in the same places and recolour it in harmonious shades of ${c}.`;
  return [
    "Edit this fashion product photo.",
    change,
    "Keep everything else identical: the model's face, hair, skin, body and pose; shoes and accessories; the background, lighting and shadows;",
    "and the garment's exact shape, length, fit, fabric texture, wrinkles, seams, stitching, buttons and hardware.",
    "Do not add, remove or restyle anything. The result must look like a real photograph from the same shoot.",
  ].join(" ");
}
