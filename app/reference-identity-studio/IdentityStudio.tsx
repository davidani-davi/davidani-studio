'use client';
import {useEffect,useRef,useState} from 'react';
import {upload} from '@vercel/blob/client';
import {IDENTITY_MASTERS,IDENTITY_PROMPT,IDENTITY_VIEWS,type IdentityInput,type IdentitySet,type IdentitySetDetail,type IdentityView} from '@/lib/reference-identity-core';
const API='/api/reference-identity-studio';
const STORAGE='reference-identity-draft-v1';
const title=(s:string)=>s.charAt(0).toUpperCase()+s.slice(1);
const defaults={front:true,side:true,back:true,full:true};
async function request(url:string,body?:unknown){
 const r=await fetch(url,body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{cache:'no-store'});
 if(r.redirected)throw Error('Please sign in again.');
 const d=await r.json();if(!r.ok)throw Error(d.error||'Request failed.');return d;
}
export default function IdentityStudio(){
 const [identityId,setIdentity]=useState('celine-loose'),[name,setName]=useState('New reference set');
 const [inputs,setInputs]=useState<Partial<Record<IdentityView,IdentityInput>>>({}),[selected,setSelected]=useState(defaults);
 const [sets,setSets]=useState<IdentitySet[]>([]),[active,setActive]=useState<IdentitySetDetail|null>(null);
 const [cloud,setCloud]=useState(false),[ready,setReady]=useState(false),[busy,setBusy]=useState(false),[uploading,setUploading]=useState('');
 const [error,setError]=useState(''),[message,setMessage]=useState(''),[pending,setPending]=useState<any>(null);
 const [saveOpen,setSaveOpen]=useState(false),[saveName,setSaveName]=useState(''),[reviewed,setReviewed]=useState(false);
 const [protection,setProtection]=useState<Record<IdentityView,number>>({front:26,side:26,back:25,full:18});
 const [saved,setSaved]=useState(false);
 const activeRef=useRef<string|null>(null);
 const master=IDENTITY_MASTERS.find(m=>m.id===identityId)!;
 const running=Boolean(active&&Object.values(active.jobs).some(j=>!j||j.status==='running'));
 const locked=busy||Boolean(uploading)||running||Boolean(pending);
 const available=IDENTITY_VIEWS.filter(v=>selected[v]&&inputs[v]);
 const completed=IDENTITY_VIEWS.filter(v=>selected[v]&&active?.jobs[v]?.status==='done'&&!active.jobs[v]?.result?.persistenceWarning);
 async function loadSet(id:string){
  activeRef.current=id;setBusy(true);setError('');
  try{const d:IdentitySetDetail=await request(`${API}?id=${id}`);if(activeRef.current!==id)return;setActive(d);setInputs(d.inputs);setIdentity(d.identity.id);setName(d.name);setSelected(defaults);setSaved(false);setMessage('');}
  catch(e:any){setError(e.message);}finally{setBusy(false);}
 }
 useEffect(()=>{
  let cancelled=false;
  (async()=>{try{
   const data=await request(API);if(cancelled)return;setSets(data.sets);setCloud(data.cloudUploads);
   const linked=new URLSearchParams(location.search).get('set');
   const raw=localStorage.getItem(STORAGE);if(!linked&&raw){try{const d=JSON.parse(raw);if(IDENTITY_MASTERS.some(m=>m.id===d.identityId))setIdentity(d.identityId);if(d.name)setName(d.name);if(d.inputs)setInputs(d.inputs);if(d.pending)setPending(d.pending);if(d.activeId)await loadSet(d.activeId);}catch{}}
   if(linked)await loadSet(linked);
   setReady(true);
  }catch(e:any){if(!cancelled)setError(e.message);}})();return()=>{cancelled=true;};
 },[]);
 useEffect(()=>{if(ready)try{localStorage.setItem(STORAGE,JSON.stringify({identityId,name,inputs,activeId:active?.id,pending}));const url=new URL(location.href);if(active?.id)url.searchParams.set('set',active.id);else url.searchParams.delete('set');history.replaceState(null,'',url);}catch{}},[ready,identityId,name,inputs,active?.id,pending]);
 useEffect(()=>{
  if(!active||!running)return;
  let cancelled=false;const id=active.id;
  const poll=async()=>{try{const d=await request(`${API}?id=${id}`);if(!cancelled&&activeRef.current===id){setActive(d);setError('');}}catch(e:any){if(!cancelled)setError(`${e.message} Your run is saved; polling will retry.`);}};
  const timer=setInterval(poll,5000);return()=>{cancelled=true;clearInterval(timer);};
 },[active?.id,running]);
 async function uploadSource(view:IdentityView,file:File){
  setUploading(view);setError('');setMessage('');
  try{
   if(!['image/png','image/jpeg','image/webp'].includes(file.type)||!file.size||file.size>20*1024*1024)throw Error('Use a PNG, JPEG or WebP up to 20 MB.');
   let url:string;
   if(cloud){const ext=file.type==='image/jpeg'?'jpg':file.type.split('/')[1];url=(await upload(`model-admin/photos/${crypto.randomUUID()}.${ext}`,file,{access:'public',handleUploadUrl:'/api/admin/models/upload'})).url;}
   else{const f=new FormData();f.append('file',file);const r=await fetch('/api/admin/models/upload',{method:'POST',body:f});const d=await r.json();if(!r.ok)throw Error(d.error);url=d.url;}
   setInputs(p=>({...p,[view]:{url,filename:file.name}}));setSelected(p=>({...p,[view]:true}));setActive(null);activeRef.current=null;setSaved(false);
  }catch(e:any){setError(e.message);}finally{setUploading('');}
 }
 async function generate(body?:any){
  const submission=body||{action:'generate',id:crypto.randomUUID(),name,identityId,inputs:Object.fromEntries(available.map(v=>[v,inputs[v]]))};
  // Persist the exact request before submitting. A network retry uses the same ID.
  setPending(submission);try{localStorage.setItem(STORAGE,JSON.stringify({identityId,name,inputs,pending:submission}));}catch{}
  setBusy(true);setError('');setMessage('');
  try{
   const d:IdentitySetDetail=await request(API,submission);activeRef.current=d.id;setActive(d);setPending(null);setSaved(false);
   setSets(p=>[d,...p.filter(s=>s.id!==d.id)]);
  }catch(e:any){setError(e.message);}finally{setBusy(false);}
 }
 function newDraft(){setActive(null);activeRef.current=null;setInputs({});setName('New reference set');setSelected(defaults);setSaved(false);setMessage('');setError('');}
 async function download(url:string,filename:string){
  try{const r=await fetch(url);if(!r.ok)throw Error('Download failed.');const link=document.createElement('a');const object=URL.createObjectURL(await r.blob());link.href=object;link.download=filename;link.click();setTimeout(()=>URL.revokeObjectURL(object),10000);}catch(e:any){setError(e.message);}
 }
 async function save(){
  if(!active)return;setBusy(true);setError('');
  try{await request(API,{action:'save',id:active.id,name:saveName,views:completed,reviewed,protection:Object.fromEntries(completed.map(v=>[v,protection[v]]))});setSaveOpen(false);setSaved(true);setMessage('Saved to Models & pose references. Available in the Model Studio picker.');}
  catch(e:any){setError(e.message);}finally{setBusy(false);}
 }
 return <main className="identity-studio">
  <header className="ri-header"><div><a href="/model-studio">← Model Studio</a><h1>Reference identity studio</h1><p>Create Celine and Vision reference photos from your own poses.</p></div><a href="/admin/models">Manage models &amp; references ↗</a></header>
  {error&&<p className="ri-error" role="alert">{error}{!ready&&<> <a href="/login?next=/reference-identity-studio">Sign in</a> · <button onClick={()=>location.reload()}>Reload</button></>}</p>}
  {message&&<p className="ri-success" role="status">{message}</p>}
  <section className="ri-controls"><label>Reference set name<input maxLength={100} value={name} disabled={locked||!ready} onChange={e=>setName(e.target.value)}/></label><label>Saved runs<select aria-label="Saved runs" value={active?.id||''} disabled={busy||Boolean(uploading)||Boolean(pending)} onChange={e=>e.target.value?loadSet(e.target.value):newDraft()}><option value="">New set</option>{sets.map(s=><option value={s.id} key={s.id}>{s.identity.name} · {s.name} · {new Date(s.createdAt).toLocaleString()}</option>)}</select></label><button onClick={newDraft} disabled={locked||!ready}>New set</button></section>
  <section><h2>1. Choose the identity</h2><div className="ri-identities">{IDENTITY_MASTERS.map(m=><button key={m.id} className={identityId===m.id?'selected':''} aria-pressed={identityId===m.id} disabled={locked||!ready} onClick={()=>{setIdentity(m.id);setActive(null);activeRef.current=null;setSaved(false);}}><img src={m.url} alt=""/><span>{m.label}</span></button>)}</div></section>
  <div className="ri-section-title"><div><h2>2. Upload &amp; generate</h2><p>Each view uses its own original photo + the same identity master. Choose any views.</p></div><span>GPT Image 2.5 · original PNG</span></div>
  <div className="ri-views">{IDENTITY_VIEWS.map(view=>{
   const source=inputs[view],job=active?.jobs[view],result=job?.result;
   return <article key={view} className="ri-view"><label className="ri-view-title"><input type="checkbox" checked={selected[view]} disabled={locked} onChange={e=>setSelected(p=>({...p,[view]:e.target.checked}))}/><h3>{title(view)}</h3><small>{job?job.status==='done'?'Ready':job.status==='failed'?'Failed':'Generating…':''}</small></label>
    <div className="ri-image">{result?.imageUrl?<img src={result.imageUrl} alt={`${active?.identity.name} ${view} result`}/>:source?<img src={source.url} alt={`${view} source`}/>:<span>Upload {view} photo</span>}{job?.status==='running'&&<span className="ri-progress" role="status">Generating {view}…</span>}</div>
    <div className="ri-view-body">{result?.error&&<p role="alert" className="ri-error">{result.error}</p>}{result?.persistenceWarning&&<p className="ri-error">{result.persistenceWarning}</p>}
     <label className="ri-upload">{uploading===view?'Uploading…':source?'Replace source':'Upload source'}<input aria-label={`Upload ${view}`} type="file" accept="image/png,image/jpeg,image/webp" disabled={locked||!ready} onChange={e=>{const f=e.target.files?.[0];if(f)uploadSource(view,f);e.target.value='';}}/></label>
     {source&&<><small className="ri-filename" title={source.filename}>{source.filename}</small><div className="ri-links"><a href={source.url} target="_blank" rel="noreferrer">View source ↗</a><button disabled={locked} onClick={()=>{setInputs(p=>{const n={...p};delete n[view];return n;});setActive(null);activeRef.current=null;}}>Remove</button></div></>}
     {result?.imageUrl&&<div className="ri-links"><a href={result.imageUrl} target="_blank" rel="noreferrer">Enlarge ↗</a><button onClick={()=>download(result.imageUrl!,`${active?.identity.name}-${active?.name}-${view}.png`)}>Download PNG</button></div>}
     {job&&<details><summary>Images &amp; prompt used</summary><p>Image 1: {active?.inputs[view]?.filename}<br/>Image 2: {active?.identity.filename}</p><div className="ri-pair"><img src={active?.inputs[view]?.url} alt="Original pose"/><img src={active?.identity.url} alt="Identity master"/></div><p>{active?.prompt}</p>{result?.requestId&&<small>Request: {result.requestId}</small>}</details>}
    </div></article>;
  })}</div>
  <div className="ri-actionbar"><button className="ri-primary" disabled={!ready||locked||!available.length||!name.trim()} onClick={()=>generate()}>{running?'Generating…':active?`Generate ${available.length} selected again`:`Generate ${available.length||''} selected view${available.length===1?'':'s'}`}</button><button disabled={locked||!completed.length||saved} onClick={()=>{setSaveName(`${active?.identity.name} · ${active?.name}`.slice(0,100));setReviewed(false);setSaveOpen(true);}}>{saved?'Saved to reference library':`Save ${completed.length||''} selected to models`}</button><span>{running?'You can leave this page. Reopen this saved run to see the results.':`${available.length} source photo${available.length===1?'':'s'} selected`}</span></div>
  {pending&&!busy&&<div className="ri-recovery"><p>The submission was not confirmed. Retry safely with the same request ID.</p><button onClick={()=>generate(pending)}>Retry submission</button><button onClick={()=>{setPending(null);setError('');}}>Dismiss</button></div>}
  <details className="ri-method"><summary>The prompt used for every view</summary><p>{IDENTITY_PROMPT}</p><p>Identity master: <a href={master.url} target="_blank" rel="noreferrer">{master.label} ↗</a>. Each output is generated independently from two images.</p></details>
  {saveOpen&&<div className="ri-modal" role="dialog" aria-modal="true" aria-label="Save reference set"><div><h2>Save reference set</h2><label>Name<input value={saveName} maxLength={100} onChange={e=>setSaveName(e.target.value)}/></label><p>For future garment swaps, place the line below the entire face. Everything above it will be protected. This does not edit these photos.</p><div className="ri-review">{completed.map(view=><article key={view}><h3>{title(view)}</h3><div className="ri-boundary"><img src={active?.jobs[view]?.result?.imageUrl} alt={`${view} protection review`}/><span style={{top:`${protection[view]}%`}}/></div><label>Protect top {protection[view]}%<input aria-label={`${view} protection boundary`} type="range" min="1" max="80" value={protection[view]} onChange={e=>{setProtection(p=>({...p,[view]:Number(e.target.value)}));setReviewed(false);}}/></label></article>)}</div><label className="ri-check"><input type="checkbox" checked={reviewed} onChange={e=>setReviewed(e.target.checked)}/>I reviewed the selected images and protection lines.</label><div className="ri-links"><button className="ri-primary" disabled={busy||!reviewed||!saveName.trim()} onClick={save}>Save to model library</button><button disabled={busy} onClick={()=>setSaveOpen(false)}>Cancel</button></div></div></div>}
 </main>;
}
