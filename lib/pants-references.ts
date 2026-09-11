import type { HumanModel, PresetView } from './models-registry';
import references from './pants-references.json';

export const PANTS_VIEWS: PresetView[] = ['front', 'side', 'back'];
export const PANTS_REFERENCE_IDS = ['studio 103', ...references.map(r => `pants-${r.style.toLowerCase()}`)];
export function isPantsReference(modelId: string | null | undefined): boolean {
  return PANTS_REFERENCE_IDS.includes(modelId || '');
}
export function pantsReferences<T extends { id: string }>(models: T[]): T[] {
  return PANTS_REFERENCE_IDS.flatMap(id => models.filter(m => m.id === id));
}
export function isPantsStyle(style: string): boolean {
  return /^[DP](?:[EW])?P\d/i.test(style.trim());
}
/** Original waist-down ERP photographs, shared across identities. Donuts keeps
 * its existing files and pose ID so saved selections still resolve. */
export function withPantsReferences(models: HumanModel[]): HumanModel[] {
  const base = models.map(m => m.id !== 'studio 103' ? m : {
    ...m, name: 'DP52083 · Donuts', character: undefined, expression: undefined,
    poses: m.poses.map(p => ({ ...p, framing: 'low' as const,
      views: Object.fromEntries(PANTS_VIEWS.filter(v => p.views[v]).map(v => [v, p.views[v]])) })),
  });
  return [...base, ...references.map(r => ({
    id: `pants-${r.style.toLowerCase()}`, name: `${r.style} · ${r.label}`,
    wears: r.silhouette === 'shorts' ? 'shorts' : 'pants', lowOk: true,
    silhouette: r.silhouette, autoPool: true,
    poses: [{id: r.style.toLowerCase(), label: r.label, publicPath: r.views.front.publicPath,
      filename: r.views.front.filename, subdir: '', framing: 'low' as const, views: r.views}],
  }))];
}
