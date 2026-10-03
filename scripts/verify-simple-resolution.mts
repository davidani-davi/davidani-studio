/** Live comparison: one product + one reviewed base, Simple at 1K/low vs 2K/medium (the app's base-dependent size) vs 2048x3072/high. Paid.
 * Optional env: SIMPLE_ANCHOR=<completed front image> for side/back/full, SIMPLE_NAME=<garment title>. */
import fs from 'node:fs';
import path from 'node:path';
import {fal} from '@fal-ai/client';
import {generate} from '../lib/fal';
import {simpleReferenceShot,simpleFaceMask,simpleImageSize} from '../lib/simple-reference-shot';
import {referencePixels,compositeGarment} from '../lib/garment-only';
const [productPath,out,publicPath='/models/studio 110/front.png',configs='1K,2K,4K']=process.argv.slice(2);
if(!productPath||!out)throw Error('Usage: vite-node scripts/verify-simple-resolution.mts PRODUCT OUTPUT_DIR [/models/<set>/<view>.png] [1K,2K,4K]');
for(const file of ['.env.local',process.env.VERIFY_ENV_FILE].filter(Boolean) as string[]){
 if(!fs.existsSync(file))continue;
 for(const line of fs.readFileSync(file,'utf8').split('\n')){const m=line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);if(m&&!process.env[m[1]])process.env[m[1]]=m[2].trim().replace(/^["']|["']$/g,'');}
}
fal.config({credentials:process.env.FAL_KEY});fs.mkdirSync(out,{recursive:true});
const type=productPath.endsWith('.png')?'image/png':'image/jpeg';
const garment=await fal.storage.upload(new File([Uint8Array.from(fs.readFileSync(productPath))],path.basename(productPath),{type}));
const view=path.basename(publicPath,'.png') as 'front'|'side'|'back'|'full';
const source=fs.readFileSync(path.join('public',publicPath)),ref=await referencePixels(source);
const referenceUrl=await fal.storage.upload(new File([Uint8Array.from(source)],'reference.png',{type:'image/png'}));
const upload=(file:string)=>fal.storage.upload(new File([Uint8Array.from(fs.readFileSync(file))],path.basename(file),{type:file.endsWith('.png')?'image/png':'image/jpeg'}));
const anchorImageUrl=process.env.SIMPLE_ANCHOR?await upload(process.env.SIMPLE_ANCHOR):undefined;
const shot=simpleReferenceShot({view,referenceUrl,garmentImageUrls:[garment],category:'top',framing:'studio',anchorImageUrl,garmentName:process.env.SIMPLE_NAME});
const sizes:Record<string,{width:number;height:number}>={'1K':{width:1024,height:1536},'2K':simpleImageSize(ref),'4K':{width:2048,height:3072}};
await Promise.all(configs.split(',').map(async resolution=>{
 const started=Date.now();
 const result=await generate({modelId:'gpt-image-25',prompt:shot.prompt,verbatimPrompt:true,imageUrls:shot.garmentImageUrls,referenceImageUrl:referenceUrl,imageSize:sizes[resolution],aspectRatio:'2:3',resolution,format:'png',numImages:1,outputSize:null});
 const seconds=(Date.now()-started)/1000;
 const raw=Buffer.from(await (await fetch(result.images[0].url)).arrayBuffer());fs.writeFileSync(path.join(out,resolution+'-raw.png'),raw);
 const mask=simpleFaceMask(ref,publicPath,view,'studio')!;
 const composed=await compositeGarment(ref,raw,mask,{matchSeam:false});
 fs.writeFileSync(path.join(out,resolution+'.png'),composed.png);
 fs.writeFileSync(path.join(out,resolution+'-report.json'),JSON.stringify({resolution,size:sizes[resolution],seconds,preservation:composed.report},null,2));
 console.log(resolution,`${seconds.toFixed(1)}s`,'protected pixels changed:',composed.report.changedProtectedPixels);
}));
