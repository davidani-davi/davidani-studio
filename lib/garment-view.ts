import type { ProductShotMode } from "@/components/PromptPanel";

/**
 * Which side of the garment the studio is working with, and how that decision
 * gets made now that it is not a control the operator sets first.
 *
 * WHY THIS MOVED
 * --------------
 * "Product shot workflow" asked for three facts before there was a photo to
 * read them from, and all three are properties of the upload:
 *
 *  - Front vs back is visible in the photograph. The operator was uploading a
 *    back shot and then telling the app it was a back shot.
 *  - A front/back contract needs two photos and is structurally impossible
 *    with one, so having two IS the mode.
 *
 * So the mode is derived here and shown in the routing rail, where the other
 * derived facts (category, canvas, description source) already live. One case
 * genuinely cannot be inferred and keeps an override: "I gave you a front
 * photo, render me the back" is a supported run — the side directive says to
 * infer the hidden side conservatively — and pure detection would delete it.
 */
export type GarmentView = "front" | "back" | "unknown";

export function parseGarmentView(raw: string | null | undefined): GarmentView {
  const value = (raw ?? "").trim().toLowerCase();
  if (value.startsWith("back")) return "back";
  if (value.startsWith("front")) return "front";
  return "unknown";
}

export interface ShotModeInputs {
  hasFrontPhoto: boolean;
  hasBackPhoto: boolean;
  /** What the analyzer saw. "unknown" when it could not tell. */
  detected: GarmentView;
  /** Set only when the operator corrected the rail. Outranks detection. */
  override?: "front" | "back" | null;
}

export function resolveShotMode(inputs: ShotModeInputs): ProductShotMode {
  // Two photos is the only thing a contract run is for, and it cannot be
  // assembled from one. Nothing the operator can say changes that, so this
  // outranks the override rather than sitting beside it.
  if (inputs.hasFrontPhoto && inputs.hasBackPhoto) return "front-back-contract";
  const view = inputs.override ?? (inputs.detected === "back" ? "back" : "front");
  return view === "back" ? "single-back" : "single-front";
}

/**
 * What the rail's view row should say, and whether it is the operator's call.
 *
 * `source` drives the wording: a detected value has to read as something the
 * studio worked out and the operator may correct, not as a setting they chose.
 */
export function viewRowState(inputs: ShotModeInputs): {
  view: "front" | "back";
  source: "contract" | "override" | "detected" | "default";
  editable: boolean;
} {
  if (inputs.hasFrontPhoto && inputs.hasBackPhoto) {
    return { view: "front", source: "contract", editable: false };
  }
  if (inputs.override) return { view: inputs.override, source: "override", editable: true };
  if (inputs.detected === "back") return { view: "back", source: "detected", editable: true };
  if (inputs.detected === "front") return { view: "front", source: "detected", editable: true };
  // No photo yet, or the analyzer could not tell. Front is the common case and
  // is what the studio did before any of this was inferred.
  return { view: "front", source: "default", editable: true };
}
