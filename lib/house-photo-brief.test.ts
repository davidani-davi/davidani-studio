import { describe, expect, it } from 'vitest';
import { housePhotoBrief, usesHousePhotoBrief } from './house-photo-brief';
const base = { known:{title:'Distressed Tiger Graphic Tee',color:'Pink / S-M-L(2-2-2)',fabric:'100% cotton'}, garment:'tee',category:'top',view:'front' as const,framing:'crop' as const,hasBackPhoto:false,hasAnchor:false,hasFace:false };
describe('reference photographic finish',()=>{
  it('keeps the edit focused on product evidence and the reference finish',()=>{
    const p=housePhotoBrief(base);
    expect(p).toContain('Color: Pink.');expect(p).not.toContain('S-M-L');expect(p).toContain('100% cotton');
    expect(p).toContain('Preserve the woman’s face');expect(p).toContain('gentle tonal transitions');
    expect(p).toContain('print placement and scale');expect(p).toContain('clothing outside the replacement area unchanged');
    expect(p).not.toMatch(/4K|editorial|wrist|high-detail/);expect(p.split(/\s+/).length).toBeLessThan(250);
  });
  it('handles missing title, fabric and color without inventing facts',()=>{
    const p=housePhotoBrief({...base,known:{},garment:'zip-front cardigan'});
    expect(p).toContain('Product: zip-front cardigan.');expect(p).not.toContain('Fabric:');
    expect(housePhotoBrief({...base,known:{},garment:''})).toContain('Product: garment.');
  });
  it('keeps slash-separated color names and honors full-look styling and corrections',()=>{
    const p=housePhotoBrief({...base,known:{color:'NAVY/BLUE'},styling:'plain black trousers',note:'Keep the zipper open.'});
    expect(p).toContain('NAVY/BLUE');expect(p).toContain('Styling: plain black trousers');expect(p).toContain('Keep the zipper open.');
    expect(p).not.toContain('clothing outside the replacement area');
  });
  it('keeps rear artwork confined to the correct side and distinguishes a real back photo',()=>{
    const p=housePhotoBrief({...base,view:'back',hasAnchor:true});
    expect(p).toContain('finished front from this same shoot');expect(p).toContain('Render a plain back');expect(p).toContain('no face');expect(p).toContain('same side of her body');
    const paired=housePhotoBrief({...base,view:'back',hasBackPhoto:true});
    expect(paired).toContain('Photo 3 is the back');expect(paired).not.toContain('Render a plain back');
  });
  it('changes angle and framing while using the front and head crop for continuity',()=>{
    const side=housePhotoBrief({...base,view:'side',hasAnchor:true,hasFace:true});
    expect(side).toContain('true side profile');expect(side).toContain('head to mid-thigh');expect(side).toContain('identity only');
    expect(side).not.toContain('expression, hands');
    const full=housePhotoBrief({...base,view:'full',framing:'full',hasAnchor:true});expect(full).toContain('including her feet');
    const low=housePhotoBrief({...base,view:'side',category:'pants',framing:'low'});expect(low).toContain('lower body');expect(low).toContain('waist to shoes');
  });
  it('targets GPT 2.5 house defaults without replacing explicit experiments or other models',()=>{
    for(const family of ['studio','crop','low'])for(const id of [97,98,99,100]) expect(usesHousePhotoBrief('gpt-image-25',`${family} ${id}`,'native4k')).toBe(true);
    for(const args of [['gpt-image','studio 98','native4k'],['nano-banana','studio 98','native4k'],['gpt-image-25','studio 10','native4k'],['gpt-image-25','studio 98','lean'],['gpt-image-25','studio 98','masked'],['gpt-image-25','studio 98','auto']]) expect(usesHousePhotoBrief(...args as [string,string,string])).toBe(false);
  });
});
