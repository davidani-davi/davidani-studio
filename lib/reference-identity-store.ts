import fs from 'node:fs/promises';
import path from 'node:path';
import {list,put} from '@vercel/blob';
import {validIdentitySetId,type IdentitySet} from './reference-identity-core';
const prefix='reference-identity/sets/';
const local=()=>path.join(process.cwd(),'.data','reference-identity');
export async function readIdentitySet(id:string):Promise<IdentitySet|null>{
  if(!validIdentitySetId(id))return null;
  if(!process.env.BLOB_READ_WRITE_TOKEN){
    try{return JSON.parse(await fs.readFile(path.join(local(),`${id}.json`),'utf8'));}
    catch(e:any){if(e.code==='ENOENT')return null;throw e;}
  }
  const found=await list({prefix:`${prefix}${id}.json`,limit:1});
  const blob=found.blobs.find(b=>b.pathname===`${prefix}${id}.json`);
  if(!blob)return null;
  const r=await fetch(blob.url,{cache:'no-store'});if(!r.ok)throw Error('Could not read reference set.');return r.json();
}
export async function listIdentitySets():Promise<IdentitySet[]>{
  let sets:IdentitySet[];
  if(!process.env.BLOB_READ_WRITE_TOKEN){
    let files:string[];try{files=await fs.readdir(local());}catch(e:any){if(e.code==='ENOENT')return [];throw e;}
    sets=await Promise.all(files.filter(f=>f.endsWith('.json')).map(async f=>JSON.parse(await fs.readFile(path.join(local(),f),'utf8'))));
  }else{
    const urls:string[]=[];let cursor:string|undefined;
    do{const page=await list({prefix,cursor,limit:1000});urls.push(...page.blobs.map(b=>b.url));cursor=page.hasMore?page.cursor:undefined;}while(cursor);
    sets=await Promise.all(urls.map(async url=>{const r=await fetch(url,{cache:'no-store'});if(!r.ok)throw Error('Could not load saved sets.');return r.json();}));
  }
  return sets.sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
}
/** Immutable sets are a durable receipt: retrying a submission cannot change its inputs. */
export async function createIdentitySet(set:IdentitySet):Promise<boolean>{
  if(!validIdentitySetId(set.id))throw Error('Invalid set ID.');
  if(!process.env.BLOB_READ_WRITE_TOKEN){
    if(process.env.VERCEL)throw Error('Persistent storage is required.');
    await fs.mkdir(local(),{recursive:true});
    try{await fs.writeFile(path.join(local(),`${set.id}.json`),JSON.stringify(set),{flag:'wx'});return true;}
    catch(e:any){if(e.code==='EEXIST')return false;throw e;}
  }
  try{await put(`${prefix}${set.id}.json`,JSON.stringify(set),{access:'public',addRandomSuffix:false,allowOverwrite:false,contentType:'application/json'});return true;}
  catch(e:any){if(e.name==='BlobPreconditionFailedError'||/already exists/i.test(e.message))return false;throw e;}
}
