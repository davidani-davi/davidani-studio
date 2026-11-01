import type { AutoContour } from './model-admin-core';
import type { UserModel } from './user-assets';
import { arrangeViews, SET_VIEWS, type SetView, type ViewRead } from './view-arrange';

export type DraftOutlineDeps = {
  detect: (url: string, view: SetView) => Promise<AutoContour | null>;
  read: (url: string) => Promise<ViewRead | null>;
  save: (model: UserModel, contours: UserModel['contours'], views: UserModel['views']) => Promise<UserModel>;
};

/**
 * Prepares a Listing Team set for Simple garment swap: with `arrange`, moves photos saved under the wrong view
 * (lib/view-arrange.ts), then outlines every view that has no outline or whose photo moved. Views that kept their
 * photo and their outline are untouched, so their renders do not change.
 *
 * A recast set (one with poses) is left alone: its views come from the shoot tags and every pose's outline was
 * checked against its pixels at upload (lib/pose-upload.ts). A recast outline is bound to its photo, not its view,
 * so when a photo moves its recast outline moves with it instead of being detected again.
 */
export async function outlineDraftSet(model: UserModel, deps: DraftOutlineDeps, opts: { arrange: boolean }) {
  const present = SET_VIEWS.filter((v) => model.views[v]);
  if (model.poses?.length) {
    return {
      model,
      arranged: null,
      rechecked: [] as SetView[],
      outlines: Object.fromEntries(present.map((v) => [v, model.contours?.[v]?.kind ?? 'missing'])) as Record<SetView, string>,
    };
  }
  const views: UserModel['views'] = { ...model.views };
  let moved: Partial<Record<SetView, SetView>> | null = null;
  if (opts.arrange && present.length > 1) {
    const reads = await Promise.all(present.map((v) => deps.read(model.views[v]!).catch(() => null)));
    moved = arrangeViews(Object.fromEntries(present.map((v, i) => [v, reads[i]])));
    if (moved) for (const [to, from] of Object.entries(moved) as [SetView, SetView][]) views[to] = model.views[from]!;
  }
  const keep = Object.fromEntries(Object.entries(model.contours || {}).filter(([v]) => !moved?.[v as SetView])) as NonNullable<UserModel['contours']>;
  for (const [to, from] of Object.entries(moved || {}) as [SetView, SetView][]) {
    const carried = model.contours?.[from];
    if (carried?.source === 'recast-mask-v1') keep[to] = carried;
  }
  const rechecked = present.filter((v) => !keep?.[v]);
  const found = await Promise.all(rechecked.map((v) => deps.detect(views[v]!, v).catch((e) => {
    console.warn('[user-models] draft outline failed', v, e?.message);
    return null;
  })));
  const contours = { ...keep, ...Object.fromEntries(rechecked.flatMap((v, i) => (found[i] ? [[v, found[i]]] : []))) };
  const saved = moved || found.some(Boolean) ? await deps.save(model, contours, views) : model;
  return {
    model: saved,
    arranged: moved,
    rechecked,
    outlines: Object.fromEntries(present.map((v) => [v, saved.contours?.[v]?.kind ?? 'missing'])) as Record<SetView, string>,
  };
}
