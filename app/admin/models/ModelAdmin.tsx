'use client';
import {useEffect,useState} from 'react';
import {upload} from '@vercel/blob/client';
import {applyCatalogChanges,type ManagedModel} from '@/lib/model-admin-core';
import {isDerivedReference,matchesLibrarySection,libraryPoses,libraryLabel,type LibrarySection} from '@/lib/model-library';
import type {ModelPose,PresetView} from '@/lib/models-registry';
const VIEWS: PresetView[]=['front','side','back','full'];
const title=(s:string)=>s.charAt(0).toUpperCase()+s.slice(1);
const api='/api/admin/models';

type PhotoEdit={model:ManagedModel;pose:ModelPose;view:PresetView;file?:File;preview:string;url?:string};
export default function ModelAdmin(){
 const [models,setModels]=useState<ManagedModel[]>([]),[cloud,setCloud]=useState(false),[loading,setLoading]=useState(true);
 const [selected,setSelected]=useState(''),[poseId,setPoseId]=useState(''),[frame,setFrame]=useState('crop');
 const [section,setSection]=useState<LibrarySection>('tops');
 const [search,setSearch]=useState(''),[trash,setTrash]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState('');
 const [undo,setUndo]=useState<ManagedModel|null>(null);
 const [edit,setEdit]=useState<PhotoEdit|null>(null),[progress,setProgress]=useState(0);
 const [create,setCreate]=useState<'model'|'pose'|null>(null),[newName,setNewName]=useState(''),[newGroup,setNewGroup]=useState(''),[newFrame,setNewFrame]=useState('crop');
 const [name,setName]=useState(''),[group,setGroup]=useState(''),[description,setDescription]=useState(''),[poseName,setPoseName]=useState('');
 async function refresh(){
  setLoading(true);setError('');
  try{const r=await fetch(api,{cache:'no-store'});if(r.redirected)throw Error('Please sign in again.');const d=await r.json();if(!r.ok)throw Error(d.error);setModels(d.models);setCloud(d.cloudUploads);}
  catch(e:any){setError(e.message);}finally{setLoading(false);}
 }
 useEffect(()=>{refresh();},[]);
 const model=models.find(m=>m.id===selected);
 const poses=libraryPoses(model,section);
 const pose=poses.find(p=>p.id===poseId)||poses.find(p=>!p.deleted)||poses[0];
 const bottomPose=pose?.framing==='low';
 useEffect(()=>{setName(model?.name||'');setGroup(model?.character||'');setDescription(model?.pose||'');},[model?.id,model?.name,model?.character,model?.pose]);
 useEffect(()=>setPoseName(pose?.label||''),[pose?.id,pose?.label]);
 useEffect(()=>()=>{if(edit?.file)URL.revokeObjectURL(edit.preview);},[edit]);
 const num=/^studio\s*(\d+)$/i.exec(model?.id||'')?.[1];
 const hasFrames=Boolean(num && !pose?.framing && pose===model?.poses[0]);
 const framed=hasFrames && frame!=='full' ? models.find(m=>m.id===`${frame} ${num}` && !m.deleted) : model;
 const framedPose=framed===model ? pose : framed?.poses[0];
 // Tabs always count live models; Trash is its own place with its own count, across every section.
 const live=models.filter(m=>!isDerivedReference(m.id)&&!m.deleted),trashed=models.filter(m=>!isDerivedReference(m.id)&&m.deleted);
 const visible=(trash?trashed:live.filter(m=>matchesLibrarySection(m,section))).filter(m=>`${m.name} ${m.character||''}`.toLowerCase().includes(search.trim().toLowerCase()));
 useEffect(()=>{
  if(loading) return;
  if(!visible.some(m=>m.id===selected)) {
   setSelected(visible[0]?.id||'');setPoseId('');setFrame('crop');
  }
 },[models,section,search,trash,loading,selected]);
 async function mutate(body:Record<string,unknown>){
  const r=await fetch(api,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  if(r.redirected)throw Error('Please sign in again.');const d=await r.json();if(!r.ok)throw Error(d.error||'Could not save.');
  setModels(previous=>applyCatalogChanges(previous,[d.change],true));
  setUndo(null);setMessage('Saved. The model picker and future generations use this reference library.');
  return d.change;
 }
 async function action(body:Record<string,unknown>){setBusy(true);setError('');try{return await mutate(body);}catch(e:any){setError(e.message);}finally{setBusy(false);}}
 // A delete stays on the models list with Undo, rather than jumping into Trash.
 async function trashModel(m:ManagedModel){
  if(!window.confirm(`Move ${m.name} and its references to Trash? Existing generated images are kept.`))return;
  const at=visible.findIndex(v=>v.id===m.id),next=visible[at+1]||visible[at-1];
  if(!await action({action:'deleteModel',modelId:m.id}))return;
  setSelected(next&&next.id!==m.id?next.id:'');setPoseId('');setFrame('crop');
  setMessage(`Moved ${m.name} to Trash. It no longer appears in the model picker.`);setUndo(m);
 }
 async function restoreModel(m:ManagedModel){
  if(!await action({action:'restoreModel',modelId:m.id}))return;
  setTrash(false);setSearch('');if(!matchesLibrarySection(m,section))setSection(matchesLibrarySection(m,'tops')?'tops':'bottoms');
  setSelected(m.id);setPoseId('');setFrame('crop');setMessage(`Restored ${m.name}. It is back in the model picker.`);
 }
 const clearNotice=()=>{if(!undo)setMessage('');};
 function pick(m:ManagedModel){setSelected(m.id);setPoseId('');setFrame('crop');clearNotice();if(window.matchMedia?.('(max-width:700px)').matches)requestAnimationFrame(()=>document.querySelector('.ra-content')?.scrollIntoView({block:'start'}));}
 function choosePhoto(m:ManagedModel,p:ModelPose,view:PresetView,file:File){
  if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>20*1024*1024){setError('Choose a PNG, JPEG or WebP no larger than 20 MB.');return;}
  setEdit({model:m,pose:p,view,file,preview:URL.createObjectURL(file)});setProgress(0);setError('');
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
   await mutate({action:'setPhoto',modelId:edit.model.id,poseId:edit.pose.id,view:edit.view,url,expectedUrl:edit.pose.views[edit.view]?.publicPath||''});
   setMessage('Photo saved. New or replaced photos need a face/hair contour review before Simple garment swap.');setEdit(null);
  }catch(e:any){setError(e.message);}finally{setBusy(false);}
 }
 async function createEntry(e:React.FormEvent){
  e.preventDefault();const c=await action(create==='model'?{action:'createModel',name:newName,character:newGroup}:{action:'createPose',modelId:model?.id,label:newName,framing:newFrame});
  if(c){if(create==='model'){setSelected(c.modelId);setPoseId('');setTrash(false);setSection('tops');setSearch('');}else {setPoseId(c.poseId);setSection(newFrame==='low'?'bottoms':'tops');}setCreate(null);setNewName('');setNewGroup('');}
 }
 return <main className="reference-admin">
  <header className="ra-header"><div><h2 className="ra-page-title">Models &amp; pose references</h2><p>Manage the photos Single model and Multi model use, on desktop and phone.</p><a href="/reference-identity-studio">Create reference identities ↗</a></div><button onClick={refresh} disabled={busy||loading}>Refresh</button></header>
  {error&&<p role="alert" className="ra-error">{error} <a href="/login?next=/admin/models">Sign in</a></p>}
  {message&&<p role="status" className="ra-success"><span>{message}</span>{undo&&<button type="button" className="ra-undo" disabled={busy} onClick={()=>restoreModel(undo)}>Undo</button>}</p>}
  <nav className="ra-collections" aria-label="Reference categories">
   {(['tops','bottoms','all'] as const).map(value=><button key={value} aria-pressed={!trash&&section===value} disabled={busy} onClick={()=>{setTrash(false);setSection(value);setPoseId('');setFrame('crop');clearNotice();}}>{value==='all'?'All references':title(value)}<span>{live.filter(m=>matchesLibrarySection(m,value)).length}</span></button>)}
  </nav>
  <div className="ra-layout"><aside className={`ra-library${trash?' is-trash':''}`} aria-label="Reference library">
   <div className="ra-library-tools"><div className="ra-library-title"><h2>{trash?`Trash · ${trashed.length} ${trashed.length===1?'model':'models'}`:section==='all'?'All references':title(section)+' references'}</h2><button className="ra-trash" aria-pressed={trash} disabled={busy} onClick={()=>{const next=trash?live.filter(m=>matchesLibrarySection(m,section)):trashed;setTrash(!trash);setSearch('');setSelected(next[0]?.id||'');setPoseId('');setFrame('crop');setMessage('');setUndo(null);}}>{trash?'Back to models':<>Trash<span>{trashed.length}</span></>}</button></div>
   {trash&&<p className="ra-trash-help">Hidden from the model picker. Restore a model to use it again.</p>}
   {!trash&&<button className="ra-primary" disabled={busy} onClick={()=>{setCreate('model');setNewName('');setNewGroup('');}}>Add model</button>}
   <input aria-label="Search models" placeholder="Search models" value={search} onChange={e=>setSearch(e.target.value)}/>
   </div><div className="ra-model-list">
   {loading?<p>Loading references…</p>:visible.length===0?<p className="ra-list-empty">{trash&&!trashed.length?'Trash is empty.':'No models found.'}</p>:visible.map(m=>{const thumbnail=libraryPoses(m,trash?'all':section).find(p=>!p.deleted&&p.publicPath)?.publicPath;return <button className={`ra-model ${selected===m.id?'selected':''}`} key={m.id} aria-pressed={selected===m.id} disabled={busy} onClick={()=>pick(m)}>{thumbnail?<img src={thumbnail} alt=""/>:<span className="ra-model-placeholder" aria-hidden="true">＋</span>}<span><b>{m.name}</b><small>{m.character ? title(m.character)+' · ' : ''}{m.poses.filter(p=>!p.deleted).length} {m.poses.filter(p=>!p.deleted).length===1?'pose set':'pose sets'}</small></span></button>;})}
  </div></aside><section className="ra-content" aria-label="Reference editor">
   {!model?<div className="ra-empty">{trash&&!trashed.length?<><h2>Trash is empty</h2><p>Deleted models wait here until you restore them.</p></>:<><h2>Choose a model</h2><p>Choose a reference from the library, or clear your search to see more.</p></>}</div>:<>
    <div className="ra-editor-heading"><div><span className="ra-eyebrow">{libraryLabel(model)}{model.deleted?' · In Trash':''}</span><h2>{model.name}</h2><p>{bottomPose?'Waist-down references · Front, side and back':'Model references · Front, side, back and full body'}</p></div></div>
    {model.deleted?<div className="ra-trash-note"><p>This model is in Trash, so the model picker and new generations skip it. Generated images are kept.</p><button className="ra-primary" disabled={busy} onClick={()=>restoreModel(model)}>Restore model</button></div>:<>
    <details className="ra-settings" key={model.id+'-details'}><summary>Edit model details</summary><form className="ra-details" onSubmit={e=>{e.preventDefault();action({action:'updateModel',modelId:model.id,name,character:group,pose:description});}}>
     <label>Model name<input value={name} required maxLength={100} onChange={e=>setName(e.target.value)}/></label>
     <label>Model group<input value={group} maxLength={100} placeholder="Celine, Vision, or a new name" onChange={e=>setGroup(e.target.value)}/></label>
     <label>Pose description<input value={description} maxLength={100} placeholder="Arms relaxed" onChange={e=>setDescription(e.target.value)}/></label>
     <button disabled={busy}>Save details</button>
     <button type="button" className="ra-danger" disabled={busy} onClick={()=>trashModel(model)}>Delete model</button>
    </form></details>
     <div className="ra-posebar"><label>Pose set<select value={pose?.id||''} onChange={e=>setPoseId(e.target.value)}>{!poses.length&&<option value="">No pose sets yet</option>}{poses.map(p=><option key={p.id} value={p.id}>{p.label}{p.deleted?' · Deleted':''}</option>)}</select></label><button disabled={busy} onClick={()=>{setCreate('pose');setNewName('');setNewFrame(section==='bottoms'||bottomPose?'low':'crop');}}>Add pose set</button></div>
     {pose&&<>
      <details className="ra-settings ra-pose-settings" key={pose.id+'-settings'} open={pose.deleted||undefined}><summary>Edit pose details</summary><form className="ra-posebar" onSubmit={e=>{e.preventDefault();action({action:'updatePose',modelId:model.id,poseId:pose.id,label:poseName});}}><label>Pose name<input value={poseName} required maxLength={100} onChange={e=>setPoseName(e.target.value)}/></label><button disabled={busy}>Rename pose</button><button type="button" className="ra-danger" disabled={busy} onClick={()=>{if(pose.deleted||window.confirm(`Move ${pose.label} to Trash?`))action({action:pose.deleted?'restorePose':'deletePose',modelId:model.id,poseId:pose.id});}}>{pose.deleted?'Restore pose':'Delete pose'}</button></form></details>
      {!pose.deleted&&<>
       {hasFrames&&<div className="ra-frame"><label>Reference framing<select value={frame} onChange={e=>setFrame(e.target.value)}><option value="crop">Tops · head to thigh</option><option value="low">Bottoms · waist down</option><option value="full">Full body</option></select></label><p>Each framing has its own photos. The Full slot always uses the full-body reference.</p></div>}
       <div className={`ra-photos${bottomPose?' ra-photos-bottoms':''}`}>{(bottomPose?VIEWS.filter(v=>v!=='full'):VIEWS).map(view=>{
        const target=view==='full'?model:framed;const targetPose=view==='full'?pose:framedPose;
        const photo=targetPose?.views[view];
        return <article className="ra-photo" key={view}><h3>{title(view)}</h3><div className="ra-photo-preview">{photo?<img src={photo.publicPath} alt={`${model.name} ${view} reference`}/>:<span>Missing {view} photo</span>}</div>
         <p className={photo?'':'ra-warning'}>{photo?'Reference available':'Add this view before generating it.'}</p>
         {target&&targetPose?<div className="ra-actions"><label className={`ra-file ${busy?'disabled':''}`}>{photo?'Replace photo':'Upload photo'}<input aria-label={`${photo?'Replace':'Upload'} ${view} photo`} type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={e=>{const f=e.target.files?.[0];if(f)choosePhoto(target,targetPose,view,f);e.target.value='';}}/></label>
          {photo&&<><a href={photo.publicPath} target="_blank" rel="noreferrer">Original ↗</a><button disabled={busy} className="ra-danger" onClick={()=>{if(window.confirm(`Remove the ${view} reference? This view will be unavailable until you upload another photo.`))action({action:'removePhoto',modelId:target.id,poseId:targetPose.id,view,expectedUrl:photo.publicPath});}}>Remove</button></>}
         </div>:<p>No separate framing installed. Choose Full body to edit the source reference.</p>}
        </article>;
       })}</div>
       <p className="ra-help">PNG, JPEG or WebP · up to 20 MB · maximum 4096 pixels per side. Original files are stored without resizing or sharpening. Upload each view into its named slot.</p>
      </>}
     </>}
    </>}
   </>}
  </section></div>
  {create&&<div className="ra-scrim"><form className="ra-dialog" role="dialog" aria-modal="true" aria-label={`Add ${create}`} onSubmit={createEntry}><h2>Add {create==='model'?'model':'pose set'}</h2><label>Name<input autoFocus required maxLength={100} value={newName} onChange={e=>setNewName(e.target.value)}/></label>{create==='model'?<label>Model group<input value={newGroup} maxLength={100} placeholder="Celine, Vision, or a new name" onChange={e=>setNewGroup(e.target.value)}/></label>:<label>Front, side and back framing<select value={newFrame} onChange={e=>setNewFrame(e.target.value)}><option value="crop">Tops · head to thigh</option><option value="low">Bottoms · waist down</option><option value="full">Full body</option></select></label>}<p>{create==='model'?'Next, add a pose set and upload its photos.':'Waist-down poses appear in Bottoms. Other framings appear in Tops.'}</p><div className="ra-actions"><button type="button" disabled={busy} onClick={()=>setCreate(null)}>Cancel</button><button className="ra-primary" disabled={busy}>{busy?'Saving…':'Create'}</button></div></form></div>}
  {edit&&<div className="ra-scrim"><section className="ra-dialog ra-upload" role="dialog" aria-modal="true" aria-label="Review reference photo"><h2>{edit.model.name} · {title(edit.view)}</h2><div className="ra-review-image"><img src={edit.preview} alt="New reference preview"/></div>
   <p>New or replaced photos need a face/hair contour review before Simple garment swap. Saving this photo does not approve its contour.</p>
   {error&&<p role="alert" className="ra-error">{error}</p>}
   <div className="ra-actions"><button disabled={busy} onClick={()=>setEdit(null)}>Cancel</button><button className="ra-primary" disabled={busy} onClick={savePhoto}>{busy?`Saving${progress>0?' '+Math.round(progress)+'%':'…'}`:'Save photo'}</button></div>
  </section></div>}
 </main>;
}
