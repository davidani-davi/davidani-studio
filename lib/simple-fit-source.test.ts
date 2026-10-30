import {describe,it,expect} from 'vitest';
import {simpleReferenceShot} from './simple-reference-shot';
const base={referenceUrl:'https://ref/front.png',garmentImageUrls:['https://erp/front.png'],category:'top' as const,framing:'crop' as const,view:'front' as const,garmentName:'Oversized Cable Knit Sweater'};
describe('Simple fit source (Fit + pose / Pose only)',()=>{
 it('Fit + pose is the prompt every earlier run used; colour notes are ignored there',()=>{
  const before=simpleReferenceShot(base);
  const fitPose=simpleReferenceShot({...base,fitSource:'reference',styleNotes:['NAVY front: sleeves to the wrist']});
  expect(fitPose.prompt).toBe(before.prompt);
  expect(fitPose.fitSource).toBe('reference');
  expect(before.prompt).not.toContain('POSE ONLY');
 });
 it('Pose only lends the pose alone and states the style fit from the title',()=>{
  const shot=simpleReferenceShot({...base,fitSource:'style'});
  expect(shot.fitSource).toBe('style');
  expect(shot.prompt).toContain("POSE ONLY: Image 1 lends only the wearer, her pose, framing, background and lighting.");
  expect(shot.prompt).toContain("How image 1's own clothing fits is not a reference");
  expect(shot.prompt).toContain('This style is oversized and roomy');
  // Sleeve length comes from image 2: a short-sleeve oversized tee must not be told "to the wrist".
  expect(shot.prompt).toContain('just off her natural shoulder line.');
  expect(shot.prompt).not.toContain('sleeves ending at the wrist');
  const relaxed=simpleReferenceShot({...base,garmentName:'Relaxed Graphic Tee',fitSource:'style'});
  expect(relaxed.prompt).toContain('This style is relaxed through the body, shoulder seams at her natural shoulder line.');
  expect(shot.prompt.indexOf('POSE ONLY')).toBeLessThan(shot.prompt.indexOf('GARMENT EASE'));
  expect(shot.image_urls).toEqual([base.referenceUrl,base.garmentImageUrls[0]]);
 });
 it('Pose only carries the other colours’ notes, and the typed change wins over them',()=>{
  const shot=simpleReferenceShot({...base,fitSource:'style',note:'shorter hem',styleNotes:['NAVY front: sleeves to the wrist','BLACK side: "looser" body']});
  expect(shot.prompt).toContain('"NAVY front: sleeves to the wrist"; "BLACK side: looser body"');
  expect(shot.prompt).toContain('The requested change at the end wins over these notes.');
  expect(shot.prompt).toMatch(/Requested change: shorter hem$/);
  const noNote=simpleReferenceShot({...base,fitSource:'style',styleNotes:['NAVY front: sleeves to the wrist']});
  expect(noNote.prompt).not.toContain('wins over these notes');
  const none=simpleReferenceShot({...base,fitSource:'style'});
  expect(none.prompt).not.toContain("other colours");
 });
 it('bottoms read the leg shape from the title; tops never do',()=>{
  const pants=simpleReferenceShot({...base,category:'pants',framing:'low',garmentName:'High Rise Wide Leg Denim Pants',fitSource:'style'});
  expect(pants.prompt).toContain('rise, leg or skirt width, taper or flare and hem length');
  expect(pants.prompt).toContain('wide-leg: the legs fall wide');
  const top=simpleReferenceShot({...base,garmentName:'Wide Leg Look Flared Sleeve Top',fitSource:'style'});
  expect(top.prompt).not.toContain('wide-leg:');
  expect(top.prompt).not.toContain('flared:');
  const plain=simpleReferenceShot({...base,garmentName:'Ribbed Knit Top',fitSource:'style'});
  expect(plain.prompt).not.toContain('This style is');
 });
 it('fitted words come from the title only, roomy ones from the description too',()=>{
  const desc=simpleReferenceShot({...base,garmentName:'Knit Top',garmentDescription:'A relaxed everyday knit.',fitSource:'style'});
  expect(desc.prompt).toContain('This style is relaxed');
  const slim=simpleReferenceShot({...base,garmentName:'Knit Top',garmentDescription:'Pairs with slim jeans.',fitSource:'style'});
  expect(slim.prompt).not.toContain('This style is');
 });
});
