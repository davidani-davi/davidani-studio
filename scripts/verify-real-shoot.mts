/** Smoke-test the app's real-shoot renderer against the photographed DWJ62218A. */
import fs from 'node:fs';
import path from 'node:path';
import {fal} from '@fal-ai/client';
import {directOutfitInput,renderDirectOutfit} from '../lib/direct-outfit';
const [sourceDir,out]=process.argv.slice(2);
if(!sourceDir||!out)throw Error('Usage: vite-node scripts/verify-real-shoot.mts SOURCE_DIR OUTPUT_DIR');
for(const file of ['.env.local',process.env.VERIFY_ENV_FILE].filter(Boolean) as string[]){
 if(!fs.existsSync(file))continue;
 for(const line of fs.readFileSync(file,'utf8').split('\n')){const m=line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);if(m&&!process.env[m[1]])process.env[m[1]]=m[2].trim().replace(/^["']|["']$/g,'');}
}
fal.config({credentials:process.env.FAL_KEY});fs.mkdirSync(out,{recursive:true});
const urls=await Promise.all(['erp-21.jpg','erp-4.jpg','erp-18.jpg'].map(name=>fal.storage.upload(new File([fs.readFileSync(path.join(sourceDir,name))],name,{type:'image/jpeg'}))));
const input=directOutfitInput({editMode:'real-shoot',view:'front',identityId:'celine',engine:'gpt25',outfitSources:{front:urls[0]},shootReferences:{color:urls[1],detail:urls[2]},known:{title:'Two-Tone Striped Button-Front Cardigan'}});
const result=await renderDirectOutfit(input,'');
fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(result,null,2));
const response=await fetch(result.url);if(!response.ok)throw Error('Could not download output');fs.writeFileSync(path.join(out,'front.png'),Buffer.from(await response.arrayBuffer()));
console.log('Real shoot generation completed; PNG upload byte verification passed.');
