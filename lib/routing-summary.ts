import type { GarmentCategory } from "./canvas-registry";

/**
 * Turn /api/analyze's routing object into the rows the rail displays.
 *
 * WHY THIS IS NOT IN THE COMPONENT
 * --------------------------------
 * Which decision won, and whether it contradicted another one, is the whole
 * point of the panel — DWTS67099 is filed in the ERP as outerwear and is
 * really a top-and-skirt set, and not seeing that conflict cost five runs. So
 * it is logic, not markup, and it gets tests.
 *
 * The rows are deliberately ordered the way the pipeline resolves them, not
 * by importance: style code, then ERP, then what described the garment, then
 * the canvas that fell out of it. Reading top to bottom should reconstruct how
 * the studio arrived at this render.
 */

export interface RoutingPayload {
  styleCode: { prefix: string; category: GarmentCategory; authority: string } | null;
  erp: { raw: string; mapped: GarmentCategory | "ambiguous-bottom" | null } | null;
  vision: { category: GarmentCategory };
  decidedBy: string;
  overrode: { field: "erp"; value: string } | null;
  describedFrom: { kind: "gallery"; frames: number } | { kind: "intake-photo" };
}

export interface RoutingRow {
  key: "style-code" | "erp" | "described-from" | "canvas";
  label: string;
  value: string;
  /** Shown struck through before `value` — the answer that was overruled. */
  struck?: string;
  /**
   * decided    this input settled the category
   * overridden this input was available and lost
   * fallback   nothing authoritative was available
   * muted      informational only
   */
  state: "decided" | "overridden" | "fallback" | "muted";
  /** One line explaining the row when it needs explaining. */
  note?: string;
}

const CATEGORY_LABELS: Record<GarmentCategory, string> = {
  outerwear: "Outerwear",
  top: "Top",
  dress: "Dress",
  skirt: "Skirt",
  pants: "Pants",
  set: "Coordinated set",
  unknown: "Unclassified",
};

/** Human label for a canvas category, for both rows and headings. */
export function categoryLabel(c: GarmentCategory): string {
  return CATEGORY_LABELS[c] ?? "Unclassified";
}

/** ERP category strings are SHOUTED; title-case them for display. */
function tidyErp(raw: string): string {
  return raw
    .toLowerCase()
    .split(/(\s*\/\s*|\s+)/)
    .map((part) => (/^[a-z]/.test(part) ? part[0].toUpperCase() + part.slice(1) : part))
    .join("");
}

export interface CanvasSummary {
  path: string;
  isFallback: boolean;
  category: GarmentCategory;
}

export function summarizeRouting(
  routing: RoutingPayload | null | undefined,
  canvas: CanvasSummary | null | undefined
): RoutingRow[] {
  if (!routing) return [];
  const rows: RoutingRow[] = [];

  // 1. Style code — the strongest signal when it applies, absent otherwise.
  if (routing.styleCode) {
    const decided = routing.decidedBy.startsWith("style-code");
    rows.push({
      key: "style-code",
      label: "Style code",
      value: `${routing.styleCode.prefix} → ${categoryLabel(routing.styleCode.category)}`,
      state: decided ? "decided" : "muted",
      note: decided ? undefined : "Confirms the ERP rather than changing it",
    });
  } else {
    rows.push({
      key: "style-code",
      label: "Style code",
      value: "Not a recognised prefix",
      state: "muted",
      note: "Unlisted prefixes are ignored rather than guessed at",
    });
  }

  // 2. ERP category — struck through when the code outranked it.
  if (routing.erp) {
    const overridden = Boolean(routing.overrode);
    rows.push({
      key: "erp",
      label: "ERP category",
      value: overridden ? "Overridden" : tidyErp(routing.erp.raw),
      struck: overridden ? tidyErp(routing.erp.raw) : undefined,
      state: overridden ? "overridden" : "decided",
      note:
        routing.erp.mapped === "ambiguous-bottom" && !overridden
          ? "Covers skirts and trousers alike — split by the photo"
          : undefined,
    });
  } else {
    rows.push({
      key: "erp",
      label: "ERP category",
      value: "No style number",
      state: "fallback",
      note: "Category inferred from the photo alone",
    });
  }

  // 3. What described the garment.
  rows.push({
    key: "described-from",
    label: "Described from",
    value:
      routing.describedFrom.kind === "gallery"
        ? `Style gallery · ${routing.describedFrom.frames} frames`
        : "Uploaded photo",
    state: routing.describedFrom.kind === "gallery" ? "decided" : "fallback",
    note:
      routing.describedFrom.kind === "gallery"
        ? "The garment in every frame is the product"
        : "One photo cannot tell the product from what it is styled with",
  });

  // 4. The canvas that fell out of all of the above.
  if (canvas) {
    const name = canvas.path.split("/").pop() ?? canvas.path;
    rows.push({
      key: "canvas",
      label: "Canvas",
      value: canvas.isFallback ? "Empty sweep" : name.replace(/\.png$/, ""),
      state: canvas.isFallback ? "fallback" : "decided",
      note: canvas.isFallback
        ? `No approved flat lay for ${categoryLabel(canvas.category).toLowerCase()} yet — framing is described in words instead`
        : undefined,
    });
  }

  return rows;
}

/**
 * One-line summary for collapsed state and for the batch queue, where a full
 * four-row trail per thumbnail would be unreadable.
 */
export function routingHeadline(
  routing: RoutingPayload | null | undefined,
  category: GarmentCategory | null | undefined
): string {
  if (!routing || !category) return "Not analyzed yet";
  const by = routing.decidedBy.startsWith("style-code")
    ? "style code"
    : routing.decidedBy.startsWith("erp")
    ? "ERP"
    : "photo";
  return `${categoryLabel(category)} · by ${by}`;
}
