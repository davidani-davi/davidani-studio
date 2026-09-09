import { createCipheriv,createDecipheriv,createHmac,randomBytes } from 'node:crypto';
import { list,put } from '@vercel/blob';
import type { ConceptStore } from './design-concepts';
import { validConceptId } from './design-concepts';
export function conceptStore():ConceptStore {
  const secret=process.env.AUTH_SECRET||process.env.APP_PASSWORD;
  if(!secret||!process.env.BLOB_READ_WRITE_TOKEN)throw Error('Persistent concept storage is not configured.');
  const key=createHmac('sha256',secret).update('design-concepts-encryption-v1').digest();
  const namespace=createHmac('sha256',secret).update('design-concepts-v1').digest('hex');
  const prefix='design-concepts-v1/'+namespace+'/';
  const path=(id:string,stage:string)=>{if(!validConceptId(id)||!['intent','submitted','uncertain','result','failed','image'].includes(stage))throw Error('Invalid concept storage path');return `${prefix}${id}/${stage}`};
  function encode(value:unknown){const nonce=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,nonce);const data=Buffer.concat([cipher.update(JSON.stringify(value),'utf8'),cipher.final()]);return JSON.stringify({v:1,n:nonce.toString('base64'),t:cipher.getAuthTag().toString('base64'),d:data.toString('base64')})}
  function decode(value:string){const box=JSON.parse(value);if(box.v!==1)throw Error('Unknown concept format');const cipher=createDecipheriv('aes-256-gcm',key,Buffer.from(box.n,'base64'));cipher.setAuthTag(Buffer.from(box.t,'base64'));return JSON.parse(Buffer.concat([cipher.update(Buffer.from(box.d,'base64')),cipher.final()]).toString('utf8'))}
  async function find(filename:string){const page=await list({prefix:filename,limit:2});return page.blobs.find(b=>b.pathname===filename)}
  function exists(e:any){return e?.name==='BlobPreconditionFailedError'||/already exists/i.test(String(e?.message||''))}
  return {
    async read(id,stage){const hit=await find(path(id,stage)+'.json');if(!hit)return null;const r=await fetch(hit.url+'?v='+Date.now(),{cache:'no-store',signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('Concept history unavailable');return decode(await r.text())},
    async create(id,stage,value){try{await put(path(id,stage)+'.json',encode(value),{access:'public',addRandomSuffix:false,allowOverwrite:false,contentType:'application/json'});return true}catch(e){if(exists(e))return false;throw e}},
    async saveImage(id,image){
      const filename=path(id,'image')+'.png',hit=await find(filename);if(hit)return {...image,url:hit.url};
      const url=new URL(image.url);
      if(url.protocol!=='https:'||!(url.hostname==='fal.media'||url.hostname.endsWith('.fal.media')||url.hostname==='v3.fal.media'||url.hostname==='storage.googleapis.com'))throw Error('Unexpected provider image host');
      const r=await fetch(url,{signal:AbortSignal.timeout(45000),redirect:'error'});
      if(!r.ok||!r.headers.get('content-type')?.startsWith('image/png'))throw Error('Provider PNG could not be saved');
      const length=Number(r.headers.get('content-length')||0);if(length>25000000)throw Error('Concept image too large');
      const bytes=Buffer.from(await r.arrayBuffer());if(bytes.length<33||bytes.length>25000000||bytes.subarray(0,8).toString('hex')!=='89504e470d0a1a0a')throw Error('Invalid concept PNG');
      try{const result=await put(filename,bytes,{access:'public',addRandomSuffix:false,allowOverwrite:false,contentType:'image/png'});return {url:result.url,width:bytes.readUInt32BE(16),height:bytes.readUInt32BE(20)}}
      catch(e){if(!exists(e))throw e;const saved=await find(filename);if(!saved)throw e;return {...image,url:saved.url}}
    },
  };
}
