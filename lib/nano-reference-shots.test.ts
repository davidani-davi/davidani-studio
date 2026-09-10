import { describe, it, expect, vi } from 'vitest';
vi.mock('@fal-ai/client', () => ({ fal: { config: vi.fn(), subscribe: vi.fn() } }));
import { fal } from '@fal-ai/client';
import { buildReferenceShot, runReferenceShot, NANO_REFERENCE_ENDPOINT } from './nano-reference-shots';
const base = { referenceUrl: 'https://ref/front.png', garmentImageUrls: ['https://erp/front.jpg', 'https://erp/back.jpg'], category: 'top' as const, framing: 'crop' as const };
describe('approved Nano Pro reference workflow', () => {
  it('front edits the existing model using original ERP, at native 1K PNG', () => {
    const input=buildReferenceShot({...base,view:'front'});
    expect(input.image_urls).toEqual([base.referenceUrl,base.garmentImageUrls[0]]);
    expect(input).toMatchObject({resolution:'1K',aspect_ratio:'2:3',output_format:'png',num_images:1});
  });
  it.each(['side','back','full'] as const)('anchors %s directly to front and original identity', view => {
    const input=buildReferenceShot({...base,view,anchorImageUrl:'https://output/front.png'});
    expect(input.image_urls).toEqual(['https://output/front.png',base.referenceUrl,base.garmentImageUrls[view==='back'?1:0]]);
    expect(input.resolution).toBe('1K');
  });
  it('requires a front before generating other views',()=>{
    expect(()=>buildReferenceShot({...base,view:'side'})).toThrow('Generate the front first');
  });
  it('does not claim a back reference exists when absent',()=>{
    const input=buildReferenceShot({...base,view:'back',garmentImageUrls:['https://erp/front.jpg'],anchorImageUrl:'https://output/front.png'});
    expect(input.prompt).toContain('No back photo is supplied');
  });
  it('preserves category scope and operator correction',()=>{
    const input=buildReferenceShot({...base,view:'front',category:'pants',framing:'low',color:'Blue',note:'Keep the side pockets.'});
    expect(input.prompt).toContain('only the bottoms');
    expect(input.prompt).toContain('waist to both shoes');
    expect(input.prompt).toContain('Keep the side pockets.');
  });
  it('returns the provider output unchanged after exactly one call',async()=>{
    vi.stubEnv('FAL_KEY','test');
    vi.mocked(fal.subscribe).mockResolvedValueOnce({data:{images:[{url:'https://output/native.png'}]},requestId:'job'} as never);
    const input=buildReferenceShot({...base,view:'front'});
    expect(await runReferenceShot(input)).toEqual({url:'https://output/native.png',requestId:'job'});
    expect(fal.subscribe).toHaveBeenCalledExactlyOnceWith(NANO_REFERENCE_ENDPOINT,{input,logs:false});
    vi.unstubAllEnvs();
  });
  it('rejects empty provider results',async()=>{
    vi.stubEnv('FAL_KEY','test');
    vi.mocked(fal.subscribe).mockResolvedValueOnce({data:{images:[]}} as never);
    await expect(runReferenceShot(buildReferenceShot({...base,view:'front'}))).rejects.toThrow('returned no image');
    vi.unstubAllEnvs();
  });
});
