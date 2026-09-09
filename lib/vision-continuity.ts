import type { PresetView } from './models-registry';

/** Retired side plates must not supply Vision's face or skin to new renders. */
export function visionContinuity(modelId: string, view: PresetView, anchor: string, origin: string) {
  const match = modelId.match(/^(?:studio|crop|low) (97|99)$/);
  if (!match || view === 'front') return null;
  const direction = view === 'side' ? 'Turn the same woman into a true side view.'
    : view === 'back' ? 'Turn the same woman fully away from the camera; show the back of her head and outfit, with no face visible.'
    : 'Show the same woman head to toe, including her feet, with natural full-body proportions.';
  return {
    canvasImageUrl: anchor || new URL(`/models/studio%20${match[1]}/front.png`, origin).toString(),
    rule: `Vision continuity: the canvas is the current clean front identity reference. ${direction} Change the viewpoint and framing as requested; do not preserve its front-facing pose or crop. Preserve her exact facial identity, hair color, age, natural skin finish and body proportions. Keep skin clean with restrained fine texture; do not add gritty pores, artificial grain, waxy smoothing or sharpening. The garment references remain the source of truth for the garment.`,
  };
}
