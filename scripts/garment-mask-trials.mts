import fs from 'node:fs';
import sharp from 'sharp';
import {fal} from '@fal-ai/client';
import {referencePixels,editMask,compositeGarment} from '../lib/garment-only';
const out='/Users/davidani-mini/Services/davidani-faire-management/output/garment-only-working';
for(const line of fs.readFileSync('/Users/davidani-mini/Code/davistudio-batch/.env','utf8').split('\n')){const m=line.match(/^FAL_KEY=(.*)$/);if(m)process.env.FAL_KEY=m[1].trim().replace(/^["']|["']$/g,'');}
fal.config({credentials:process.env.FAL_KEY});
const source=fs.readFileSync('public/models/studio 103/full.png'),ref=await referencePixels(source);
const old=JSON.parse(fs.readFileSync('/Users/davidani-mini/Services/davidani-faire-management/output/garment-only-test/request.json','utf8'));
const mask=await editMask(old.garmentEdit,ref,true);
const upload=(bytes:Buffer,name:string)=>fal.storage.upload(new File([bytes],name,{type:'image/png'}));
const [referenceUrl,rgbMaskUrl]=await Promise.all([upload(source,'original-donuts.png'),sharp(mask,{raw:{width:ref.width,height:ref.height,channels:1}}).png().toBuffer().then(b=>upload(b,'white-edit-black-protect.png'))]);
const prompt='Edit the original DONUTS pants photograph. Replace ONLY the pants with the light denim peacock pants from the other image. Keep the original standing pose with both arms hanging straight down and both hands beside the thighs. Keep the ivory T-shirt, shoes, background and framing. Do not add hands at the waistband or pockets. One person, two arms, two hands. Keep the head unchanged. No sharpening.';
await Promise.all(['rgb-mask','no-provider-mask'].map(async name=>{
 const input={prompt,image_urls:[referenceUrl,old.garmentImageUrls[0]],...(name==='rgb-mask'?{mask_url:rgbMaskUrl}:{}),image_size:{width:1024,height:1536},quality:'high',num_images:1,output_format:'png'};
 fs.writeFileSync(`${out}/${name}-request.json`,JSON.stringify(input,null,2));
 const result=await fal.subscribe('openai/gpt-image-2.5/sunburst/edit',{input,logs:false});
 const generated=Buffer.from(await (await fetch((result.data as any).images[0].url)).arrayBuffer());
 fs.writeFileSync(`${out}/${name}-raw.png`,generated);
 const composed=await compositeGarment(ref,generated,mask);
 fs.writeFileSync(`${out}/${name}.png`,composed.png);
 fs.writeFileSync(`${out}/${name}-result.json`,JSON.stringify({provider:result,preservation:composed.report},null,2));
 console.log(name,'complete',composed.report.changedProtectedPixels);
}));
