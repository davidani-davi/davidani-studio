import { erpPost } from "./erp-category";
import { regularizeStyle } from "./erp-photos";

/**
 * Resolve a partial style code to the styles it could mean.
 *
 * Operators do not type whole style codes. They type the number off a tag or a
 * spreadsheet — "52056" — and the gallery crawl needs the exact code, so the
 * picker reported that the ERP held nothing for a style that has four.
 *
 * The ERP's own barcode search already does prefix/substring matching, and it
 * is the same endpoint the gallery crawl uses to find colourways, so this costs
 * one extra call and no new surface.
 */

export interface StyleCandidate {
  style: string;
  category: string | null;
  /** How many colourways the ERP has rows for. */
  colorways: number;
}

interface BarcodeRow {
  idStyle?: string;
  color?: string;
  category?: string;
}

/**
 * Distinct styles in a barcode result, most relevant first.
 *
 * Plus twins collapse into their regular twin, because that is where the
 * photos are filed and offering both would be offering the same gallery twice.
 * An exact match on what was typed sorts first; the rest keep the ERP's order,
 * which puts the base style ahead of its variants.
 */
export function candidatesFromRows(rows: BarcodeRow[], query: string): StyleCandidate[] {
  const asked = regularizeStyle(query);
  const byStyle = new Map<string, { category: string | null; colors: Set<string> }>();
  for (const row of rows) {
    const raw = String(row.idStyle ?? "").trim();
    if (!raw) continue;
    const style = regularizeStyle(raw);
    const entry = byStyle.get(style) ?? { category: null, colors: new Set<string>() };
    if (!entry.category && row.category) entry.category = String(row.category).trim() || null;
    if (row.color) entry.colors.add(String(row.color));
    byStyle.set(style, entry);
  }
  const all = [...byStyle.entries()].map(([style, entry]) => ({
    style,
    category: entry.category,
    colorways: entry.colors.size,
  }));
  const exact = all.filter((c) => c.style === asked);
  return [...exact, ...all.filter((c) => c.style !== asked)];
}

/** Ask the ERP which styles a typed fragment could mean. Never throws. */
export async function searchStyles(query: string): Promise<StyleCandidate[]> {
  const key = query.trim();
  if (!key) return [];
  const body = await erpPost("/data/Style.barcode.Json.asp", {
    start: "0",
    limit: "200",
    fields: "idStyle",
    query: key,
  });
  if (!body) return [];
  try {
    // Same paren-wrapped pseudo-JSON as the rest of the ERP.
    const parsed = JSON.parse(body.trim().replace(/^\(/, "").replace(/\)$/, ""));
    return candidatesFromRows(parsed?.results || parsed?.rows || [], key);
  } catch {
    return [];
  }
}
