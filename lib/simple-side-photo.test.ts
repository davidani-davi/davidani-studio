import {describe,it,expect} from 'vitest';
import {simpleReferenceShot} from './simple-reference-shot';
const front='https://erp/front.png',back='https://erp/back.png',side='https://erp/side.png',anchor='https://render/front.png';
const base={referenceUrl:'https://ref/view.png',garmentImageUrls:[front,back],category:'top' as const,framing:'crop' as const};
type View='front'|'side'|'back'|'full';
describe('real side photo of the garment (2026-10-30)',()=>{
 it('without a side photo nothing changes',()=>{
  for(const view of ['front','side','back','full'] as View[]){
   const before=simpleReferenceShot({...base,view,anchorImageUrl:anchor});
   const after=simpleReferenceShot({...base,view,anchorImageUrl:anchor,garmentSideUrl:undefined});
   expect(after.prompt).toBe(before.prompt);expect(after.image_urls).toEqual(before.image_urls);
   expect(after.prompt).not.toContain('SIDE PHOTO');expect(after.garmentSideUsed).toBe(false);
  }
 });
 it('the side view is built from the side photo, with the front render and product front behind it',()=>{
  const shot=simpleReferenceShot({...base,view:'side',anchorImageUrl:anchor,garmentSideUrl:side});
  expect(shot.image_urls).toEqual([base.referenceUrl,side,anchor,front]);
  expect(shot.garmentImageUrls).toEqual([side,anchor,front]);
  expect(shot.prompt).toContain('Image 2 is the product photographed from the side, the same angle as this view');
  expect(shot.prompt).toContain('Image 4 is the same product photographed from the front');
  expect(shot.garmentSideUsed).toBe(true);
 });
 it('front, full and back only check depth, length and side details against it',()=>{
  const f=simpleReferenceShot({...base,view:'front',anchorImageUrl:anchor,garmentSideUrl:side});
  expect(f.image_urls).toEqual([base.referenceUrl,front,side]);
  expect(f.prompt).toContain('Image 3 is the same product photographed from the side');
  expect(f.prompt).toContain('onto the front.');
  const full=simpleReferenceShot({...base,view:'full',anchorImageUrl:anchor,garmentSideUrl:side});
  expect(full.image_urls).toEqual([base.referenceUrl,front,anchor,side]);
  expect(full.prompt).toContain('Image 4 is the same product photographed from the side');
  const b=simpleReferenceShot({...base,view:'back',anchorImageUrl:anchor,garmentSideUrl:side});
  expect(b.image_urls).toEqual([base.referenceUrl,back,anchor,side]);
  expect(b.prompt).toContain('onto the back.');expect(b.prompt).not.toContain('no back photo is supplied');
 });
 it('an inferred back leans on the side photo for the hem and length',()=>{
  const b=simpleReferenceShot({...base,view:'back',garmentImageUrls:[front],anchorImageUrl:anchor,garmentSideUrl:side});
  expect(b.image_urls).toEqual([base.referenceUrl,front,anchor,side]);
  expect(b.garmentBackInferred).toBe(true);
  expect(b.prompt).toContain('since no back photo is supplied');
 });
 it('a side photo that repeats the front or back is ignored',()=>{
  for(const repeat of [front,back]){
   const shot=simpleReferenceShot({...base,view:'side',anchorImageUrl:anchor,garmentSideUrl:repeat});
   expect(shot.image_urls).toEqual([base.referenceUrl,front,anchor]);expect(shot.garmentSideUsed).toBe(false);
  }
 });
 it('the prompt never names an image that was not sent',()=>{
  for(const view of ['front','side','back','full'] as View[]) for(const a of [anchor,undefined]) for(const s of [side,undefined]) for(const urls of [[front,back],[front]]) for(const category of ['top','pants','dress'] as const){
   const shot=simpleReferenceShot({...base,category,view,anchorImageUrl:a,garmentSideUrl:s,garmentImageUrls:urls,fitSource:'style',styleNotes:['NAVY side: hem at the hip']});
   // Fronts without a render or side photo have carried this conditional sentence since PR #17; it names no image there.
   const prompt=s||(a&&view!=='front')?shot.prompt:shot.prompt.replace(' If image 3 omits a product detail visible in image 2, restore the detail from image 2 instead of copying that omission.','');
   const over=[...prompt.matchAll(/\bimage (\d)\b/gi)].filter(m=>Number(m[1])>shot.image_urls.length).map(m=>prompt.slice(Math.max(0,m.index!-140),m.index!+40));
   expect(over,JSON.stringify({view,anchor:!!a,side:!!s,photos:urls.length,category})).toEqual([]);
   expect(shot.garmentImageUrls).toEqual(shot.image_urls.slice(1));
  }
 });
});
