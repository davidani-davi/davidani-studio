import {describe,it,expect,vi} from 'vitest';
vi.mock('./fal',()=>({generate:vi.fn(),uploadToFal:vi.fn()}));
import {directOutfitInput,directOutfitParams} from './direct-outfit';
const sources={front:'https://system.davidani.com/front.jpg',side:'https://system.davidani.com/side.jpg',back:'https://system.davidani.com/back.jpg',full:'https://system.davidani.com/full.jpg'};
describe('direct outfit contract',()=>{
 it.each(['front','side','back','full'])('edits the actual %s photo with shared identity, without legacy transforms',view=>{
  const input=directOutfitInput({view,identityId:'vision',outfitSources:sources,engine:'gpt25'});
  const p=directOutfitParams(input,['face','profile'],'keep the hem');
  expect(p.imageUrls[0]).toBe(sources[view as keyof typeof sources]);expect(p.imageUrls.slice(1,3)).toEqual(['face','profile']);
  expect(p.imageUrls).toHaveLength(4);expect(p.verbatimPrompt).toBe(true);expect(p.raw).toBeUndefined();expect(p.maskUrl).toBeUndefined();expect(p.outputSize).toBeNull();expect(p.useDefaultReference).toBe(false);expect(p.prompt).toContain('keep the hem');
 });
 it('rejects missing views instead of reusing front; rejects unsupported identities/engines',()=>{
  const b={view:'side',identityId:'celine',outfitSources:{front:sources.front},engine:'gpt2'};
  expect(()=>directOutfitInput(b)).toThrow(/side outfit/);
  expect(()=>directOutfitInput({...b,outfitSources:sources,identityId:'__proto__'})).toThrow(/Vision or Celine/);
  expect(()=>directOutfitInput({...b,outfitSources:sources,engine:'tryon'})).toThrow(/GPT or Nano/);
  expect(()=>directOutfitInput({...b,outfitSources:sources,modelId:'gpt-image-25'})).toThrow(/conflict/);
  expect(()=>directOutfitInput({...b,outfitSources:{side:'file:///tmp/x'}})).toThrow(/Invalid/);
 });
 it('permits one explicitly chosen view without invented support',()=>{
  const p=directOutfitParams(directOutfitInput({view:'back',identityId:'celine',outfitSources:{back:sources.back}}),['face','profile']);
  expect(p.imageUrls).toHaveLength(3);expect(p.prompt).not.toContain('Image 4');
 });
});

describe('customizable direct pose references',()=>{
 const body={view:'side',identityId:'vision',poseMode:'reference',humanModelId:'custom-vision',poseId:'pose-1',engine:'gpt25',outfitSources:{front:sources.front,back:sources.back},known:{title:'Floral pants set'}};
 it('generates missing angles from garment evidence, identity and the requested pose without transforms',()=>{
  const input=directOutfitInput({...body,anchorImageUrl:'https://fal.media/approved.png'});
  input.poseReference='https://store.public.blob.vercel-storage.com/side.png';input.framing='full';
  const p=directOutfitParams(input,['face','profile'],'relaxed hands');
  expect(p.imageUrls).toEqual([sources.front,'face','profile',input.poseReference,sources.back,'https://fal.media/approved.png']);
  expect(p.prompt).toContain('head to toe');expect(p.prompt).toContain('infer only necessary');expect(p.prompt).toContain('approved front');expect(p.prompt).toContain('Floral pants set');
  expect(p.maskUrl).toBeUndefined();expect(p.outputSize).toBeNull();expect(p.verbatimPrompt).toBe(true);
 });
 it('validates pose selection, garment front, anchor and server-resolved reference',()=>{
  expect(()=>directOutfitInput({...body,poseMode:'bad'})).toThrow(/pose source/);
  expect(()=>directOutfitInput({...body,poseId:''})).toThrow(/pose reference/);
  expect(()=>directOutfitInput({...body,outfitSources:{back:sources.back}})).toThrow(/front garment/);
  expect(()=>directOutfitInput({...body,anchorImageUrl:'file:///tmp/x'})).toThrow(/approved front/);
  expect(()=>directOutfitParams(directOutfitInput(body),['face','profile'])).toThrow(/pose reference/);
 });
 it('uses exact supplied back without inferring it and retains a face-free rear view',()=>{
  const input=directOutfitInput({...body,view:'back'});input.poseReference='https://example.com/back.png';input.framing='crop';
  const p=directOutfitParams(input,['face','profile']);expect(p.imageUrls[0]).toBe(sources.back);expect(p.prompt).not.toContain('infer only necessary');expect(p.prompt).toContain('true rear view');expect(p.prompt).toContain('head to mid-thigh');
 });
});
