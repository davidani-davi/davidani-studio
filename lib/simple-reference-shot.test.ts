import {describe,it,expect} from 'vitest';
import fs from 'node:fs';
import {simpleReferenceShot,simpleFaceMask} from './simple-reference-shot';
import {referencePixels} from './garment-only';
import presets from './simple-face-presets.json';
const base={referenceUrl:'https://ref/front.png',garmentImageUrls:['https://erp/front.png','https://erp/back.png'],category:'top' as const,framing:'crop' as const};
describe('simple garment swap',()=>{
 it.each(['front','side','full'] as const)('%s gets only its base and front garment',view=>{
  const shot=simpleReferenceShot({...base,view,anchorImageUrl:'https://generated/front.png'});
  expect(shot.image_urls).toEqual([base.referenceUrl,base.garmentImageUrls[0]]);
  expect(shot.prompt).not.toMatch(/4K|90 degrees|mid-thigh|waist to/);
 });
 it('back gets only the back garment, without front print instructions',()=>{
  const shot=simpleReferenceShot({...base,view:'back'});
  expect(shot.image_urls).toEqual([base.referenceUrl,base.garmentImageUrls[1]]);
  expect(shot.garmentBackInferred).toBe(false);
 });
 it('labels inferred back, includes correction and preserves bottoms scope',()=>{
  const shot=simpleReferenceShot({...base,view:'back',category:'pants',garmentImageUrls:[base.garmentImageUrls[0]],note:'Keep ankle length.',color:'Blue'});
  expect(shot.garmentBackInferred).toBe(true);expect(shot.prompt).toContain('only the bottoms');expect(shot.prompt).toContain('Keep ankle length.');
 });
 it('uses photographic color rather than a generic ERP color name in every view',()=>{
  for(const view of ['front','side','back','full'] as const){
   const shot=simpleReferenceShot({...base,view,color:'BROWN'});
   expect(shot.prompt).toContain('sole garment-color reference');
   expect(shot.prompt).toContain('hue, saturation and midtone brightness');
   expect(shot.prompt).toContain('natural fold shadows and highlights');
   expect(shot.prompt).not.toContain('BROWN');
   expect(shot.image_urls).toHaveLength(2);
  }
 });
 it('requires two input roles',()=>expect(()=>simpleReferenceShot({...base,view:'front',garmentImageUrls:[]})).toThrow());
 it('requires reviewed unchanged source pixels for face protection',async()=>{
  const ref=await referencePixels(fs.readFileSync('public/models/crop 100/front.png'));
  expect(()=>simpleFaceMask({...ref,sha256:'0'.repeat(64)},'/models/crop 100/front.png','front','crop')).toThrow('reference changed');
  expect(()=>simpleFaceMask(ref,'/models/custom/front.png','front','crop')).toThrow('no reviewed');
  expect(simpleFaceMask(ref,'/models/low 100/front.png','front','low')).toBeUndefined();
  expect(simpleFaceMask(ref,'/models/crop 100/back.png','back','crop')).toBeUndefined();
 });
 it.each(Object.entries(presets))('validates actual reviewed asset %s',async(path,preset)=>{
  const ref=await referencePixels(fs.readFileSync('public'+path));
  const mask=simpleFaceMask(ref,path,'front','crop')!;
  expect(ref.sha256).toBe(preset.sha256);
  expect(mask.subarray(0,preset.protectedRows*ref.width).every(n=>n===0)).toBe(true);
  expect(mask[mask.length-1]).toBe(255);
 });
});
