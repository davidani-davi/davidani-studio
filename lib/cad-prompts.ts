// Textile CAD Pattern Extractor — mode prompts, spec-analysis prompts, and
// shared types. Pure module: no fal/sharp/node imports, so the client may
// `import type` from it without bundling server code.
//
// Philosophy (do not soften in the prompts): every garment photo is a
// distorted projection of a flat 2D textile print. The job is to REVERSE every
// post-design transformation (body warp, drape, wrinkles, seams, pockets,
// lighting, perspective, lens distortion) and RECOVER the original artwork.
// Never design, restyle, modernize, or "improve". Preserve every PRINTED motif,
// distress mark, color, opacity, placement, rotation, scale, and intentional
// imperfection — but remove physically applied embellishments (appliqués,
// lace/crochet patches, embroidery, beading) since those are not part of the
// mill print. The output must read as flat textile artwork, never as a garment.

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

// Shared recovery directives used by both image modes.
const RECOVERY_CORE = [
  "You are an expert textile CAD engineer recovering the original digital print artwork from a photograph of a finished garment.",
  "Treat the photograph as a distorted projection of a flat 2D textile print. Mathematically and visually reverse every transformation applied after the artwork left the designer: pattern warp from body shape, fabric drape, wrinkles, stretch, compression, construction seams, pockets, waistbands, elastic, gathering, drawstrings, stitching, washing, fading caused by photography, lighting, shadows, highlights, camera perspective, lens distortion, and cropping.",
  "Completely remove every garment-specific element: construction seams, top stitching, cover stitching, overlock stitching, elastic casing, waistbands, hem bands, drawstrings, buttons, snaps, zippers, pockets, pleats, gathering, panel breaks, necklines, sleeves, cuffs, yokes, side seams, fabric folds, wrinkles, body shape, shadows, lighting gradients, and perspective. Nothing from the garment may remain.",
  "Pay special attention to elasticated and gathered areas — balloon and bubble hems, gathered or scrunched ankle cuffs, elastic-ruched hems, ruched panels, gathered waistbands, and the puckered ridges around them are CONSTRUCTION, not print. The bunched, rippled, ridged, and shadowed fabric there is fold and shadow, never artwork. Delete every gathered cuff, elastic ridge, pucker, scrunch, and hem stitch completely and reconstruct the flat, undistorted print across that whole area from the surrounding artwork, so no trace of a cuff, hem, or gather remains.",
  "Preserve EXACTLY, do not clean or stylize: every PRINTED illustration, icon, motif, brush stroke, distress mark, ink texture, halftone, color, opacity, fade, placement, rotation, scale, spacing, overlap, and intentional imperfection. If something is intentionally distressed, washed, cracked, or aged, keep it exactly — do not sharpen, simplify, or restore it.",
  "Critical distinction — printed artwork vs. applied embellishment: only the flat MILL-PRINTED design is the textile artwork. Physical embellishments added during garment construction are NOT part of the print and must be completely removed: lace, crochet, eyelet, and embroidered appliqués and patches (e.g. flower, daisy, butterfly, star, or animal patches), embroidery, beading, sequins, rhinestones, studs, grommets, screen-printed or heat-pressed patches, trims, bows, ribbons, ric-rac, and labels. These sit ON TOP of the fabric in a different material or texture (often raised, openwork, or a contrasting solid color like cream lace). Treat each one as an occluder: delete it and reconstruct the continuous base print underneath it using ONLY the surrounding printed artwork. Do NOT reproduce, tile, or repeat any appliqué or embellishment anywhere in the output.",
  "Preserve exact color relationships of the print. Do NOT increase saturation or contrast, adjust hue, normalize colors, change brightness, or white-balance. Match the original textile artwork's colors.",
  "Reconstruct print hidden beneath pockets, seams, elastic, waistbands, gathering, folded fabric, or any removed appliqué/embellishment using ONLY the surrounding printed artwork, so the continuation looks perfectly natural with no visible interruption. Printed motifs cut off by seams, pockets, or folds must continue and reconnect naturally. Never invent unrelated motifs; when uncertain, preserve the printed artwork rather than invent.",
  "Output flat 2D artwork only: a square composition that FILLS THE ENTIRE FRAME edge to edge. The print must extend to and bleed off all four edges with NO white or blank border, no margin, no frame, no matting, no rounded corners, and no empty negative space anywhere around it. High resolution, production-ready CAD. No garment, no mannequin, no folds, no perspective, no shadows, no background. Artwork only — it must look like the original digital textile file the brand sent to the fabric mill, with no evidence it came from a photograph.",
].join(" ");

const FLAT_PROMPT = [
  RECOVERY_CORE,
  "MODE — FLAT ARTWORK RECOVERY: recover the flat print artwork exactly as it was printed across the fabric. Do NOT force a seamless tiling repeat in this mode; reproduce the artwork's true layout, scale, and spacing as recovered from the photograph.",
].join(" ");

const SEAMLESS_PROMPT = [
  RECOVERY_CORE,
  "MODE — SEAMLESS PRODUCTION CAD: produce a perfectly tileable square repeat of the recovered artwork. Determine the repeat logic (full repeat, half-drop, brick, mirror, engineered placement, border, panel, all-over, directional or non-directional) and reconstruct it. When the photograph shows only part of the repeat, INFER AND COMPLETE the full repeat from the surrounding artwork while preserving the original artistic language — never introduce unrelated motifs.",
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
