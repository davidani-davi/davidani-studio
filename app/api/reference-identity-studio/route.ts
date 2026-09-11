import {after,NextResponse} from 'next/server';
import {adminAllowed} from '@/lib/model-admin-auth';
import {inspectAdminPhoto} from '@/lib/model-admin-photo';
import {appendCatalogChange,readCatalogChanges,type ReferencePhoto} from '@/lib/model-admin';
import {createShotTask,readShotTask,type ShotTask} from '@/lib/shot-tasks';
import {createIdentitySet,listIdentitySets,readIdentitySet} from '@/lib/reference-identity-store';
import {renderIdentityView} from '@/lib/reference-identity';
import {IDENTITY_MASTERS,IDENTITY_PROMPT,IDENTITY_VIEWS,identityTaskId,validIdentitySetId,type IdentitySet,type IdentityView} from '@/lib/reference-identity-core';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=800;
const json=(v:unknown,status=200)=>NextResponse.json(v,{status,headers:{'Cache-Control':'no-store'}});
async function detail(set:IdentitySet){
  const entries=await Promise.all(IDENTITY_VIEWS.filter(v=>set.inputs[v]).map(async v=>{
    const task=await readShotTask(identityTaskId(set.id,v));
    // The worker has at most 800 seconds. Don't trap a user behind a disabled
    // Generate button if an instance died without writing its final status.
    if((!task||task.status==='running')&&Date.now()-(task?.createdAt||Date.parse(set.createdAt))>900_000)
      return [v,{id:identityTaskId(set.id,v),status:'failed',result:{error:'This view timed out. You can select it and generate again.'}}];
    return [v,task];
  }));
  return {...set,jobs:Object.fromEntries(entries)};
}
export async function GET(req:Request){
  if(!await adminAllowed(req))return json({error:'Sign in to use Reference Identity Studio.'},401);
  try{
    const id=new URL(req.url).searchParams.get('id');
    if(id){const set=await readIdentitySet(id);return set?json(await detail(set)):json({error:'Reference set not found.'},404);}
    return json({identities:IDENTITY_MASTERS,prompt:IDENTITY_PROMPT,sets:await listIdentitySets(),cloudUploads:Boolean(process.env.BLOB_READ_WRITE_TOKEN)});
  }catch{return json({error:'Reference studio storage is unavailable. Please retry.'},503);}
}
export async function POST(req:Request){
  if(!await adminAllowed(req))return json({error:'Sign in to use Reference Identity Studio.'},401);
  let b:any;try{b=await req.json();}catch{return json({error:'Invalid request.'},400);}
  try{
    if(!validIdentitySetId(b.id))throw Error('Invalid set ID.');
    if(b.action==='save'){
      const set=await readIdentitySet(b.id);if(!set)return json({error:'Reference set not found.'},404);
      const modelId=`identity-${set.id}`;
      const changes=await readCatalogChanges();
      if(changes.some(c=>c.modelId===modelId&&c.create))return json({ok:true,modelId,alreadySaved:true});
      if(typeof b.name!=='string'||!b.name.trim()||b.name.trim().length>100)throw Error('Enter a reference set name of 1–100 characters.');
      if(!Array.isArray(b.views)||!b.views.length||b.views.some((v:IdentityView)=>!IDENTITY_VIEWS.includes(v)))throw Error('Select completed views to save.');
      const photos:Partial<Record<IdentityView,ReferencePhoto>>={};
      for(const view of b.views as IdentityView[]){
        const task=await readShotTask(identityTaskId(set.id,view));
        if(!set.inputs[view]||task?.status!=='done'||!task.result?.imageUrl||task.result?.persistenceWarning)throw Error(`The ${view} image is not ready to save.`);
        const protection=b.protection?.[view];
        if(view!=='back'&&(b.reviewed!==true||typeof protection!=='number'))throw Error('Review the face protection line on each selected image before saving.');
        photos[view]=await inspectAdminPhoto(String(task.result.imageUrl),protection);
      }
      await appendCatalogChange({kind:'model',modelId,create:true,patch:{name:b.name.trim(),character:set.identity.name,pose:set.name},referenceSet:{poseId:`pose-${set.id}`,label:set.name,photos}});
      return json({ok:true,modelId});
    }
    if(b.action!=='generate')throw Error('Unknown action.');
    const master=IDENTITY_MASTERS.find(m=>m.id===b.identityId);
    if(!master)throw Error('Choose a Celine or Vision identity.');
    if(typeof b.name!=='string'||!b.name.trim()||b.name.trim().length>100)throw Error('Enter a set name of 1–100 characters.');
    if(!b.inputs||typeof b.inputs!=='object'||Array.isArray(b.inputs))throw Error('Upload at least one view.');
    const keys=Object.keys(b.inputs);
    if(!keys.length||keys.some(v=>!IDENTITY_VIEWS.includes(v as IdentityView)))throw Error('Choose front, side, back or full.');
    const inputs:IdentitySet['inputs']={};
    await Promise.all(keys.map(async key=>{
      const v=key as IdentityView,input=b.inputs[v];
      if(typeof input?.url!=='string'||typeof input?.filename!=='string'||input.filename.length>200)throw Error('Invalid source photo.');
      await inspectAdminPhoto(input.url);
      inputs[v]={url:input.url,filename:input.filename};
    }));
    const set:IdentitySet={id:b.id,name:b.name.trim(),createdAt:new Date().toISOString(),identity:{id:master.id,name:master.name,url:master.url,filename:master.url.split('/').pop()!},inputs,prompt:IDENTITY_PROMPT,modelId:'gpt-image-25'};
    const reserved=await createIdentitySet(set);
    let actual=set;
    if(!reserved){
      const previous=await readIdentitySet(set.id);
      if(!previous)throw Error('Submission is being saved. Retry in a moment.');
      if(previous.identity.id!==set.identity.id||previous.name!==set.name||IDENTITY_VIEWS.some(v=>JSON.stringify(previous.inputs[v])!==JSON.stringify(set.inputs[v])))return json({error:'This request ID already belongs to another set.'},409);
      actual=previous;
    }
    const tasks:Array<{view:IdentityView;task:ShotTask}>=[];
    after(async()=>{await Promise.allSettled(tasks.map(({view,task})=>renderIdentityView(actual,view,task)));});
    for(const view of IDENTITY_VIEWS.filter(v=>actual.inputs[v])){
      const now=Date.now(),task:ShotTask={id:identityTaskId(actual.id,view),view,status:'running',createdAt:now,updatedAt:now};
      if(await createShotTask(task))tasks.push({view,task});
    }
    return json(await detail(actual),202);
  }catch(e:any){return json({error:e.message||'Could not create reference images.'},400);}
}
