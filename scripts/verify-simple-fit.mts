/** Live regression: DWT62145 product + fitted Celine 2, retain raw/final and pixel evidence. */
import fs from 'node:fs';
import path from 'node:path';
import {fal} from '@fal-ai/client';
import {generate} from '../lib/fal';
import {simpleReferenceShot,simpleFaceMask,SIMPLE_IMAGE_SIZE} from '../lib/simple-reference-shot';
import {referencePixels,compositeGarment} from '../lib/garment-only';
const [productPath,out,viewArg='front']=process.argv.slice(2);
if(!['front','side','back','full'].includes(viewArg))throw Error('Invalid view');
if(!productPath||!out)throw Error('Usage: vite-node scripts/verify-simple-fit.mts PRODUCT.png OUTPUT_DIR');
for(const file of ['.env.local',process.env.VERIFY_ENV_FILE].filter(Boolean) as string[]){
 if(!fs.existsSync(file))continue;
 for(const line of fs.readFileSync(file,'utf8').split('\n')){const m=line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);if(m&&!process.env[m[1]])process.env[m[1]]=m[2].trim().replace(/^["']|["']$/g,'');}
}
fal.config({credentials:process.env.FAL_KEY});fs.mkdirSync(out,{recursive:true});
const upload=(b:Buffer,name:string)=>fal.storage.upload(new File([Uint8Array.from(b)],name,{type:'image/png'}));
const garment=await upload(fs.readFileSync(productPath),'DWT62145-purple-product.png');
async function run(view:'front'|'side'|'back'|'full',anchorImageUrl?:string){
 const publicPath=`/models/${view==='full'?'studio':'crop'} 100/${view}.png`,source=fs.readFileSync(path.join('public',publicPath));
 const ref=await referencePixels(source),referenceUrl=await upload(source,`celine-2-${view}.png`);
 const shot=simpleReferenceShot({view,referenceUrl,garmentImageUrls:[garment],anchorImageUrl,category:'top',framing:'crop',garmentName:'Pointelle Cable Knit Cropped Cardigan Sweater'});
 fs.writeFileSync(path.join(out,view+'-input.json'),JSON.stringify(shot,null,2));
 const result=await generate({modelId:'gpt-image-25',prompt:shot.prompt,verbatimPrompt:true,imageUrls:shot.garmentImageUrls,referenceImageUrl:referenceUrl,imageSize:SIMPLE_IMAGE_SIZE,aspectRatio:'2:3',resolution:'1K',format:'png',numImages:1,outputSize:null});
 const response=await fetch(result.images[0].url);if(!response.ok)throw Error('Provider download failed');
 const raw=Buffer.from(await response.arrayBuffer());fs.writeFileSync(path.join(out,view+'-raw.png'),raw);
 const mask=simpleFaceMask(ref,publicPath,view,'crop')!;
 const composed=await compositeGarment(ref,raw,mask,{matchSeam:false});
 fs.writeFileSync(path.join(out,view+'.png'),composed.png);
 fs.writeFileSync(path.join(out,view+'-report.json'),JSON.stringify({result,preservation:composed.report},null,2));
 console.log(view,'completed; protected pixels changed:',composed.report.changedProtectedPixels);
 return composed.png;
}
const anchorPath=path.join(out,'front.png');
const anchor=viewArg!=='front'&&fs.existsSync(anchorPath)?await upload(fs.readFileSync(anchorPath),'front-continuity.png'):undefined;
await run(viewArg as 'front'|'side'|'back'|'full',anchor);
