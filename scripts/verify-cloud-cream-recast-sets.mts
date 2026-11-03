// Paid check for studio 114/115 (DTP50065A Cloud Cream recast sets, 2026-11-03): DETP70147 on every view,
// built the way /api/model-shots builds a Simple render (same prompt builder, 2K, reviewed face outline, align).
// Front first; side/back/full anchor on that set's finished front. Usage:
//   npx vite-node@3.2.4 scripts/verify-cloud-cream-recast-sets.mts <env file with FAL_KEY> <out dir>
import fs from 'node:fs';import path from 'node:path';
import {fal} from '@fal-ai/client';import {generate} from '../lib/fal';
import {simpleReferenceShot,simpleFaceMask,simpleImageSize} from '../lib/simple-reference-shot';
import {referencePixels,compositeGarment} from '../lib/garment-only';
const [envFile,out]=process.argv.slice(2);
for(const line of fs.readFileSync(envFile,'utf8').split('\n')){const m=line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);if(m&&!process.env[m[1]])process.env[m[1]]=m[2].trim().replace(/^["']|["']$/g,'');}
fal.config({credentials:process.env.FAL_KEY});fs.mkdirSync(out,{recursive:true});
const upload=(b:Buffer,name:string)=>fal.storage.upload(new File([Uint8Array.from(b)],name,{type:'image/png'}));
// Jeonga's DETP70147 run (2026-11-03): her own front/back/side photos and the listing copy.
const own='https://ssnwevqbbqm2hesf.public.blob.vercel-storage.com/studio-own/DETP70147/';
const garmentImageUrls=[own+'front-z2Q5fj7Y6tPT8HSVk9PBzkevPfkWQl.jpg',own+'back-UePdFWxSaTGiUXaE40N6JnK8qOcSA3.jpg'],garmentSideUrl=own+'side-SBtuUhoQkQDdAkRkSJRYrvlLxD5mFg.jpg';
const known={title:'Floral Panel Tee and Wide Leg Pant Set',color:'CREAM BEIGE',description:'Sold as a 2-piece set: price includes both the top and bottom. Each unit ordered = one complete set.\n\nA coordinated two piece built around soft watercolor floral panels set against clean solid blocks, giving boutique shoppers an easy head to toe look with real print interest. The top is a boxy short sleeve tee with a banded crew neck, exposed seam detailing across the yoke, and a cropped hem that sits right at the waistband. The pull on wide leg pant pairs an elasticized drawstring waist with patch pockets and paneled seaming down the leg, all in an 85% cotton and 15% polyester blend that feels substantial yet breathable. Merchandise the set together on one hanger, then cross sell each piece with denim and basic knits to double its reach on the floor.'};
async function run(n:number,view:'front'|'side'|'back'|'full',anchor?:string){
 const key=`${n}-${view}`,rep=path.join(out,key+'-report.json');if(fs.existsSync(rep))return JSON.parse(fs.readFileSync(rep,'utf8')).url as string;
 const publicPath=`/models/studio ${n}/${view}.png`,source=fs.readFileSync('public'+publicPath),ref=await referencePixels(source);
 const referenceUrl=await upload(source,key+'-reference.png');
 const shot=simpleReferenceShot({view,referenceUrl,garmentImageUrls,garmentSideUrl,anchorImageUrl:view==='front'?undefined:anchor,category:'set',framing:'full',color:known.color,note:'',garmentName:known.title,fitSource:'style',styleNotes:[],garmentDescription:known.description});
 fs.writeFileSync(path.join(out,key+'-input.json'),JSON.stringify(shot,null,2));
 const result=await generate({modelId:'gpt-image-25',prompt:shot.prompt,verbatimPrompt:true,imageUrls:shot.garmentImageUrls,referenceImageUrl:referenceUrl,imageSize:simpleImageSize(ref),aspectRatio:'2:3',resolution:'2K',format:'png',numImages:1,outputSize:null});
 fs.writeFileSync(path.join(out,key+'-provider.json'),JSON.stringify(result,null,2));
 const response=await fetch(result.images[0].url);if(!response.ok)throw Error('Provider download failed');const raw=Buffer.from(await response.arrayBuffer());fs.writeFileSync(path.join(out,key+'-raw.png'),raw);
 const composed=await compositeGarment(ref,raw,simpleFaceMask(ref,publicPath,view,'full')!,{matchSeam:false,align:true});fs.writeFileSync(path.join(out,key+'.png'),composed.png);
 const url=await upload(composed.png,key+'-verified.png');const hosted=await fetch(url);if(!hosted.ok||!Buffer.from(await hosted.arrayBuffer()).equals(composed.png))throw Error('Hosted mismatch');
 fs.writeFileSync(rep,JSON.stringify({url,preservation:composed.report,anchored:shot.anchored,sideUsed:shot.garmentSideUsed},null,2));console.log(key,'changedProtectedPixels',composed.report.changedProtectedPixels);
 return url;
}
const fronts=await Promise.all([114,115].map(n=>run(n,'front')));
for(const view of ['side','back','full'] as const)await Promise.all([114,115].map((n,i)=>run(n,view,fronts[i])));
