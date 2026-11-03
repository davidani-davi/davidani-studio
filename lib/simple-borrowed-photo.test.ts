import {describe,it,expect} from 'vitest';
import {simpleReferenceShot} from './simple-reference-shot';
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
 });
});
