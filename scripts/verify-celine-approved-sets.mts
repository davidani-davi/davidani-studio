import fs from 'node:fs';import path from 'node:path';
import {fal} from '@fal-ai/client';import {generate} from '../lib/fal';
import {simpleReferenceShot,simpleFaceMask,SIMPLE_IMAGE_SIZE} from '../lib/simple-reference-shot';
import {referencePixels,compositeGarment} from '../lib/garment-only';
const [envFile,productPath,out,anchor]=process.argv.slice(2);
for(const line of fs.readFileSync(envFile,'utf8').split('\n')){const m=line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);if(m&&!process.env[m[1]])process.env[m[1]]=m[2].trim().replace(/^["']|["']$/g,'');}
fal.config({credentials:process.env.FAL_KEY});fs.mkdirSync(out,{recursive:true});
const upload=(b:Buffer,name:string)=>fal.storage.upload(new File([Uint8Array.from(b)],name,{type:'image/png'}));
const garment=await upload(fs.readFileSync(productPath),'DETP60282-original.png');
async function run(n:number,view:'front'|'side'|'back'|'full'){
 const key=`${n}-${view}`;if(fs.existsSync(path.join(out,key+'-report.json')))return;
 const publicPath=`/models/studio ${n}/${view}.png`,source=fs.readFileSync('public'+publicPath),ref=await referencePixels(source);
 const referenceUrl=await upload(source,key+'-reference.png');
 const shot=simpleReferenceShot({view,referenceUrl,garmentImageUrls:[garment],anchorImageUrl:view==='front'?undefined:anchor,category:'set',framing:'full',garmentName:'Mineral Wash Dolman Sleeve Jogger Set'});
 fs.writeFileSync(path.join(out,key+'-input.json'),JSON.stringify(shot,null,2));
 const result=await generate({modelId:'gpt-image-25',prompt:shot.prompt,verbatimPrompt:true,imageUrls:shot.garmentImageUrls,referenceImageUrl:referenceUrl,imageSize:SIMPLE_IMAGE_SIZE,aspectRatio:'2:3',resolution:'1K',format:'png',numImages:1,outputSize:null});
 fs.writeFileSync(path.join(out,key+'-provider.json'),JSON.stringify(result,null,2));
 const response=await fetch(result.images[0].url);if(!response.ok)throw Error('Provider download failed');const raw=Buffer.from(await response.arrayBuffer());fs.writeFileSync(path.join(out,key+'-raw.png'),raw);
 const composed=await compositeGarment(ref,raw,simpleFaceMask(ref,publicPath,view,'full')!,{matchSeam:false});fs.writeFileSync(path.join(out,key+'.png'),composed.png);
 const url=await upload(composed.png,key+'-verified.png');const hosted=await fetch(url);if(!hosted.ok||!Buffer.from(await hosted.arrayBuffer()).equals(composed.png))throw Error('Hosted mismatch');
 fs.writeFileSync(path.join(out,key+'-report.json'),JSON.stringify({url,preservation:composed.report,backInferred:view==='back'},null,2));console.log(key,'verified',composed.report.changedProtectedPixels);
}
for(const view of ['side','front','back','full'] as const)await Promise.all([112,113].map(n=>run(n,view)));
