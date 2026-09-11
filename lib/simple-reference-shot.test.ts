import {describe,it,expect} from 'vitest';
import fs from 'node:fs';
import {simpleReferenceShot,simpleFaceMask} from './simple-reference-shot';
import {referencePixels} from './garment-only';
import presets from './simple-face-presets.json';
const base={referenceUrl:'https://ref/front.png',garmentImageUrls:['https://erp/front.png','https://erp/back.png'],category:'top' as const,framing:'crop' as const};
describe('simple garment swap',()=>{
 it('front gets only its base and front garment, never an anchor',()=>{
  const shot=simpleReferenceShot({...base,view:'front',anchorImageUrl:'https://generated/front.png'});
  expect(shot.image_urls).toEqual([base.referenceUrl,base.garmentImageUrls[0]]);
  expect(shot.anchored).toBe(false);
  expect(shot.prompt).toContain('sole garment-color reference');
  expect(shot.prompt).not.toMatch(/4K|90 degrees|mid-thigh|waist to/);
 });
 it.each(['side','back','full'] as const)('%s takes the approved front render as image 3 for colour and construction',view=>{
  const shot=simpleReferenceShot({...base,view,anchorImageUrl:'https://generated/front.png'});
  expect(shot.image_urls).toHaveLength(3);
  expect(shot.image_urls[0]).toBe(base.referenceUrl);
  expect(shot.image_urls[2]).toBe('https://generated/front.png');
  expect(shot.anchored).toBe(true);
  expect(shot.prompt).toContain('Image 3 is this same garment already rendered on the front view');
  expect(shot.prompt).toContain('one single layer with one hem');
  expect(shot.prompt).not.toContain('sole garment-color reference');
 });
 it.each(['side','full'] as const)('%s without an anchor gets only its base and front garment',view=>{
  const shot=simpleReferenceShot({...base,view});
  expect(shot.image_urls).toEqual([base.referenceUrl,base.garmentImageUrls[0]]);
  expect(shot.anchored).toBe(false);
 });
 it('a top is worn alone: the plate tee is removed, bottoms and shoes kept',()=>{
  const top=simpleReferenceShot({...base,view:'front'});
  expect(top.prompt).toContain('remove any top or tee image 1 wears under it');
  expect(top.prompt).toContain('bottoms and shoes');
  const pants=simpleReferenceShot({...base,view:'front',category:'pants'});
  expect(pants.prompt).toContain('and other clothing');
  expect(pants.prompt).not.toContain('remove any top');
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
 it('names the garment cut from the listing title so the plate silhouette does not win',()=>{
  const shot=simpleReferenceShot({...base,view:'front',garmentName:'Seamed Handkerchief Hem Oversized Sweater Poncho'});
  expect(shot.prompt).toContain('The garment is a "Seamed Handkerchief Hem Oversized Sweater Poncho": reproduce that cut, silhouette, sleeve length and hem exactly, not the shape of the top image 1 wears.');
  const quoted=simpleReferenceShot({...base,view:'side',garmentName:'  "Odd"\nTitle  '});
  expect(quoted.prompt).toContain('The garment is a "Odd Title"');
  expect(simpleReferenceShot({...base,view:'front'}).prompt).not.toContain('The garment is a');
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
