import {describe,it,expect,vi} from 'vitest';
import sharp from 'sharp';
vi.mock('./fal',()=>({generate:vi.fn()}));
import {recolorParams,identityParams,protectGarment} from './real-shoot-protection';
const base:any={modelId:'gpt-image-25',imageUrls:['source','color','face','profile','detail'],prompt:'Operator correction: keep trim'};
describe('separate real-shoot edits',()=>{
 it('keeps identity images out of color pass and color references out of identity pass',()=>{
  expect(recolorParams(base).imageUrls).toEqual(['source','color','detail']);
  expect(recolorParams({...base,imageUrls:base.imageUrls.slice(0,4)}).imageUrls).toEqual(['source','color']);
  expect(identityParams(base,'recolored').imageUrls).toEqual(['recolored','face','profile']);
  expect(recolorParams(base).prompt).toContain('keep trim');
  expect(identityParams(base,'recolored').prompt).not.toContain('keep trim');
 });
 const png=(color:string,w=60)=>sharp({create:{width:w,height:60,channels:4,background:color}}).png().toBuffer();
 it('preserves interior garment pixels exactly and leaves face/background outside contour untouched',async()=>{
  const a=await png('#123456'),b=await png('#abcdef');const mask=Buffer.alloc(3600);
  for(let y=20;y<55;y++)for(let x=10;x<50;x++)mask[y*60+x]=255;
  const r=await protectGarment(a,b,mask,mask);
  expect(r.mask.length).toBe(3600);expect(r.report.protectedPixels).toBeGreaterThan(700);
  const data=await sharp(r.png).ensureAlpha().raw().toBuffer();
  expect([...data.subarray((35*60+30)*4,(35*60+30)*4+4)]).toEqual([18,52,86,255]);
  expect([...data.subarray(0,4)]).toEqual([171,205,239,255]);
 });
 it('excludes hair even when garment segmentation overlaps it',async()=>{
  const mask=Buffer.alloc(3600,255),hair=Buffer.alloc(3600);hair[30*60+30]=255;
  const r=await protectGarment(await png('#123456'),await png('#abcdef'),mask,mask,hair);
  const data=await sharp(r.png).ensureAlpha().raw().toBuffer();
  expect([...data.subarray((30*60+30)*4,(30*60+30)*4+4)]).toEqual([171,205,239,255]);
 });
 it('rejects moved clothing, empty masks and mismatched dimensions',async()=>{
  const a=await png('#123456'),b=await png('#abcdef');
  await expect(protectGarment(a,b,Buffer.alloc(3600,255),Buffer.alloc(3600))).rejects.toThrow(/moved/);
  await expect(protectGarment(a,b,Buffer.alloc(3600),Buffer.alloc(3600))).rejects.toThrow(/moved/);
  await expect(protectGarment(a,await png('#abcdef',61),Buffer.alloc(3600),Buffer.alloc(3600))).rejects.toThrow(/dimensions/);
 });
});

describe('segmentation failure handling',()=>{
 it('rejects missing credentials before making a request',async()=>{
  const {garmentMask}=await import('./real-shoot-protection');
  const old=process.env.FAL_KEY;delete process.env.FAL_KEY;
  try{await expect(garmentMask('url',60,60)).rejects.toThrow(/credentials/);}finally{if(old)process.env.FAL_KEY=old;}
 });
});
