'use client';
import {useEffect,useState} from 'react';
import {upload} from '@vercel/blob/client';
import {applyCatalogChanges,type ManagedModel} from '@/lib/model-admin-core';
import type {ModelPose,PresetView} from '@/lib/models-registry';
const VIEWS: PresetView[]=['front','side','back','full'];
const title=(s:string)=>s.charAt(0).toUpperCase()+s.slice(1);
const derived=(s:string)=>/^(crop|low)\s*\d+$/i.test(s);
const api='/api/admin/models';

type PhotoEdit={model:ManagedModel;pose:ModelPose;view:PresetView;file?:File;preview:string;url?:string};
export default function ModelAdmin(){
 const [models,setModels]=useState<ManagedModel[]>([]),[cloud,setCloud]=useState(false),[loading,setLoading]=useState(true);
 const [selected,setSelected]=useState(''),[poseId,setPoseId]=useState(''),[frame,setFrame]=useState('crop');
 const [search,setSearch]=useState(''),[trash,setTrash]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState('');
 const [edit,setEdit]=useState<PhotoEdit|null>(null),[protect,setProtect]=useState(true),[boundary,setBoundary]=useState(25),[reviewed,setReviewed]=useState(false),[progress,setProgress]=useState(0);
 const [create,setCreate]=useState<'model'|'pose'|null>(null),[newName,setNewName]=useState(''),[newGroup,setNewGroup]=useState(''),[newFrame,setNewFrame]=useState('crop');
 const [name,setName]=useState(''),[group,setGroup]=useState(''),[description,setDescription]=useState(''),[poseName,setPoseName]=useState('');
 async function refresh(){
  setLoading(true);setError('');
  try{const r=await fetch(api,{cache:'no-store'});if(r.redirected)throw Error('Please sign in again.');const d=await r.json();if(!r.ok)throw Error(d.error);setModels(d.models);setCloud(d.cloudUploads);}
  catch(e:any){setError(e.message);}finally{setLoading(false);}
 }
 useEffect(()=>{refresh();},[]);
 const model=models.find(m=>m.id===selected);
 const pose=model?.poses.find(p=>p.id===poseId)||model?.poses[0];
 useEffect(()=>{setName(model?.name||'');setGroup(model?.character||'');setDescription(model?.pose||'');},[model?.id,model?.name,model?.character,model?.pose]);
 useEffect(()=>setPoseName(pose?.label||''),[pose?.id,pose?.label]);
 useEffect(()=>()=>{if(edit?.file)URL.revokeObjectURL(edit.preview);},[edit]);
 const num=/^studio\s*(\d+)$/i.exec(model?.id||'')?.[1];
 const hasFrames=Boolean(num && !pose?.framing && pose===model?.poses[0]);
 const framed=hasFrames && frame!=='full' ? models.find(m=>m.id===`${frame} ${num}` && !m.deleted) : model;
 const framedPose=framed===model ? pose : framed?.poses[0];
 const visible=models.filter(m=>!derived(m.id)&&Boolean(m.deleted)===trash&&`${m.name} ${m.character||''}`.toLowerCase().includes(search.toLowerCase()));
 async function mutate(body:Record<string,unknown>){
  const r=await fetch(api,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  if(r.redirected)throw Error('Please sign in again.');const d=await r.json();if(!r.ok)throw Error(d.error||'Could not save.');
  setModels(previous=>applyCatalogChanges(previous,[d.change],true));
  setMessage('Saved. The model picker and future generations use this reference library.');
  return d.change;
 }
 async function action(body:Record<string,unknown>){setBusy(true);setError('');try{return await mutate(body);}catch(e:any){setError(e.message);}finally{setBusy(false);}}
 function pick(m:ManagedModel){setSelected(m.id);setPoseId(m.poses[0]?.id||'');setFrame('crop');setMessage('');}
 function choosePhoto(m:ManagedModel,p:ModelPose,view:PresetView,file:File){
  if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>20*1024*1024){setError('Choose a PNG, JPEG or WebP no larger than 20 MB.');return;}
  setEdit({model:m,pose:p,view,file,preview:URL.createObjectURL(file)});setProtect(view!=='back' && !/^low /.test(m.id) && p.framing!=='low');setBoundary(view==='full'?16:25);setReviewed(false);setProgress(0);setError('');
 }
 async function savePhoto(){
  if(!edit)return;setBusy(true);setError('');
  try{
   let url=edit.url;
   if(!url && edit.file){
    if(cloud){const ext=edit.file.type==='image/jpeg'?'jpg':edit.file.type.split('/')[1];const blob=await upload(`model-admin/photos/${crypto.randomUUID()}.${ext}`,edit.file,{access:'public',handleUploadUrl:`${api}/upload`,onUploadProgress:e=>setProgress(e.percentage)});url=blob.url;}
    else{const form=new FormData();form.append('file',edit.file);const r=await fetch(`${api}/upload`,{method:'POST',body:form});const d=await r.json();if(!r.ok)throw Error(d.error);url=d.url;}
    setEdit({...edit,url});
   }
   await mutate({action:'setPhoto',modelId:edit.model.id,poseId:edit.pose.id,view:edit.view,url,expectedUrl:edit.pose.views[edit.view]?.publicPath||'',...(protect?{protectedPercent:boundary}:{})});
   setEdit(null);
  }catch(e:any){setError(e.message);}finally{setBusy(false);}
 }
 async function createEntry(e:React.FormEvent){
  e.preventDefault();const c=await action(create==='model'?{action:'createModel',name:newName,character:newGroup}:{action:'createPose',modelId:model?.id,label:newName,framing:newFrame});
  if(c){if(create==='model'){setSelected(c.modelId);setPoseId('');setTrash(false);}else setPoseId(c.poseId);setCreate(null);setNewName('');setNewGroup('');}
 }
 return <main className="reference-admin">
  <header className="ra-header"><div><a href="/model-studio">← Model Studio</a><h1>Models &amp; pose references</h1><p>Manage the photos used by Model Studio on desktop and phone.</p><a href="/reference-identity-studio">Create reference identities ↗</a></div><button onClick={refresh} disabled={busy||loading}>Refresh</button></header>
  {error&&<p role="alert" className="ra-error">{error} <a href="/login?next=/admin/models">Sign in</a></p>}
  {message&&<p role="status" className="ra-success">{message}</p>}
  <div className="ra-layout"><aside className="ra-library">
   <button className="ra-primary" onClick={()=>{setCreate('model');setNewName('');}}>Add model</button>
   <input aria-label="Search models" placeholder="Search models" value={search} onChange={e=>setSearch(e.target.value)}/>
   <div className="ra-tabs"><button aria-pressed={!trash} onClick={()=>setTrash(false)}>Models</button><button aria-pressed={trash} onClick={()=>setTrash(true)}>Trash</button></div>
   {loading?<p>Loading references…</p>:visible.length===0?<p>No models found.</p>:visible.map(m=><button className={`ra-model ${selected===m.id?'selected':''}`} key={m.id} onClick={()=>pick(m)}>{m.poses[0]?.publicPath&&<img src={m.poses[0].publicPath} alt=""/>}<span><b>{m.name}</b><small>{m.character||'Custom'} · {m.poses.filter(p=>!p.deleted).length} pose sets</small></span></button>)}
  </aside><section className="ra-content">
   {!model?<div className="ra-empty"><h2>Choose a model</h2><p>Select a model to see its reference photos, or add a new one.</p></div>:<>
    <form className="ra-details" onSubmit={e=>{e.preventDefault();action({action:'updateModel',modelId:model.id,name,character:group,pose:description});}}>
     <label>Model name<input value={name} required maxLength={100} onChange={e=>setName(e.target.value)}/></label>
     <label>Model group<input value={group} maxLength={100} placeholder="Celine, Vision, or a new name" onChange={e=>setGroup(e.target.value)}/></label>
     <label>Pose description<input value={description} maxLength={100} placeholder="Arms relaxed" onChange={e=>setDescription(e.target.value)}/></label>
     <button disabled={busy}>Save details</button>
     <button type="button" className="ra-danger" disabled={busy} onClick={()=>{if(model.deleted||window.confirm(`Move ${model.name} and its references to Trash? Existing generated images are kept.`))action({action:model.deleted?'restoreModel':'deleteModel',modelId:model.id});}}>{model.deleted?'Restore model':'Delete model'}</button>
    </form>
    {model.deleted?<p>This model is in Trash. Restore it to use or edit its references.</p>:<>
     <div className="ra-posebar"><label>Pose set<select value={pose?.id||''} onChange={e=>setPoseId(e.target.value)}>{!model.poses.length&&<option value="">No pose sets yet</option>}{model.poses.map(p=><option key={p.id} value={p.id}>{p.label}{p.deleted?' · Deleted':''}</option>)}</select></label><button disabled={busy} onClick={()=>{setCreate('pose');setNewName('');}}>Add pose set</button></div>
     {pose&&<>
      <form className="ra-posebar" onSubmit={e=>{e.preventDefault();action({action:'updatePose',modelId:model.id,poseId:pose.id,label:poseName});}}><label>Pose name<input value={poseName} required maxLength={100} onChange={e=>setPoseName(e.target.value)}/></label><button disabled={busy}>Rename pose</button><button type="button" className="ra-danger" disabled={busy} onClick={()=>{if(pose.deleted||window.confirm(`Move ${pose.label} to Trash?`))action({action:pose.deleted?'restorePose':'deletePose',modelId:model.id,poseId:pose.id});}}>{pose.deleted?'Restore pose':'Delete pose'}</button></form>
      {!pose.deleted&&<>
       {hasFrames&&<div className="ra-frame"><label>Reference framing<select value={frame} onChange={e=>setFrame(e.target.value)}><option value="crop">Tops · head to thigh</option><option value="low">Pants · waist down</option><option value="full">Full body</option></select></label><p>Each framing has its own photos. The Full slot always uses the full-body reference.</p></div>}
       <div className="ra-photos">{VIEWS.map(view=>{
        const target=view==='full'?model:framed;const targetPose=view==='full'?pose:framedPose;
        const photo=targetPose?.views[view];
        return <article className="ra-photo" key={view}><h3>{title(view)}</h3><div className="ra-photo-preview">{photo?<img src={photo.publicPath} alt={`${model.name} ${view} reference`}/>:<span>Missing {view} photo</span>}</div>
         <p className={photo?'':'ra-warning'}>{photo?'Reference available':'Add this view before generating it.'}</p>
         {target&&targetPose?<div className="ra-actions"><label className={`ra-file ${busy?'disabled':''}`}>{photo?'Replace photo':'Upload photo'}<input aria-label={`${photo?'Replace':'Upload'} ${view} photo`} type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={e=>{const f=e.target.files?.[0];if(f)choosePhoto(target,targetPose,view,f);e.target.value='';}}/></label>
          {photo&&<><a href={photo.publicPath} target="_blank" rel="noreferrer">Original ↗</a><button disabled={busy} className="ra-danger" onClick={()=>{if(window.confirm(`Remove the ${view} reference? This view will be unavailable until you upload another photo.`))action({action:'removePhoto',modelId:target.id,poseId:targetPose.id,view,expectedUrl:photo.publicPath});}}>Remove</button>
          {photo.publicPath.includes('model-admin/photos/')&&<button disabled={busy} onClick={()=>{setEdit({model:target,pose:targetPose,view,preview:photo.publicPath,url:photo.publicPath});setProtect(true);setBoundary(photo.protection?Math.round(photo.protection.protectedRows/photo.protection.height*100):25);setReviewed(false);}}>Face protection</button>}</>}
         </div>:<p>No separate framing installed. Choose Full body to edit the source reference.</p>}
        </article>;
       })}</div>
       <p className="ra-help">PNG, JPEG or WebP · up to 20 MB · maximum 4096 pixels per side. Original files are stored without resizing or sharpening. Upload each view into its named slot.</p>
      </>}
     </>}
    </>}
   </>}
  </section></div>
  {create&&<div className="ra-scrim"><form className="ra-dialog" role="dialog" aria-modal="true" aria-label={`Add ${create}`} onSubmit={createEntry}><h2>Add {create==='model'?'model':'pose set'}</h2><label>Name<input autoFocus required maxLength={100} value={newName} onChange={e=>setNewName(e.target.value)}/></label>{create==='model'?<label>Model group<input value={newGroup} maxLength={100} placeholder="Celine, Vision, or a new name" onChange={e=>setNewGroup(e.target.value)}/></label>:<label>Front, side and back framing<select value={newFrame} onChange={e=>setNewFrame(e.target.value)}><option value="crop">Tops · head to thigh</option><option value="low">Pants · waist down</option><option value="full">Full body</option></select></label>}<p>{create==='model'?'Next, add a pose set and upload its photos.':'You can upload front, side, back and full photos individually.'}</p><div className="ra-actions"><button type="button" disabled={busy} onClick={()=>setCreate(null)}>Cancel</button><button className="ra-primary" disabled={busy}>{busy?'Saving…':'Create'}</button></div></form></div>}
  {edit&&<div className="ra-scrim"><section className="ra-dialog ra-upload" role="dialog" aria-modal="true" aria-label="Review reference photo"><h2>{edit.model.name} · {title(edit.view)}</h2><div className="ra-review-image"><img src={edit.preview} alt="New reference preview"/>{protect&&<div className="ra-boundary" style={{top:`${boundary}%`}}><span>Protected above</span></div>}</div>
   <label className="ra-check"><input type="checkbox" checked={protect} onChange={e=>{setProtect(e.target.checked);setReviewed(false);}}/>Protect original face pixels</label>
   {protect?<><p>Place the line below the entire face and above the garment. Pixels above it stay original during Simple garment swap.</p><label>Protection boundary · {boundary}%<input aria-label="Protection boundary" type="range" min="1" max="80" step="1" value={boundary} onChange={e=>{setBoundary(Number(e.target.value));setReviewed(false);}}/></label><label className="ra-check"><input type="checkbox" checked={reviewed} onChange={e=>setReviewed(e.target.checked)}/>I checked that the entire face is above the line.</label></>:<p>Back and pants-only photos need no face boundary. A visible face needs reviewed protection to use Simple garment swap.</p>}
   {error&&<p role="alert" className="ra-error">{error}</p>}
   <div className="ra-actions"><button disabled={busy} onClick={()=>setEdit(null)}>Cancel</button><button className="ra-primary" disabled={busy||(protect&&!reviewed)} onClick={savePhoto}>{busy?`Saving${progress>0?' '+Math.round(progress)+'%':'…'}`:'Save photo'}</button></div>
  </section></div>}
 </main>;
}
