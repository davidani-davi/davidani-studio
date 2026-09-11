import type { ManagedModel } from './model-admin-core';
import type { ModelPose } from './models-registry';
import { isPantsReference } from './pants-references';

export type LibrarySection = 'tops' | 'bottoms' | 'all';
export const isDerivedReference = (id: string) => /^(crop|low)\s*\d+$/i.test(id);

// Classify by the reference's framing, not the trousers a full-body model wears.
// A custom model with both kinds of pose belongs in both sections.
export function matchesLibrarySection(model: ManagedModel, section: LibrarySection): boolean {
  if (section === 'all') return true;
  if (isPantsReference(model.id)) return section === 'bottoms';
  const active = model.poses.filter(p => !p.deleted);
  const poses = active.length ? active : model.poses;
  if (!poses.length) return section === 'tops';
  return poses.some(p => section === 'bottoms' ? p.framing === 'low' : p.framing !== 'low');
}

export function libraryPoses(model: ManagedModel | undefined, section: LibrarySection): ModelPose[] {
  if (!model) return [];
  if (section === 'all' || isPantsReference(model.id)) return model.poses;
  return model.poses.filter(p => section === 'bottoms' ? p.framing === 'low' : p.framing !== 'low');
}

export function libraryLabel(model: ManagedModel): string {
  const top = matchesLibrarySection(model, 'tops'), bottom = matchesLibrarySection(model, 'bottoms');
  return top && bottom ? 'Tops & bottoms' : bottom ? 'Bottoms' : 'Tops';
}
