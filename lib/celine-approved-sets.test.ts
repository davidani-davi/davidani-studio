import {it,expect} from 'vitest';
import fs from 'node:fs';
import {staticModelsTagged} from './models-registry';
import {viewReference} from './view-reference';
import {referencePixels,compositeGarment} from './garment-only';
import {simpleFaceMask} from './simple-reference-shot';
import sharp from 'sharp';
for(const n of [112,113])for(const framing of ['full','crop'] as const)for(const view of ['front','side','back','full'] as const){
 it(`Celine ${n} ${framing}/${view} resolves exact reviewed source and preserves it`,async()=>{
  const models=staticModelsTagged();const model=models.find(m=>m.id===`studio ${n}`)!;
  expect(model.character).toBe('celine');expect(model.autoPool).toBe(false);
  const r=viewReference(models,model.id,model.poses[0].id,view,view==='full'?'full':framing);
  expect(r.reframed).toBe(false);expect(r.view).toBe(view);
  const ref=await referencePixels(fs.readFileSync('public'+r.publicPath));
  const mask=simpleFaceMask(ref,r.publicPath,view,framing)!;
  expect(mask.filter(x=>x===0).length).toBeGreaterThan(1000);
  expect(()=>simpleFaceMask({...ref,sha256:'changed'},r.publicPath,view,framing)).toThrow('changed');
  const contrast=await sharp({create:{width:ref.width,height:ref.height,channels:4,background:'#ff00ff'}}).png().toBuffer();
  const result=await compositeGarment(ref,contrast,mask,{matchSeam:false});
  expect(result.report.changedProtectedPixels).toBe(0);
 },20000);
}
