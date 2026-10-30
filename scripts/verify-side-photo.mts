/** Live A/B for the real side photo (2026-10-30). Renders the front from the front photo alone, then the side view
 *  with and without the side photo (both anchored on that front), and the front again with the side photo as a
 *  check image. Keeps inputs, raw and final frames plus a comparison sheet.
 *  vite-node scripts/verify-side-photo.mts FRONT.jpg SIDE.jpg OUTPUT_DIR "Garment title" REFERENCE_DIR CATEGORY FRAMING
 *  e.g. ... pants-references/DP52005A pants low   |   ... "models/crop 100" top crop */
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import {fal} from '@fal-ai/client';
import {generate} from '../lib/fal';
import {simpleReferenceShot,simpleFaceMask,SIMPLE_IMAGE_SIZE} from '../lib/simple-reference-shot';
import {referencePixels,compositeGarment} from '../lib/garment-only';
const [frontPath,sidePath,out,garmentName,refDir,category='top',framing='crop']=process.argv.slice(2);
if(!frontPath||!sidePath||!out||!garmentName||!refDir)throw Error('Usage: vite-node scripts/verify-side-photo.mts FRONT SIDE OUTPUT_DIR "Garment title" REFERENCE_DIR [category] [framing]');
for(const file of ['.env.local',process.env.VERIFY_ENV_FILE].filter(Boolean) as string[]){
 if(!fs.existsSync(file))continue;
 for(const line of fs.readFileSync(file,'utf8').split('\n')){const m=line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);if(m&&!process.env[m[1]])process.env[m[1]]=m[2].trim().replace(/^["']|["']$/g,'');}
}
fal.config({credentials:process.env.FAL_KEY});fs.mkdirSync(out,{recursive:true});
const type=(name:string)=>/\.jpe?g$/i.test(name)?'image/jpeg':'image/png';
const upload=(b:Buffer,name:string)=>fal.storage.upload(new File([Uint8Array.from(b)],name,{type:type(name)}));
const [front,side]=await Promise.all([frontPath,sidePath].map(p=>upload(fs.readFileSync(p),path.basename(p))));
const refFile=(view:string)=>{const f=fs.readdirSync(path.join('public',refDir)).find(n=>n.startsWith(view+'.'));if(!f)throw Error('No '+view+' reference in '+refDir);return '/'+refDir+'/'+f;};
async function render(tag:string,view:'front'|'side',opts:{side?:string,anchor?:string}){
 const publicPath=refFile(view),source=fs.readFileSync(path.join('public',publicPath));
 const ref=await referencePixels(source),referenceUrl=await upload(source,'reference-'+view+path.extname(publicPath));
 const shot=simpleReferenceShot({view,referenceUrl,garmentImageUrls:[front],category:category as any,framing:framing as any,garmentName,anchorImageUrl:opts.anchor,garmentSideUrl:opts.side});
 fs.writeFileSync(path.join(out,tag+'-input.json'),JSON.stringify(shot,null,2));
 const result=await generate({modelId:'gpt-image-25',prompt:shot.prompt,verbatimPrompt:true,imageUrls:shot.garmentImageUrls,referenceImageUrl:referenceUrl,imageSize:SIMPLE_IMAGE_SIZE,aspectRatio:'2:3',resolution:'1K',format:'png',numImages:1,outputSize:null});
 const response=await fetch(result.images[0].url);if(!response.ok)throw Error('Provider download failed');
 const raw=Buffer.from(await response.arrayBuffer());fs.writeFileSync(path.join(out,tag+'-raw.png'),raw);
 const mask=simpleFaceMask(ref,publicPath,view,framing);
 const final=mask?(await compositeGarment(ref,raw,mask,{matchSeam:false})).png:raw;
 fs.writeFileSync(path.join(out,tag+'.png'),final);
 console.log(tag,'done',shot.garmentSideUsed?'(side photo sent)':'(no side photo)');
 return {final,url:result.images[0].url};
}
// A front already in OUTPUT_DIR is reused, so the side pair can be repeated on the same anchor.
const kept=['front','front-with-side'].map(t=>path.join(out,t+'.png'));
const baseFront=kept.every(f=>fs.existsSync(f))?fs.readFileSync(kept[0]):(await Promise.all([render('front','front',{}),render('front-with-side','front',{side})]))[0].final;
const anchor=await upload(baseFront,'front-render.png');
await Promise.all([render('side-without','side',{anchor}),render('side-with','side',{side,anchor})]);
// One sheet to look at: product photos, the side reference, then the renders.
const tiles=[['product front',frontPath],['product side',sidePath],['reference side',path.join('public',refFile('side'))],
 ['front',path.join(out,'front.png')],['front + side photo',path.join(out,'front-with-side.png')],
 ['side, no side photo',path.join(out,'side-without.png')],['side + side photo',path.join(out,'side-with.png')]];
const W=360,H=540,L=28;
const parts=await Promise.all(tiles.map(async([label,file],i)=>[
 {input:await sharp(file).resize(W,H,{fit:'contain',background:'#ffffff'}).png().toBuffer(),left:i*W,top:L},
 {input:Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${L}"><text x="8" y="20" font-family="Helvetica" font-size="17" fill="#222">${label}</text></svg>`),left:i*W,top:0}]));
await sharp({create:{width:W*tiles.length,height:H+L,channels:3,background:'#ffffff'}}).composite(parts.flat()).jpeg({quality:88}).toFile(path.join(out,'sheet.jpg'));
console.log('sheet',path.join(out,'sheet.jpg'));
