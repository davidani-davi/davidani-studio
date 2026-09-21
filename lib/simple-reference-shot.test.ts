import {describe,it,expect} from 'vitest';
import fs from 'node:fs';
import {simpleReferenceShot,simpleFaceMask} from './simple-reference-shot';
import {referencePixels,compositeGarment} from './garment-only';
import sharp from 'sharp';
import presets from './simple-contour-presets.json';
import {contourFaceMask} from './contour-face-mask';
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
  expect(shot.prompt).toContain('image 2 remains the authority for construction and small details');
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
 it('the removed plate layer must be gone, not ghosted underneath the new garment (DJ60404 shoulder + cuff artifacts)',()=>{
  const top=simpleReferenceShot({...base,view:'front'});
  expect(top.prompt).toContain('neckline, shoulders, cuffs or below the hem');
  expect(top.prompt).toContain('The removed layer must be completely gone, not blended or faded beneath the new garment — no ghosting, no translucent patches, no doubled collar, cuff or fabric anywhere on the body, including at the wrists and sleeve ends.');
  const pants=simpleReferenceShot({...base,view:'front',category:'pants'});
  expect(pants.prompt).not.toContain('no ghosting');
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
  expect(shot.prompt).toContain('The garment is a "Seamed Handkerchief Hem Oversized Sweater Poncho": reproduce that cut, silhouette, sleeve length and hem exactly as shown in image 2, the actual garment photograph — image 2 alone decides where the hem falls, never the shape, length or proportions of the top image 1 wears.');
  const quoted=simpleReferenceShot({...base,view:'side',garmentName:'  "Odd"\nTitle  '});
  expect(quoted.prompt).toContain('The garment is a "Odd Title"');
  expect(simpleReferenceShot({...base,view:'front'}).prompt).not.toContain('The garment is a');
 });
 it('names image 2, not image 1, as the sole source of hem length',()=>{
  const shot=simpleReferenceShot({...base,view:'front',garmentName:'Tapestry Floral Cotton Twill Shirt Jacket'});
  expect(shot.prompt).toContain('reproduce that cut, silhouette, sleeve length and hem exactly as shown in image 2, the actual garment photograph — image 2 alone decides where the hem falls');
 });
 it('offers hip-length as a checkpoint for a shirt jacket/shacket with no length word in its title (DJ60404), never as a hard override of the photo',()=>{
  const shot=simpleReferenceShot({...base,view:'front',garmentName:'Tapestry Floral Cotton Twill Shirt Jacket'});
  expect(shot.prompt).toContain('As a checkpoint, a "Tapestry Floral Cotton Twill Shirt Jacket" like this is typically hip-length (the hem falls at the hip, at or just below the waistband) — but image 2\'s own proportions decide the actual hem');
 });
 it('offers knee-length as a checkpoint for a coat with no length word in its title',()=>{
  const shot=simpleReferenceShot({...base,view:'front',garmentName:'Wool Blend Peacoat'});
  expect(shot.prompt).toContain('typically knee-length (the hem falls at or just below the knee)');
 });
 it('does not assert a length checkpoint when the title has none and is not a coat/shacket/shirt jacket',()=>{
  const shot=simpleReferenceShot({...base,view:'front',garmentName:'Seamed Handkerchief Hem Oversized Sweater Poncho'});
  expect(shot.prompt).not.toContain('As a checkpoint');
 });
 it('an operator note about length is never fought by the default checkpoint',()=>{
  const shot=simpleReferenceShot({...base,view:'front',garmentName:'Tapestry Floral Cotton Twill Shirt Jacket',note:'Make the hem longer, closer to mid-thigh.'});
  expect(shot.prompt).not.toContain('As a checkpoint');
  expect(shot.prompt).toContain('Requested change: Make the hem longer, closer to mid-thigh.');
 });
 it('requires two input roles',()=>expect(()=>simpleReferenceShot({...base,view:'front',garmentImageUrls:[]})).toThrow());
 it('requires an exact contour review, including back and headless references',async()=>{
  const ref=await referencePixels(fs.readFileSync('public/models/crop 100/front.png'));
  expect(()=>simpleFaceMask({...ref,sha256:'changed'},'/models/crop 100/front.png','front','crop')).toThrow('reference changed');
  for(const view of ['front','back']) expect(()=>simpleFaceMask(ref,'/models/custom/front.png',view,'low')).toThrow('contour review');
  // An old row review must never enable a new asset.
  expect(()=>simpleFaceMask(ref,'/unknown','front','crop',{...ref,protectedRows:200,transitionRows:5})).toThrow('contour review');
 });
 it.each(Object.entries(presets))('validates reviewed catalog record %s',async(path,preset)=>{
  const ref=path.startsWith('/') ? await referencePixels(fs.readFileSync('public'+path)) : {...preset,data:Buffer.alloc(0)};
  expect(ref.sha256).toBe(preset.sha256);
  const mask=simpleFaceMask(ref,path+'?cache=1','back','low');
  if(preset.kind==='no-head') {expect(mask).toBeUndefined();return;}
  expect(mask!.some(v=>v===0)).toBe(true);
  expect(mask!.subarray(preset.garmentBoundaryY*ref.width).every(v=>v===255)).toBe(true);
  for(let y=0;y<ref.height;y++){expect(mask![y*ref.width]).toBe(255);expect(mask![y*ref.width+ref.width-1]).toBe(255);}
 });
 it('preserves the face exactly and releases clothing and backdrop under a tone mismatch',async()=>{
  const width=64,height=128;
  const source=Buffer.alloc(width*height*4,255);
  for(let y=40;y<height;y++)for(let x=0;x<width;x++)source.set([220,30,80,255],(y*width+x)*4);
  const ref=await referencePixels(await sharp(source,{raw:{width,height,channels:4}}).png().toBuffer());
  const mask=contourFaceMask(ref,{width,height,sha256:ref.sha256,points:[[24,8],[40,8],[40,25],[32,30],[24,25]],featherPixels:8});
  const generated=await sharp({create:{width,height,channels:4,background:'#303030'}}).png().toBuffer();
  const {png,report}=await compositeGarment(ref,generated,mask,{matchSeam:false});
  const out=await sharp(png).ensureAlpha().raw().toBuffer();const clean=await sharp(generated).ensureAlpha().raw().toBuffer();
  for(let i=0;i<mask.length;i++){
    if(mask[i]===0)expect(out.subarray(i*4,i*4+4)).toEqual(source.subarray(i*4,i*4+4));
    if(mask[i]===255)expect(out.subarray(i*4,i*4+4)).toEqual(clean.subarray(i*4,i*4+4));
  }
  expect(out.subarray(40*width*4)).toEqual(clean.subarray(40*width*4));
  expect(report.changedProtectedPixels).toBe(0);
 });
});

// Contrast thread is a product feature, even when styling/jewelry is removed.
it.each(['front','side','back','full'] as const)('retains source construction authority for %s',view=>{
 const shot=simpleReferenceShot({...base,view,anchorImageUrl:'https://generated/front.png'});
 expect(shot.prompt).toContain('never replace contrasting thread with fabric-colored stitching');
 expect(shot.prompt).toContain('Removing styling layers or jewelry must not remove garment stitching');
 expect(shot.prompt).toContain('restore the detail from image 2 instead of copying that omission');
});
it('Celine 3 contour leaves neckline contrast stitching completely unchanged',async()=>{
 const source=fs.readFileSync('public/models/studio 102/front.png');
 const ref=await referencePixels(source),mask=simpleFaceMask(ref,'/models/studio 102/front.png','front','crop')!;
 // The affected visible neckline spans below y=420 in the 1024x1536 output.
 // Test the more conservative entire garment area from the reviewed boundary.
 const boundary=presets['/models/studio 102/front.png'].garmentBoundaryY;
 expect(mask.subarray(boundary*ref.width).every(a=>a===255)).toBe(true);
 const candidate=Buffer.from(ref.data);
 for(let y=420;y<426;y++)for(let x=480;x<660;x++)candidate.set([232,90,155,255],(y*ref.width+x)*4);
 const raw=await sharp(candidate,{raw:{width:ref.width,height:ref.height,channels:4}}).png().toBuffer();
 const composed=await compositeGarment(ref,raw,mask,{matchSeam:false});
 const pixels=await sharp(composed.png).ensureAlpha().raw().toBuffer();
 expect(pixels.subarray(boundary*ref.width*4).equals(candidate.subarray(boundary*ref.width*4))).toBe(true);
 expect(composed.report.changedProtectedPixels).toBe(0);
});

it.each(['front','side','back','full'] as const)('enforces product sleeve coverage without relying on a title for %s',view=>{
 const shot=simpleReferenceShot({...base,view,anchorImageUrl:'https://generated/front.png'});
 expect(shot.prompt).toContain('If it shows long sleeves, render full-length sleeves down to the wrists in every view');
 expect(shot.prompt).toContain('If the source is short-sleeved or sleeveless, preserve that instead');
 expect(shot.garmentImageUrls).toEqual(shot.image_urls.slice(1));
});
it('does not impose sleeve changes on a bottoms-only swap',()=>{
 const shot=simpleReferenceShot({...base,view:'side',category:'pants'});
 expect(shot.prompt).not.toContain('SLEEVE CONSTRUCTION:');
});
