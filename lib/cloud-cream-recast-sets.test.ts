import {it,expect} from 'vitest';
import fs from 'node:fs';
import {staticModelsTagged} from './models-registry';
import {viewReference} from './view-reference';
import {referencePixels,compositeGarment} from './garment-only';
import {simpleFaceMask} from './simple-reference-shot';
import sharp from 'sharp';
// DTP50065A Cloud Cream recast sets (David, 2026-11-03): real Chloe photos with the head and hair recast.
// Same fit spec as DETP50065 / DETP70147. Full framing only (no crop family).
for(const [n,face] of [[114,'vision'],[115,'celine']] as const)for(const view of ['front','side','back','full'] as const){
 it(`${face} studio ${n} ${view} resolves its exact reviewed source and preserves it`,async()=>{
  const models=staticModelsTagged();const model=models.find(m=>m.id===`studio ${n}`)!;
  expect(model.character).toBe(face);expect(model.autoPool).toBe(false);
  const r=viewReference(models,model.id,model.poses[0].id,view,'full');
  expect(r.reframed).toBe(false);expect(r.view).toBe(view);
  const ref=await referencePixels(fs.readFileSync('public'+r.publicPath));
  const mask=simpleFaceMask(ref,r.publicPath,view,'full')!;
  expect(mask.filter(x=>x===0).length).toBeGreaterThan(1000);
  expect(()=>simpleFaceMask({...ref,sha256:'changed'},r.publicPath,view,'full')).toThrow('changed');
  const contrast=await sharp({create:{width:ref.width,height:ref.height,channels:4,background:'#ff00ff'}}).png().toBuffer();
  const result=await compositeGarment(ref,contrast,mask,{matchSeam:false});
  expect(result.report.changedProtectedPixels).toBe(0);
 },20000);
}
it('the Cloud Cream sets keep their own picker card, apart from Celine 6',()=>{
 const models=staticModelsTagged();const key=(id:string)=>{const m=models.find(x=>x.id===id)! as any;return [m.poseKey,m.outfitBelow,m.outfitAbove].join('|');};
 expect(key('studio 115')).not.toBe(key('studio 112'));
});
