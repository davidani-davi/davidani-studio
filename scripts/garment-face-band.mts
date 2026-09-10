import fs from 'node:fs';import sharp from 'sharp';import {referencePixels,compositeGarment} from '../lib/garment-only';
const out='/Users/davidani-mini/Services/davidani-faire-management/output/garment-only-working';
const ref=await referencePixels(fs.readFileSync('public/models/studio 103/full.png'));
const mask=Buffer.alloc(ref.width*ref.height);for(let y=520;y<ref.height;y++)mask.fill(Math.min(255,Math.round((y-520)/32*255)),y*ref.width,(y+1)*ref.width);
const result=await compositeGarment(ref,fs.readFileSync(out+'/rgb-mask-raw.png'),mask);
fs.writeFileSync(out+'/DP62206-LIGHT-DENIM-face-preserved.png',result.png);fs.writeFileSync(out+'/face-preserved-verification.json',JSON.stringify(result.report,null,2));console.log(result.report);
