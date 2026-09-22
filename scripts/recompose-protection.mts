import fs from 'node:fs';
import sharp from 'sharp';
import {garmentMask,protectGarment} from '../lib/real-shoot-protection';
for(const line of fs.readFileSync('.env.local','utf8').split('\n')){const m=line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);if(m&&!process.env[m[1]])process.env[m[1]]=m[2].trim().replace(/^["']|["']$/g,'');}
const out=process.argv[2],r=JSON.parse(fs.readFileSync(out+'/report.json','utf8'));
const a=fs.readFileSync(out+'/recolored.png'),b=fs.readFileSync(out+'/identity.png'),meta=await sharp(a).metadata();
const [m,n]=await Promise.all([garmentMask(r.recolor,meta.width!,meta.height!),garmentMask(r.identity,meta.width!,meta.height!)]);
const [h,j]=await Promise.all([garmentMask(r.recolor,meta.width!,meta.height!,'hair'),garmentMask(r.identity,meta.width!,meta.height!,'hair')]);
for(let i=0;i<h.length;i++)h[i]=Math.max(h[i],j[i]);
const final=await protectGarment(a,b,m,n,h);
fs.writeFileSync(out+'/front.png',final.png);
await sharp(final.mask,{raw:{width:meta.width!,height:meta.height!,channels:1}}).png().toFile(out+'/mask.png');
fs.writeFileSync(out+'/report.json',JSON.stringify({...r,...final.report},null,2));
console.log(final.report);
