/**
 * The Faire extension's pure Model Studio rules (model_shots_core.js), copied verbatim into core.cjs by
 * scripts/sync-model-shots-core.sh. The web Model Studio imports them from here so a run planned on the
 * web and one planned in the extension get the same setup key, framing, borrow rules and file names.
 */
import coreModule from "./core.cjs";

export type View = "front" | "side" | "back" | "full";
export type Category = "pants" | "skirt" | "top" | "outerwear" | "dress" | "set" | "unknown";
export interface Known { styleCode?: string; title?: string; description?: string; fabric?: string; type?: string; hem?: string; category?: string }

/* The core is untyped JS; these are the members the web page calls. */
export interface ModelShotsCore {
  VIEWS: View[];
  VIEW_LABEL: Record<View, string>;
  AUTO_MODEL: string;
  categoryFor(known: Known): Category;
  hemFor(known: Known): "" | "long" | "mid" | "short";
  planLabel(category: Category, hem: string): string;
  layerFraming(category: Category, hem: string): "low" | "full" | "knee" | "crop";
  viewsFor(category: Category): View[];
  isBottoms(category: Category): boolean;
  shotFilename(style: string, view: View, color?: string, seq?: number): string;
  garmentRefs(urls: string[]): string[];
  photoColor(style: string, colors: string[], filename: string): string;
  groupByColor(style: string, colors: string[], photos: unknown[], colorImgs?: unknown, runColor?: string): unknown;
  elapsedText(ms: number): string;
  // Everything else stays reachable untyped.
  [name: string]: unknown;
}

const core = coreModule as unknown as ModelShotsCore;
export default core;
