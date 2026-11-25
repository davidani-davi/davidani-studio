/**
 * The Faire extension's pure Model Studio rules (model_shots_core.js), copied verbatim into core.cjs by
 * scripts/sync-model-shots-core.sh. The web Model Studio imports them from here so a run planned on the
 * web and one planned in the extension get the same setup key, framing, borrow rules and file names.
 */
import coreModule from "./core.cjs";

export type View = "front" | "side" | "back" | "full";
export type Category = "pants" | "skirt" | "top" | "outerwear" | "dress" | "set" | "unknown";
export type FitSource = "style" | "reference";
/** A catalogue pose as GET /api/model-shots lists it. */
export interface CorePose { id: string; label?: string; preview?: string; previews?: Partial<Record<string, string | undefined>>; references?: Record<string, Partial<Record<View, unknown>>> }
/** A catalogue model (a pose set) as GET /api/model-shots lists it. */
export interface CoreModel {
  id: string; name?: string; categories?: string[]; referenceKind?: string; userAdded?: boolean; managed?: boolean; createdAt?: string;
  wears?: string; character?: string; person?: string; expression?: string; poseKey?: string; pose?: string; autoPool?: boolean; fullLength?: boolean; poses: CorePose[];
}
export interface CoreLook {
  key: string; label: string; own: boolean; draft?: boolean; createdAt?: string;
  plates: { modelId: string; poseId: string; expression: string; pose: CorePose }[];
}
/** The fields the core reads and writes on a view slot; the page adds its own. */
export interface CoreSlot {
  view: View; status: "queued" | "running" | "done" | "failed"; url: string; error: string; approved: boolean;
  startedAt?: number; history?: string[]; historyProvenance?: Record<string, unknown>; editMode?: string;
  preservation?: unknown; faceCheck?: unknown; reference?: unknown; garmentInputs?: unknown; fromFront?: string;
  savedId?: string; note?: string; uploaded?: unknown; uploadFilename?: string;
}
export interface Known { styleCode?: string; title?: string; description?: string; fabric?: string; type?: string; hem?: string; category?: string; color?: string }

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
  // The web Model Studio (components/model-studio) calls these.
  FULL_BASE_MISSING: string;
  FIT_SOURCES: Record<FitSource, string>;
  fullBaseIssue(category: Category, pose: CorePose | undefined, hem: string, fullBase: string): string;
  referencesFor(category: Category, pose: CorePose | undefined, hem: string): Partial<Record<View, unknown>> | undefined;
  platesFor(category: Category, models: CoreModel[]): { models: CoreModel[]; filtered: boolean; note: string };
  looksFor(category: Category, models: CoreModel[]): { looks: CoreLook[]; others: CoreModel[]; note: string; filtered: boolean };
  lookOf(looks: CoreLook[], modelId: string, poseId?: string): CoreLook | null;
  expressionLabel(expression: string): string;
  previewFor(category: Category, pose: CorePose | undefined, hem: string): string;
  previewCropFor(category: Category, pose: CorePose | undefined, hem: string, draft?: boolean): { top: number; bottom: number } | null;
  newRun(category: Category): CoreSlot[];
  fixNote(text: string): string;
  fitSourceOf(value: unknown): FitSource;
  redoSlot<S extends CoreSlot>(slot: S): S;
  restorePrevious<S extends CoreSlot>(slot: S): S;
  anchorFor(slots: CoreSlot[], view: View): string;
  staleViews(slots: CoreSlot[]): number[];
  markOlderFront<S extends CoreSlot>(slots: S[], previousFront?: string): S[];
  previewAction(slots: CoreSlot[], sameSetup: boolean, waiting?: View[]): { kind: "front" | "remaining"; indexes: number[]; label: string };
  setupChanges(oldKey: string, newKey: string): string[];
  setupChangeNote(changes: string[], frontTicked: boolean): string;
  otherColorNotes(drafts: Record<string, unknown>, ownColor: string, limit?: number): string[];
  approvedShots<S extends CoreSlot>(slots: S[]): S[];
  runSummary(slots: CoreSlot[]): string;
  latestPerView<T extends { view: string; savedAt?: number }>(saved: T[]): T[];
  loadSavedShot<S extends CoreSlot>(slots: S[], shot: { id: string; view: string; url: string; editMode?: string }): S[];
  savedMatch<T extends { id: string; url: string; source?: string }>(slot: CoreSlot, saved: T[]): T | null;
  unsavedShots<S extends CoreSlot>(slots: S[], saved: { id: string; url: string; source?: string }[]): S[];
  syncConflictText(editor: { self: boolean; name: string; rendering: boolean } | null, time?: string): { message: string; use: string };
  // Everything else stays reachable untyped.
  [name: string]: unknown;
}

const core = coreModule as unknown as ModelShotsCore;
export default core;
