// Pure helpers for CAD print-ready export. No DOM or server (sharp/fal/node)
// imports, so this module is safe to import from both client components and
// server routes. All functions are deterministic and side-effect free.

const CM_PER_INCH = 2.54;

/**
 * Physical print resolution for a square tile that represents one repeat.
 * A 2048px tile printed at `repeatCm` wide => dpi = px / inches.
 */
export function repeatCmToDpi(repeatCm: number, tilePx = 2048): number {
  if (!(repeatCm > 0) || !(tilePx > 0)) return 0;
  return Math.round(tilePx / (repeatCm / CM_PER_INCH));
}

/**
 * Seam quality for a tile, 0 (perfect) to 100 (worst). Each pair is two edge
 * strips that should match when the tile repeats: the left edge vs the right
 * edge, and the top edge vs the bottom edge. Arrays are flat channel samples
 * (e.g. RGBA bytes). Returns mean absolute per-channel difference scaled 0-100.
 */
export function seamScore(pairs: { a: number[]; b: number[] }[]): number {
  let total = 0;
  let count = 0;
  for (const { a, b } of pairs) {
    const n = Math.min(a.length, b.length);
    for (let i = 0; i < n; i++) {
      total += Math.abs(a[i] - b[i]);
      count++;
    }
  }
  if (count === 0) return 0;
  return Math.round(((total / count) / 255) * 100);
}

/** At or below this score the tile is treated as seamless. */
export const SEAM_SCORE_THRESHOLD = 8;

export interface SpecSheetInput {
  repeatCm: number | null;
  dpi: number | null;
  widthPx: number;
  heightPx: number;
  repeatType: string;
  palette: { hex: string; name: string }[];
  colorCount: number;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Spec-sheet markup, rendered to PNG by sharp in the export route. Fixed
 * 1600x520 canvas: brand header, repeat/dpi/size line, repeat type, and a
 * row of up to 10 colorway swatches with hex labels.
 */
export function buildSpecSheetSvg(input: SpecSheetInput): string {
  const { repeatCm, dpi, widthPx, heightPx, repeatType, palette, colorCount } = input;
  const scaleLine =
    repeatCm && dpi
      ? `Repeat: ${repeatCm.toFixed(1)} × ${repeatCm.toFixed(1)} cm   ·   ${dpi} DPI   ·   ${widthPx} × ${heightPx} px`
      : `Repeat: scale not set   ·   ${widthPx} × ${heightPx} px`;
  const swatches = palette.slice(0, 10);
  const swW = 130;
  const swGap = 14;
  const swX0 = 60;
  const swY = 360;
  const swatchSvg = swatches
    .map((c, i) => {
      const x = swX0 + i * (swW + swGap);
      const hex = escapeXml(c.hex || "#000000");
      return `
    <rect x="${x}" y="${swY}" width="${swW}" height="90" rx="8" fill="${hex}" stroke="#d8d2c8"/>
    <text x="${x + swW / 2}" y="${swY + 118}" font-family="monospace" font-size="20" fill="#5b5249" text-anchor="middle">${hex}</text>`;
    })
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="520" viewBox="0 0 1600 520">
  <rect width="1600" height="520" fill="#f6f2ea"/>
  <text x="60" y="90" font-family="Georgia, serif" font-size="40" fill="#2b2622" letter-spacing="3">DAVI &amp; DANI — TEXTILE PRINT SPEC</text>
  <line x1="60" y1="120" x2="1540" y2="120" stroke="#d8d2c8" stroke-width="2"/>
  <text x="60" y="190" font-family="Helvetica, Arial, sans-serif" font-size="30" fill="#3a342e">${escapeXml(scaleLine)}</text>
  <text x="60" y="250" font-family="Helvetica, Arial, sans-serif" font-size="28" fill="#6b6258">Repeat type: ${escapeXml(repeatType || "unknown")}</text>
  <text x="60" y="330" font-family="Helvetica, Arial, sans-serif" font-size="24" fill="#6b6258">Colorway (${colorCount} colors)</text>${swatchSvg}
</svg>`;
}
