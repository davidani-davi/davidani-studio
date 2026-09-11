import { describe,it,expect } from 'vitest';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import data from './pants-references.json';
import { withPantsReferences,pantsReferences,isPantsReference,isPantsStyle,PANTS_VIEWS } from './pants-references';
import { viewReference } from './view-reference';
import {assignPlate} from './plate-assign';

describe('shared pants collection',()=>{
 it('keeps Donuts first followed by all sixteen ERP styles, with no identity groups or full shots',()=>{
  const ref={filename:'front.jpg',publicPath:'/models/studio 103/front.jpg'};
  const models=withPantsReferences([{id:'studio 103',name:'Celine Donuts',character:'celine',poses:[{id:'studio 103',label:'Donuts',filename:'front.jpg',publicPath:ref.publicPath,subdir:'',views:{front:ref,full:ref}}]}]);
  expect(pantsReferences(models).map(m=>m.id)).toEqual(['studio 103','pants-dp62024','pants-dp67305','pants-dp60245','pants-dp62024a','pants-dp43109','pants-dp69017','pants-dp67040','pants-dp60197b','pants-dp62138','pants-dp67113','pants-dp58506','pants-dp52122','pants-dp52005a','pants-dp58132','pants-dp62024b','pants-dp62087']);
  expect(models[0].poses[0].views.front).toEqual(ref);
  for(const m of models){expect(m.character).toBeUndefined();expect(m.poses[0].views.full).toBeUndefined();}
 });
 it('each requested view resolves to its own unchanged ERP file',()=>{
  const models=withPantsReferences([]);
  for(const r of data)for(const view of PANTS_VIEWS){
    const v=view as 'front'|'side'|'back',m=models.find(m=>m.id===`pants-${r.style.toLowerCase()}`)!;
    const resolved=viewReference(models,m.id,m.poses[0].id,view,'low');
    expect(resolved.publicPath).toBe(r.views[v].publicPath);expect(resolved.reframed).toBe(false);
    const bytes=fs.readFileSync('public'+resolved.publicPath);
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(r.sources[v].sha256);
  }
  for(const m of models)expect(()=>viewReference(models,m.id,m.poses[0].id,'full','full')).toThrow('Missing full');
 });
 it('auto assignment reaches the new references and stays deterministic',()=>{
  const models=withPantsReferences([]),picked=new Set();
  for(let i=0;i<1000;i++) {const a=assignPlate(`DP${i}`,models,{category:'pants'});expect(a).toEqual(assignPlate(`DP${i}`,models,{category:'pants'}));picked.add(a?.humanModelId);}
  expect(picked.size).toBe(data.length);
 });
 it('preserves the requested color and cropped reference labels',()=>{
  expect(data.find(r=>r.style==='DP58506')?.label).toBe('Taupe Black Dots');
  expect(data.find(r=>r.style==='DP62087')?.label).toContain('3/4 length');
  expect(new Set(data.map(r=>r.style)).size).toBe(data.length);
 });
 it('recognizes pants and shorts style codes without mistaking coordinated sets for pants',()=>{
  for(const s of ['DP62024',' dp60197b ','PP62024','DEP60001'])expect(isPantsStyle(s)).toBe(true);
  for(const s of ['DTP60100','DETP60100','DT60001',''])expect(isPantsStyle(s)).toBe(false);
  expect(isPantsReference('studio 103')).toBe(true);expect(isPantsReference('studio 98')).toBe(false);
 });
});
