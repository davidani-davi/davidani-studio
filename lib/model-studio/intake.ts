import type { ColorSetup, StudioState } from "./types";

/**
 * Guided intake (Model Studio upgrade #5, 2026-11-24): the "Catalog (cream set)" preset fills silent defaults, at
 * most 3 short questions appear and only for what is missing, and a one-line recipe sums the setup. Every control
 * stays visible below it: this never hides or overrides a choice already made.
 */
export interface Question { id: "front" | "person" | "back"; ask: string; why: string }

export const CATALOG_PRESET = { id: "catalog", label: "Catalog (cream set)", engine: "gpt25" as const, fitSource: "reference" as const };

/** Fill only blank fields, so a hand-made choice always wins. */
export function applyPreset(setup: ColorSetup): ColorSetup {
  return {
    ...setup,
    engine: setup.engine || CATALOG_PRESET.engine,
    fitSource: setup.fitSource || CATALOG_PRESET.fitSource,
    humanModelId: setup.humanModelId || "auto",
  };
}

export function questionsFor(state: StudioState, setup: ColorSetup, hasBackPhoto: boolean): Question[] {
  const q: Question[] = [];
  if (!setup.picked[0]) q.push({ id: "front", ask: "Which photo is the front of the garment?", why: "The front product photo decides construction and length." });
  if (!state.person && (!setup.humanModelId || setup.humanModelId === "auto"))
    q.push({ id: "person", ask: "Who wears it: Vision, Celine or Auto?", why: "Keep one model per colour gallery." });
  if (hasBackPhoto && !setup.picked[1]) q.push({ id: "back", ask: "Use the back photo for the back view?", why: "Without it the back is inferred from the front." });
  return q.slice(0, 3);
}

const ENGINE_LABEL: Record<string, string> = { gpt25: "GPT 2.5", gpt2: "GPT 2", nano: "Nano" };

export function recipeLine(state: StudioState, setup: ColorSetup, personName = ""): string {
  const who = personName || (setup.humanModelId && setup.humanModelId !== "auto" ? setup.humanModelId : "Auto by style");
  const photos = [setup.picked[0] && "front", setup.picked[1] && "back", setup.garmentSide && "side"].filter(Boolean).join(" + ") || "no photo yet";
  const fit = setup.fitSource === "style" ? "pose only" : "fit + pose";
  return [state.color || "all colours", who, ENGINE_LABEL[setup.engine] || setup.engine, fit, photos].join(" · ");
}
