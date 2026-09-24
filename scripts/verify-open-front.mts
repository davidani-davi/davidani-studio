/** Live check of the open-front inner-layer rule: one front on Celine 3 (crop 102) per product. */
import fs from 'node:fs';
import path from 'node:path';
import {fal} from '@fal-ai/client';
import {generate} from '../lib/fal';
import {simpleReferenceShot,simpleFaceMask,SIMPLE_IMAGE_SIZE} from '../lib/simple-reference-shot';
import {referencePixels,compositeGarment} from '../lib/garment-only';
const [productUrl,name,out]=process.argv.slice(2);
for(const line of fs.readFileSync(process.env.VERIFY_ENV_FILE!,'utf8').split('\n')){const m=line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);if(m&&!process.env[m[1]])process.env[m[1]]=m[2].trim().replace(/^["']|["']$/g,'');}
fal.config({credentials:process.env.FAL_KEY});fs.mkdirSync(out,{recursive:true});
const upload=(b:Buffer,n:string,t='image/png')=>fal.storage.upload(new File([Uint8Array.from(b)],n,{type:t}));
const prod=Buffer.from(await (await fetch(productUrl)).arrayBuffer());const garment=await upload(prod,'product.jpg','image/jpeg');
const root='/Users/davidani-mini/Code/davidani-studio-ul/public',publicPath='/models/crop 102/front.png',source=fs.readFileSync(path.join(root,publicPath));
const ref=await referencePixels(source),referenceUrl=await upload(source,'celine-3-front.png');
const shot=simpleReferenceShot({view:'front',referenceUrl,garmentImageUrls:[garment],category:'top',framing:'crop',garmentName:name});
fs.writeFileSync(path.join(out,'input.json'),JSON.stringify(shot,null,2));
const result=await generate({modelId:'gpt-image-25',prompt:shot.prompt,verbatimPrompt:true,imageUrls:shot.garmentImageUrls,referenceImageUrl:referenceUrl,imageSize:SIMPLE_IMAGE_SIZE,aspectRatio:'2:3',resolution:'1K',format:'png',numImages:1,outputSize:null});
const raw=Buffer.from(await (await fetch(result.images[0].url)).arrayBuffer());fs.writeFileSync(path.join(out,'raw.png'),raw);
const composed=await compositeGarment(ref,raw,simpleFaceMask(ref,publicPath,'front','crop')!,{matchSeam:false});
fs.writeFileSync(path.join(out,'front.png'),composed.png);console.log(name,'openFront=',shot.openFront,'protected pixels changed:',composed.report.changedProtectedPixels);
