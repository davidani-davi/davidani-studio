import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {put} from '@vercel/blob';
import sharp from 'sharp';
import {generate} from './fal';
import {writeShotTask,type ShotTask} from './shot-tasks';
import {identityGenerationParams,type IdentitySet,type IdentityView} from './reference-identity-core';

/** One source + one identity, one generation. Store provider PNG bytes unchanged. */
export async function renderIdentityView(set:IdentitySet,view:IdentityView,task:ShotTask){
  let providerUrl:string|undefined;
  try{
    const source=set.inputs[view];if(!source)throw Error('This view has no source photo.');
    const rendered=await generate(identityGenerationParams(source.url,set.identity.url));
    providerUrl=rendered.images[0]?.url;if(!providerUrl)throw Error('The generator returned no image.');
    let imageUrl=providerUrl,persistenceWarning:string|undefined;
    try{
      const response=await fetch(providerUrl);if(!response.ok)throw Error('Could not download generated image.');
      const bytes=Buffer.from(await response.arrayBuffer());
      if(bytes.length>20*1024*1024)throw Error('Generated file exceeds 20 MB.');
      const metadata=await sharp(bytes,{limitInputPixels:20_000_000}).metadata();
      if(metadata.format!=='png')throw Error('The generator did not return the requested PNG.');
      const key=`model-admin/photos/${randomUUID()}.png`;
      if(process.env.BLOB_READ_WRITE_TOKEN){
        let last:unknown;
        for(let attempt=0;attempt<3;attempt++){
          try{imageUrl=(await put(key,bytes,{access:'public',addRandomSuffix:false,contentType:'image/png',allowOverwrite:false})).url;last=undefined;break;}catch(e){last=e;}
        }
        if(last)throw last;
      }else{
        const file=path.join(process.cwd(),'public/user-assets',key);await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,bytes);imageUrl=`/user-assets/${key}`;
      }
    }catch{persistenceWarning='Generated successfully, but permanent storage failed. Download the original now; saving to the model library is unavailable.';}
    await writeShotTask({...task,status:'done',result:{imageUrl,providerUrl,requestId:rendered.requestId,persistenceWarning}});
  }catch(e:any){await writeShotTask({...task,status:'failed',result:{error:e.message||'Generation failed.',providerUrl}});}
}
