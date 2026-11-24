// The web Model Studio's state (components/model-studio). One record per style lives in the workspace
// (app/api/model-studio/workspace), so a refresh or another device opens the same setup.
import type { CoreModel, CoreSlot, FitSource, View } from "@/lib/model-shots-core";

export type Engine = "gpt25" | "gpt2" | "nano";
export const ENGINES: { id: Engine; label: string; note: string }[] = [
  { id: "gpt25", label: "GPT Image 2.5", note: "Default. Needed for borrowed photos." },
  { id: "gpt2", label: "GPT Image 2", note: "Older GPT engine." },
  { id: "nano", label: "Nano Banana Pro", note: "Google engine, 1K." },
];

/** The exact body one view was sent with (lib/model-studio/request.ts buildShotRequest). */
export type ShotRequest = Record<string, unknown> & { view: View; requestId: string };

/** One view of a run. The core's fields plus what the page needs to poll, heal and explain it. */
export interface Slot extends CoreSlot {
  jobId?: string;
  /** "submitting" until the studio answers with a task id. */
  phase?: "submitting" | "rendering";
  request?: ShotRequest;
  /** Set when the result could not be confirmed (network, long run): Resume re-sends the same request. */
  pending?: boolean;
  prompt?: string;
  engine?: string;
  modelId?: string;
  humanModelId?: string;
  poseId?: string;
  resolution?: string;
  color?: string;
  finishedAt?: number;
  healedFrom?: string;
}

/** One colour's setup, the way the extension keeps `colorDrafts`. */
export interface ColorSetup {
  /** [front, back] garment photos (full ERP URLs); back optional. */
  picked: string[];
  garmentSide: string;
  /** Bottoms only: the full-body photo the full shot is painted on. */
  fullBase: string;
  humanModelId: string;
  poseId: string;
  engine: Engine;
  fitSource: FitSource;
  /** The setup key the current slots were made with ("" = nothing run yet). */
  runKey: string;
  slots: Slot[];
  fixNote: string;
  /** #3 look sheet: one front/back/side sheet made from the approved front ("" = none). */
  sheetUrl?: string;
  /** #3: send the sheet with every later view as anchorSheetUrl (the front stays the anchor too). */
  useSheet?: boolean;
  /** #4: how many takes the next front makes (1-3). */
  variantCount?: number;
  /** #4: the takes of the last multi-take front, until one is picked. */
  takes?: Slot[];
}

/** The workspace record's `studio` value. */
export interface StudioState {
  style: string;
  title: string;
  /** Faire taxonomy word ("Dress", "Pants"…) or "" to read the category from the code and title. */
  type: string;
  /** The colour tab in use ("" = style-level photos). */
  color: string;
  /** The person the style is shot on ("" = Auto by style). */
  person: string;
  drafts: Record<string, ColorSetup>;
}

export interface Person { id: string; name: string; portrait: string; about?: string }

export interface Catalogue {
  models: (CoreModel & { person?: string })[];
  people: Person[];
}

export interface GalleryPhoto { index: number | null; label: string; thumb: string; full: string }
export interface GalleryGroup { label: string; kind: "colorway" | "styled" | "all" | "foreign"; styledWith: string[]; photos: GalleryPhoto[] }
export interface Gallery {
  style: string;
  regularizedFrom: string | null;
  resolvedFrom: string | null;
  candidates: { style: string; category: string | null; colorways: number }[];
  groups: GalleryGroup[];
}

export interface SavedShot { id: string; view: string; url: string; source?: string; savedAt: number; humanModelId?: string; editMode?: string; engine?: string; note?: string }
