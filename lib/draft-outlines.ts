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
 */
export async function outlineDraftSet(model: UserModel, deps: DraftOutlineDeps, opts: { arrange: boolean }) {
  const present = SET_VIEWS.filter((v) => model.views[v]);
  const views: UserModel['views'] = { ...model.views };
  let moved: Partial<Record<SetView, SetView>> | null = null;
  if (opts.arrange && present.length > 1) {
    const reads = await Promise.all(present.map((v) => deps.read(model.views[v]!).catch(() => null)));
    moved = arrangeViews(Object.fromEntries(present.map((v, i) => [v, reads[i]])));
    if (moved) for (const [to, from] of Object.entries(moved) as [SetView, SetView][]) views[to] = model.views[from]!;
  }
  const keep = Object.fromEntries(Object.entries(model.contours || {}).filter(([v]) => !moved?.[v as SetView])) as UserModel['contours'];
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
