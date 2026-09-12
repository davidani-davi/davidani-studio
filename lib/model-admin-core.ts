import type { HumanModel, PresetView } from './models-registry';
export type FaceProtection = { width: number; height: number; sha256: string; protectedRows: number; transitionRows: number };
export type ReferencePhoto = { filename: string; publicPath: string; protection?: FaceProtection };
export type ManagedModel = HumanModel & { deleted?: boolean };
export type CatalogChange = {
  id: string; at: string; modelId: string; poseId?: string;
  kind: 'model' | 'pose' | 'photo';
  patch?: { name?: string; character?: string; pose?: string; deleted?: boolean; label?: string; framing?: 'crop' | 'knee' | 'low' | 'full' };
  create?: boolean; view?: PresetView; photo?: ReferencePhoto | null;
  referenceSet?: {poseId:string; label:string; photos:Partial<Record<PresetView,ReferencePhoto>>};
};
export function applyCatalogChanges(base: HumanModel[], changes: CatalogChange[], includeDeleted = false): ManagedModel[] {
  const models = structuredClone(base) as ManagedModel[];
  for (const c of [...changes].sort((a,b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id))) {
    let m = models.find(m => m.id === c.modelId);
    if (!m && c.kind === 'model' && c.create) {
      m = {id:c.modelId, name:c.patch?.name || 'New model', poses:[], userAdded:true, autoPool:false};
      if(c.referenceSet){
        const s=c.referenceSet,preview=s.photos.front||s.photos.full||s.photos.side||s.photos.back;
        m.poses=[{id:s.poseId,label:s.label,framing:'crop',views:s.photos,filename:preview?.filename||'',publicPath:preview?.publicPath||'',subdir:''}];
      }
      models.push(m);
    }
    if (!m) continue;
    m.managed = true;
    if (c.kind === 'model') {
      for (const key of ['name','character','pose','deleted'] as const) if (c.patch?.[key] !== undefined) (m as any)[key] = c.patch[key];
      continue;
    }
    let p = m.poses.find(p => p.id === c.poseId);
    if (!p && c.kind === 'pose' && c.create && c.poseId) {
      p = {id:c.poseId, label:c.patch?.label || 'New pose', publicPath:'', filename:'', subdir:'', views:{}, framing:c.patch?.framing || 'crop'};
      m.poses.push(p);
    }
    if (!p) continue;
    if (c.kind === 'pose') {
      for (const key of ['label','framing','deleted'] as const) if (c.patch?.[key] !== undefined) (p as any)[key] = c.patch[key];
    }
    if (c.kind === 'photo' && c.view) {
      if (c.photo) p.views[c.view] = c.photo;
      else delete p.views[c.view];
      // Retired alternates must not bypass a replacement or removed view.
      if (p.viewVariants) delete p.viewVariants[c.view];
    }
    const preview = p.views.front || p.views.full || p.views.side || p.views.back;
    p.publicPath = preview?.publicPath || ''; p.filename = preview?.filename || '';
  }
  // Removing a parent also retires its derived references. Restoring the
  // parent restores its children without touching their individual overrides.
  const deletedParents = new Set(models.filter(m => m.deleted).map(m => m.id));
  return models.filter(m => includeDeleted || (!m.deleted && !deletedParents.has(m.id.replace(/^(crop|knee|low)\s+/i,'studio '))))
    .map(m => ({...m, poses: m.poses.filter(p => includeDeleted || (!p.deleted && Boolean(p.publicPath)))}))
    .filter(m => includeDeleted || m.poses.length > 0);
}
