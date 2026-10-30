/** Live A/B: one product photo on one reference, Fit + pose vs Pose only. Keeps inputs, raw and final frames.
 *  vite-node scripts/verify-pose-only.mts PRODUCT.jpg OUTPUT_DIR "Garment title" [crop 100] [note ...] */
import fs from 'node:fs';
import path from 'node:path';
import {fal} from '@fal-ai/client';
import {generate} from '../lib/fal';
import {simpleReferenceShot,simpleFaceMask,SIMPLE_IMAGE_SIZE,type FitSource} from '../lib/simple-reference-shot';
import {referencePixels,compositeGarment} from '../lib/garment-only';
const [productPath,out,garmentName,plate='crop 100',...styleNotes]=process.argv.slice(2);
if(!productPath||!out||!garmentName)throw Error('Usage: vite-node scripts/verify-pose-only.mts PRODUCT OUTPUT_DIR "Garment title" [plate] [note ...]');
for(const file of ['.env.local',process.env.VERIFY_ENV_FILE].filter(Boolean) as string[]){
 if(!fs.existsSync(file))continue;
 for(const line of fs.readFileSync(file,'utf8').split('\n')){const m=line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);if(m&&!process.env[m[1]])process.env[m[1]]=m[2].trim().replace(/^["']|["']$/g,'');}
}
fal.config({credentials:process.env.FAL_KEY});fs.mkdirSync(out,{recursive:true});
const type=(name:string)=>/\.jpe?g$/i.test(name)?'image/jpeg':'image/png';
const upload=(b:Buffer,name:string)=>fal.storage.upload(new File([Uint8Array.from(b)],name,{type:type(name)}));
const garment=await upload(fs.readFileSync(productPath),path.basename(productPath));
const publicPath=`/models/${plate}/front.png`,source=fs.readFileSync(path.join('public',publicPath));
const ref=await referencePixels(source),referenceUrl=await upload(source,'reference-front.png');
async function run(fitSource:FitSource){
 const tag=fitSource==='style'?'pose-only':'fit-and-pose';
 const shot=simpleReferenceShot({view:'front',referenceUrl,garmentImageUrls:[garment],category:'top',framing:'crop',garmentName,fitSource,styleNotes});
 fs.writeFileSync(path.join(out,tag+'-input.json'),JSON.stringify(shot,null,2));
 const result=await generate({modelId:'gpt-image-25',prompt:shot.prompt,verbatimPrompt:true,imageUrls:shot.garmentImageUrls,referenceImageUrl:referenceUrl,imageSize:SIMPLE_IMAGE_SIZE,aspectRatio:'2:3',resolution:'1K',format:'png',numImages:1,outputSize:null});
 const response=await fetch(result.images[0].url);if(!response.ok)throw Error('Provider download failed');
 const raw=Buffer.from(await response.arrayBuffer());fs.writeFileSync(path.join(out,tag+'-raw.png'),raw);
 const composed=await compositeGarment(ref,raw,simpleFaceMask(ref,publicPath,'front','crop')!,{matchSeam:false});
 fs.writeFileSync(path.join(out,tag+'.png'),composed.png);
 fs.writeFileSync(path.join(out,tag+'-report.json'),JSON.stringify({result,preservation:composed.report},null,2));
 console.log(tag,'completed; protected pixels changed:',composed.report.changedProtectedPixels);
}
await Promise.all([run('reference'),run('style')]);
