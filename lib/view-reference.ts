import type { HumanModel, PresetView } from './models-registry';
import type { PlateFraming } from './plate-framing';

/** Resolve only the requested view. A missing crop may use the SAME view of
 * its parent, with explicit framing instructions; never substitute a front. */
export function viewReference(models: HumanModel[], modelId: string, poseId: string, view: PresetView, framing: PlateFraming) {
  const parentId = modelId.replace(/^(low|crop)\s+/i, 'studio ');
  const parent = models.find(m => m.id === parentId);
  const selected = models.find(m => m.id === modelId);
  if (!selected) throw new Error(`Unknown reference: ${modelId}`);
  const selectedPose = selected.poses.find(p => p.id === poseId);
  if (!selectedPose) throw new Error(`Unknown pose: ${modelId}/${poseId}`);
  const num = /^studio\s*(\d+)$/i.exec(parentId)?.[1];
  const sibling = num && framing !== 'full' && !selectedPose.framing && selectedPose === selected.poses[0] ? models.find(m => m.id === `${framing} ${num}`) : undefined;
  const candidates = sibling ? [sibling, parent || selected] : [parent || selected];
  for (const model of candidates) {
    const pose = model === selected ? selectedPose : model.poses[0];
    const file = pose?.views[view];
    if (file) return { humanModelId: model.id, poseId: pose.id, view, publicPath: file.publicPath + (/^(studio|crop) 100$/.test(model.id) && file.filename === "front.png" ? "?v=f89baab006a294cb5" : ""),
      framing, protection: file.protection, reframed: view !== 'full' && framing !== (pose.framing || (num ? 'full' : framing)) && model.id === parentId,
      synthesized: parentId === 'studio 103' && (view === 'side' || view === 'back') };
  }
  throw new Error(`Missing ${view} reference for ${selected.name}. Add a ${view} reference before generating this view.`);
}

export function referenceCoverage(models: HumanModel[], modelId: string, poseId: string) {
  return Object.fromEntries((['low','crop','full'] as const).map(framing => [framing,
    Object.fromEntries((['front','side','back','full'] as const).map(view => {
      try { return [view, viewReference(models,modelId,poseId,view,view === 'full' ? 'full' : framing)]; }
      catch { return [view, null]; }
    }))
  ]));
}
