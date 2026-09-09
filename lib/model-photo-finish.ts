/** Keep house-model renders faithful to photographic detail, not amplified detail. */
export function applyModelPhotoFinish(prompt: string, humanModelId: string): string {
  if (!/^(?:studio|crop|low) (97|98|99|100)$/.test(humanModelId)) return prompt;
  // These are renderer boilerplate, not garment observations. Keep product
  // features (ribbing, slub, brushed yarn, etc.) and operator notes intact.
  const restrained = prompt
    .replace(/high-detail textures/g, 'source-matched photographic detail')
    .replace(/detailed garment textures throughout/g, 'source-matched garment texture')
    .replace(/natural skin texture with visible pores and fine details/g, 'natural skin with restrained fine detail');
  const rule = 'Photographic finish: preserve the selected model identity, facial geometry, age and skin tone. ' +
    'Use gentle natural skin tonal transitions and restrained fine pores; do not reproduce embossed cheek swirls, scaly patches or artificial skin grain from an imperfect identity reference. ' +
    'Match the garment reference at the same viewing scale: preserve actual knit, slub, weave, nap, seams and folds without increasing their contrast, density or coarseness. ' +
    'Do not add sharpening halos, HDR clarity, gritty microcontrast or invented fibers to skin or clothes. Do not blur away real textile construction or make skin waxy. ' +
    'No pattern, fabric or hem from the model reference outfit may survive in the replacement garment, including its underside.';
  // Keep the rule ahead of a negative tail for consumers that strip that tail.
  const marker = restrained.search(/Negative prompt:/i);
  return marker < 0 ? `${restrained}\n\n${rule}`
    : `${restrained.slice(0, marker).trim()}\n\n${rule}\n\n${restrained.slice(marker)}`;
}
