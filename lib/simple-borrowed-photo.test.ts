import {describe,it,expect} from 'vitest';
import {simpleReferenceShot,parseGarmentBorrowed,borrowRefusal} from './simple-reference-shot';
const front='https://erp/front.png',back='https://erp/back.png',side='https://erp/side.png',anchor='https://render/front.png';
const base={referenceUrl:'https://ref/view.png',garmentImageUrls:[front,back],category:'top' as const,framing:'crop' as const,color:'PINK',garmentName:'Star Patch Swan Graphic Raglan Sweatshirt'};
type View='front'|'side'|'back'|'full';
const views:View[]=['front','side','back','full'];
const combos=views.flatMap(view=>[true,false].flatMap(a=>[true,false].flatMap(b=>[true,false].map(s=>[`${view}${a?' anchor':''}${b?' back':''}${s?' side':''}`,{view,a,b,s}] as const))));
const shotFor=(c:{view:View;a:boolean;b:boolean;s:boolean})=>({...base,view:c.view,garmentImageUrls:c.b?[front,back]:[front],...(c.a?{anchorImageUrl:anchor}:{}),...(c.s?{garmentSideUrl:side}:{})});

// Borrowed colourway photos (2026-11-03, DET60372 Pink from Deep Blue). Without a borrow, nothing may change.
describe('borrowed colourway photos',()=>{
 it.each(combos)('unchanged without a borrow: %s',(_name,c)=>{
  const r=simpleReferenceShot(shotFor(c));
  expect({prompt:r.prompt,image_urls:r.image_urls}).toMatchSnapshot();
  expect(r.garmentBorrowedUsed).toBeUndefined();
 });
 const DB='DEEP BLUE';
 it('a borrowed back is image 2 on the back view: shape and print placement only, colours from the front render',()=>{
  const r=simpleReferenceShot({...base,view:'back',anchorImageUrl:anchor,garmentBorrowed:{back:DB}});
  expect(r.image_urls).toEqual([base.referenceUrl,back,anchor]);
  expect(r.prompt).toContain('Image 2 shows this same garment in another colourway (DEEP BLUE).');
  expect(r.prompt).toContain('Match its cut, length, construction and print placement');
  expect(r.prompt).not.toContain('Match its fabric, cut, length, print and construction.');
  expect(r.prompt).toContain('Every colour (body, ribbing, trims, patches and print ink) comes from image 3 (this garment already rendered on the front view).');
  expect(r.prompt).toContain('same ink colour as the print on image 3');
  expect(r.prompt).toContain("if image 3 shows no print, keep image 2's ink colour.");
  expect(r.prompt).toContain('No deep blue on the garment.');
  expect(r.prompt).toContain('its dye finish and colour exactly as image 3 shows');
  expect(r.garmentBorrowedUsed).toEqual({back:true});
 });
 it('a borrowed back and side from one colour share one block',()=>{
  const r=simpleReferenceShot({...base,view:'back',anchorImageUrl:anchor,garmentSideUrl:side,garmentBorrowed:{back:DB,side:DB}});
  expect(r.image_urls).toEqual([base.referenceUrl,back,anchor,side]);
  expect(r.prompt).toContain('Images 2 and 4 show this same garment in another colourway (DEEP BLUE).');
  expect(r.prompt).toContain('only images 2 and 4 show');
  expect(r.prompt).toContain('keep their ink colour.');
  expect(r.prompt.match(/BORROWED PHOTO:/g)).toHaveLength(1);
  expect(r.garmentBorrowedUsed).toEqual({back:true,side:true});
 });
 it('a borrowed side on the side view takes its ink from the colour\'s own front photo',()=>{
  const r=simpleReferenceShot({...base,view:'side',anchorImageUrl:anchor,garmentSideUrl:side,garmentBorrowed:{side:DB}});
  expect(r.image_urls).toEqual([base.referenceUrl,side,anchor,front]);
  expect(r.prompt).toContain('Image 2 shows this same garment in another colourway (DEEP BLUE).');
  expect(r.prompt).toContain('comes from image 3 (this garment already rendered on the front view) and image 4 (the PINK product photograph).');
  expect(r.prompt).toContain('same ink colour as the print on image 4');
  expect(r.prompt).toContain('Match its cut, length, construction and print placement');
  expect(r.garmentBorrowedUsed).toEqual({side:true});
 });
 it('a borrowed side view with no front render takes its colour from the colour\'s own front photo, never image 2',()=>{
  const r=simpleReferenceShot({...base,view:'side',garmentSideUrl:side,garmentBorrowed:{side:DB}});
  expect(r.image_urls).toEqual([base.referenceUrl,side,front]);
  expect(r.prompt).toContain('Image 3 is the sole garment-color reference');
  expect(r.prompt).not.toContain('Image 2 is the sole garment-color reference');
 });
 it('a borrowed back with nothing of its own colour to read is refused',()=>{
  expect(()=>simpleReferenceShot({...base,view:'back',garmentBorrowed:{back:DB}})).toThrow('Make the front first');
 });
 it('the front view never sends the back, and keeps its opening when only the side is borrowed',()=>{
  const r=simpleReferenceShot({...base,view:'front',garmentSideUrl:side,garmentBorrowed:{back:DB,side:DB}});
  expect(r.image_urls).toEqual([base.referenceUrl,front,side]);
  expect(r.prompt).toContain('Image 3 shows this same garment in another colourway (DEEP BLUE).');
  expect(r.prompt).toContain('comes from image 2 (the PINK product photograph).');
  expect(r.prompt).toContain('Match its fabric, cut, length, print and construction.');
  expect(r.garmentBorrowedUsed).toEqual({side:true});
 });
 it('the full view names the borrowed side after the front render',()=>{
  const r=simpleReferenceShot({...base,view:'full',anchorImageUrl:anchor,garmentSideUrl:side,garmentBorrowed:{side:DB}});
  expect(r.image_urls).toEqual([base.referenceUrl,front,anchor,side]);
  expect(r.prompt).toContain('Image 4 shows this same garment in another colourway (DEEP BLUE).');
  expect(r.prompt).toContain('same ink colour as the print on image 2');
 });
 it('a borrow whose photo is not sent changes nothing',()=>{
  const o={...base,view:'back' as const,garmentImageUrls:[front],anchorImageUrl:anchor};
  const r=simpleReferenceShot({...o,garmentBorrowed:{back:DB}});
  expect(r.prompt).toBe(simpleReferenceShot(o).prompt);
  expect(r.image_urls).toEqual(simpleReferenceShot(o).image_urls);
  expect(r.garmentBorrowedUsed).toEqual({});
 });
 it('parseGarmentBorrowed keeps only back and side colour names',()=>{
  expect(parseGarmentBorrowed({back:' DEEP BLUE ',side:3,front:'X'})).toEqual({back:'DEEP BLUE'});
  expect(parseGarmentBorrowed({})).toBeUndefined();
  expect(parseGarmentBorrowed(null)).toBeUndefined();
  expect(parseGarmentBorrowed({back:'X'.repeat(41)})).toBeUndefined();
  expect(parseGarmentBorrowed({back:'BLACK',side:'DEEP BLUE'})).toEqual({back:'BLACK',side:'DEEP BLUE'});
 });
 it('borrowRefusal: GPT Image 2.5 in Simple only, and a borrowed back needs the front render',()=>{
  const ok={borrowed:{back:DB},editMode:'simple',modelId:'gpt-image-25',view:'back',hasBackPhoto:true,anchorImageUrl:anchor};
  expect(borrowRefusal(ok)).toBe('');
  expect(borrowRefusal({...ok,modelId:'gpt-image'})).toBe('Borrowed photos need GPT Image 2.5 in Simple mode.');
  expect(borrowRefusal({...ok,editMode:'direct'})).toBe('Borrowed photos need GPT Image 2.5 in Simple mode.');
  expect(borrowRefusal({...ok,anchorImageUrl:undefined})).toBe('Make the front first: a borrowed back photo takes its colours from the front render.');
  expect(borrowRefusal({...ok,borrowed:{side:DB},anchorImageUrl:undefined})).toBe('');
  expect(borrowRefusal({...ok,borrowed:undefined,modelId:'gpt-image',editMode:'direct'})).toBe('');
 });
});
