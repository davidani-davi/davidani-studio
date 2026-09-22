/** Smoke-test the app's real-shoot renderer against the photographed DWJ62218A. */
import fs from 'node:fs';
import path from 'node:path';
import {fal} from '@fal-ai/client';
import {directOutfitInput,renderDirectOutfit} from '../lib/direct-outfit';
const [sourceDir,out,view='front']=process.argv.slice(2);
const files:Record<string,string>={front:'erp-21.jpg',side:'erp-10.jpg',back:'erp-11.jpg',full:'erp-23.jpg'};
if(!files[view])throw Error('Invalid view');
if(!sourceDir||!out)throw Error('Usage: vite-node scripts/verify-real-shoot.mts SOURCE_DIR OUTPUT_DIR');
for(const file of ['.env.local',process.env.VERIFY_ENV_FILE].filter(Boolean) as string[]){
 if(!fs.existsSync(file))continue;
 for(const line of fs.readFileSync(file,'utf8').split('\n')){const m=line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);if(m&&!process.env[m[1]])process.env[m[1]]=m[2].trim().replace(/^["']|["']$/g,'');}
}
fal.config({credentials:process.env.FAL_KEY});fs.mkdirSync(out,{recursive:true});
const urls=await Promise.all([files[view],'erp-4.jpg','erp-18.jpg'].map(name=>fal.storage.upload(new File([fs.readFileSync(path.join(sourceDir,name))],name,{type:'image/jpeg'}))));
const input=directOutfitInput({editMode:'real-shoot',view,identityId:'celine',engine:'gpt25',outfitSources:{[view]:urls[0]},shootReferences:{color:urls[1],detail:urls[2]},known:{title:'Two-Tone Striped Button-Front Cardigan'}});
const result=await renderDirectOutfit(input,'');
fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(result,null,2));
const response=await fetch(result.url);if(!response.ok)throw Error('Could not download output');fs.writeFileSync(path.join(out,view+'.png'),Buffer.from(await response.arrayBuffer()));
for(const [name,url] of Object.entries({recolored:result.garmentProtection?.recoloredUrl,identity:result.garmentProtection?.identityUrl})){if(url){const r=await fetch(url);fs.writeFileSync(path.join(out,name+'.png'),Buffer.from(await r.arrayBuffer()));}}
console.log(view, result.garmentProtection);
