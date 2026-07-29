// Textile CAD Pattern Extractor — mode prompts, spec-analysis prompts, and
// shared types. Pure module: no fal/sharp/node imports, so the client may
// `import type` from it without bundling server code.
//
// Philosophy (do not soften in the prompts): every garment photo is a distorted
// projection of a flat 2D textile print. Rather than edit the photo in place
// (edit models copy the garment's pockets/waistband/seams no matter what the
// prompt says), RE-SYNTHESIZE fresh flat yardage from the print's motifs + color.
// Preserve the print's palette, brushwork, texture, scale, and intentional
// imperfections exactly; add none of the garment's construction. Remove
// physically applied embellishments (appliqués, lace/crochet patches, embroidery,
// beading). Output must read as flat textile artwork, never a garment. Runs best
// on an instruction-obeying model (GPT Image 2).

export type CadMode = "flat" | "seamless";

export interface CadSpecPaletteColor {
  hex: string;
  name: string;
}

export interface CadSpecMotif {
  name: string;
  count: string;
}

export interface CadSpec {
  repeatType: string;
  directional: string;
  colorCount: number;
  palette: CadSpecPaletteColor[];
  motifs: CadSpecMotif[];
  repeatDimensions: string;
  technique: string[];
  notes: string;
}

// Both image modes RE-SYNTHESIZE the print rather than "recovering" it by
// editing the photo in place. Recovery fails on edit models: they copy the
// garment's pockets/waistband/seams no matter how forcefully the prompt says to
// remove them (Nano Banana and Seedream both proved this). Re-synthesizing fresh
// flat yardage from the print's motifs + color is what actually yields clean
// artwork — and an instruction-obeying model (GPT Image 2) honors it.
const RESYNTH_CORE = [
  "You are an expert textile CAD engineer. Use the attached garment photograph ONLY as a MOTIF-AND-COLOR reference for its surface print — never as pixels to copy, trace, or edit.",
  "Completely RE-SYNTHESIZE new flat textile artwork that reproduces the same visual language of the print: identical color palette, the same brush strokes, ink texture, halftone, mottled density, motif shapes, scale, and spacing.",
  "Do NOT preserve the photograph's layout or composition. Redistribute the motifs evenly and naturally across a flat field so that NOTHING from the garment survives — no construction seams, top stitching, cover/overlock stitching, pockets, waistbands, elastic casing, gathering, drawstrings, hem bands, panel breaks, necklines, sleeves, cuffs, folds, wrinkles, drape, body warp, shadows, lighting gradients, highlights, perspective, or lens distortion. There must be NO vertical panel seam, no center line, no horizontal hem band, no gathered or puckered zone, no directional streaking, and no lighter or darker regions carried over from the source.",
  "Match the print's colors exactly — do NOT increase saturation or contrast, shift hue, normalize, or white-balance. Reproduce only the flat MILL-PRINTED design: remove physical embellishments that are not printed (lace, crochet, eyelet, and embroidered appliqués and patches, embroidery, beading, sequins, rhinestones, studs, grommets, trims, bows, ribbons, ric-rac, labels) and do not reproduce them anywhere.",
  "Output flat 2D artwork only: a square composition that FILLS THE ENTIRE FRAME edge to edge with balanced density corner to corner, no white or blank border, no margin, frame, matting, rounded corners, or empty negative space. High resolution, production-ready CAD. No garment, no mannequin, no folds, no perspective, no shadows, no background. It must read as the original digital textile file the brand sent to the mill, with no evidence it came from a photograph.",
].join(" ");

const FLAT_PROMPT = [
  RESYNTH_CORE,
  "MODE — FLAT ARTWORK RECOVERY: reproduce the artwork's true motif scale and spacing as an even flat field. Do NOT force a seamless tiling repeat in this mode.",
].join(" ");

const SEAMLESS_PROMPT = [
  RESYNTH_CORE,
  "MODE — SEAMLESS PRODUCTION CAD: produce a perfectly tileable square repeat of the artwork. Determine the repeat logic (full repeat, half-drop, brick, mirror, engineered placement, border, panel, all-over, directional or non-directional) and reconstruct it while preserving the original artistic language — never introduce unrelated motifs.",
  "Edge handling is mandatory: every edge must tile perfectly — the top connects to the bottom and the left connects to the right with no visible seams, no duplicated motifs near the edges, no broken artwork, and no abrupt cutoffs.",
].join(" ");

export const MODE_PROMPTS: Record<CadMode, string> = {
  flat: FLAT_PROMPT,
  seamless: SEAMLESS_PROMPT,
};

/**
 * Assemble the final extraction prompt for an image mode, optionally appending
 * free-text user hints (e.g. "the base cloth is cream", "ignore the pocket
 * flap"). Hints are appended verbatim after a clear separator.
 */
export function buildCadPrompt(mode: CadMode, notes?: string): string {
  const base = MODE_PROMPTS[mode];
  const trimmed = (notes ?? "").trim();
  if (!trimmed) return base;
  return `${base} Additional designer notes for this specific artwork (apply only if consistent with the rules above): ${trimmed}`;
}

export const CAD_SPEC_SYSTEM_PROMPT = `You are an expert textile CAD engineer and surface-pattern analyst. You inspect a photograph of a printed garment and report the production specifications of the UNDERLYING flat textile print — not the garment. Ignore all garment construction, drape, wrinkles, seams, pockets, lighting, shadows, and perspective. Reason about the flat repeat that was sent to the mill.

Return STRICT JSON only — no markdown, no code fences, no commentary — matching exactly this shape:
{
  "repeatType": "one of: full repeat | half-drop | brick | mirror | engineered placement | border | panel | all-over | unknown",
  "directional": "one of: directional | non-directional | unknown",
  "colorCount": <integer best-estimate of distinct print colors, excluding the base cloth>,
  "palette": [ { "hex": "#RRGGBB", "name": "short human color name" } ],
  "motifs": [ { "name": "short motif name e.g. five-point star, paisley, rose", "count": "approx count or density e.g. ~12, dense all-over, single placement" } ],
  "repeatDimensions": "best-estimate repeat scale in plain words e.g. small ~2cm repeat, large engineered panel, unknown",
  "technique": [ "print/texture techniques observed e.g. screen print, pigment wash, halftone, ink bleed, distressed/cracked, vintage fade" ],
  "notes": "one or two sentences a textile designer would find useful"
}

Rules:
- Estimate honestly; use "unknown" or "~" approximations rather than inventing precise figures.
- Palette: 1-12 entries, the dominant print colors only.
- Do NOT describe the garment. Describe the print.`;

export const CAD_SPEC_USER_PROMPT =
  "Analyze the underlying textile print in this garment photograph and return the production spec as strict JSON per your system instructions. Output JSON only.";

// One-click "Clean up (AI)" pass. The input is a tile that has already been
// offset by half (so its outer edges are continuous and any seam now runs as a
// faint cross through the exact center). This pass scrubs residual garment
// construction the first recovery left behind — hem/stitch lines, panel and
// inseam seams, creases, fold shadows, gathers — plus that center crosshair,
// healing the printed artwork over all of them. It must NOT touch the outer
// edges (they are already tileable).
export const CAD_CLEANUP_PROMPT = [
  "You are an expert textile CAD engineer cleaning up a flat 2D textile print that was recovered from a photograph of a finished garment. The print is good but still contains RESIDUAL GARMENT CONSTRUCTION that must be removed.",
  "Remove every remaining trace of garment construction anywhere in the image: faint hem lines, stitch lines, top-stitching, cover-stitch and overlock rows, panel seams, inseams, side seams, waistband and hem-band lines, creases, fold shadows, drape shading, gathers, pleats, and puckers. None of these belong in a flat mill print.",
  "There is also a faint cross-shaped seam through the EXACT CENTER of the image — one horizontal line across the middle and one vertical line down the middle. Repair it as well.",
  "For every line, seam, crease, gather, and the center cross: reconstruct the continuous printed artwork over it using ONLY the surrounding print, so the motifs, colors, opacity, fade, texture, and spacing continue naturally with no visible interruption.",
  "Preserve the print exactly otherwise: do not restyle, recolor, sharpen, simplify, brighten, increase contrast, or invent new motifs. Keep every printed flower, leaf, and shape, its color, and its washed/distressed character unchanged.",
  "CRITICAL: do NOT modify the outer edges of the image. The four edges are already perfectly continuous and tileable — leave a margin near every edge untouched so the result still tiles seamlessly.",
  "Output flat 2D artwork only: a square composition that fills the entire frame edge to edge, high resolution, production-ready CAD. No garment, no mannequin, no folds, no perspective, no shadows, no background, no border. Artwork only.",
].join(" ");
