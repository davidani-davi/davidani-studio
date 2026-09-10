import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { adminAllowed } from '@/lib/model-admin-auth';
import { appendCatalogChange, applyCatalogChanges, readCatalogChanges, VIEWS, type CatalogChange } from '@/lib/model-admin';
import { listBaseHumanModels } from '@/lib/models-registry';
import { inspectAdminPhoto } from '@/lib/model-admin-photo';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;
const json = (value: unknown, status=200) => NextResponse.json(value,{status,headers:{'Cache-Control':'no-store'}});
async function catalog() {
  const [base, changes] = await Promise.all([listBaseHumanModels(),readCatalogChanges()]);
  return applyCatalogChanges(base,changes,true);
}
export async function GET(req: Request) {
  if (!await adminAllowed(req)) return json({error:'Sign in to manage references.'},401);
  try { return json({models:await catalog(), cloudUploads:Boolean(process.env.BLOB_READ_WRITE_TOKEN)}); }
  catch { return json({error:'Reference library unavailable. Please retry.'},503); }
}
export async function POST(req: Request) {
  if (!await adminAllowed(req)) return json({error:'Sign in to manage references.'},401);
  let b: any;
  try { b=await req.json(); } catch { return json({error:'Invalid request.'},400); }
  try {
    const models = await catalog();
    let change: Omit<CatalogChange,'id'|'at'>;
    const text = (v: unknown, required=false) => {
      if (typeof v !== 'string' || v.trim().length > 100 || (required && !v.trim())) throw Error('Enter a name of 1–100 characters.');
      return v.trim();
    };
    if (b.action === 'createModel') {
      change = {kind:'model',modelId:`custom-${randomUUID()}`,create:true,patch:{name:text(b.name,true),character:text(b.character || '')}};
    } else {
      const model = models.find(m=>m.id===b.modelId);
      if (!model) return json({error:'Model not found.'},404);
      const pose = model.poses.find(p=>p.id===b.poseId);
      if (b.action === 'updateModel') change={kind:'model',modelId:model.id,patch:{name:text(b.name,true),character:text(b.character || ''),pose:text(b.pose || '')}};
      else if (b.action === 'deleteModel' || b.action === 'restoreModel') change={kind:'model',modelId:model.id,patch:{deleted:b.action==='deleteModel'}};
      else {
        if(model.deleted) throw Error('Restore this model before editing its poses.');
        if(b.action==='createPose') {
          if(!['crop','low','full'].includes(b.framing)) throw Error('Choose the reference framing.');
          change={kind:'pose',modelId:model.id,poseId:`pose-${randomUUID()}`,create:true,patch:{label:text(b.label,true),framing:b.framing}};
        } else {
          if(!pose) return json({error:'Pose not found.'},404);
          if(b.action==='updatePose') change={kind:'pose',modelId:model.id,poseId:pose.id,patch:{label:text(b.label,true)}};
          else if(b.action==='deletePose' || b.action==='restorePose') change={kind:'pose',modelId:model.id,poseId:pose.id,patch:{deleted:b.action==='deletePose'}};
          else if(b.action==='setPhoto' || b.action==='removePhoto') {
            if(pose.deleted) throw Error('Restore this pose before editing its photos.');
            if(!VIEWS.includes(b.view)) throw Error('Choose front, side, back or full.');
            if(b.expectedUrl !== (pose.views[b.view as typeof VIEWS[number]]?.publicPath || '')) return json({error:'This photo changed in another session. Refresh before replacing it.'},409);
            const photo=b.action==='setPhoto' ? await inspectAdminPhoto(String(b.url || ''), b.protectedPercent) : null;
            change={kind:'photo',modelId:model.id,poseId:pose.id,view:b.view,photo};
          } else throw Error('Unknown action.');
        }
      }
    }
    const saved = await appendCatalogChange(change);
    return json({ok:true,change:saved});
  } catch(e:any) { return json({error:e.message || 'Could not save change.'},400); }
}
