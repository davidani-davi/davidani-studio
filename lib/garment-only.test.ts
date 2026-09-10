import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import { referencePixels, editMask, compositeGarment, validateEdit, type GarmentEdit } from './garment-only';
async function fixture() {
 const bytes=await sharp({create:{width:64,height:96,channels:4,background:{r:37,g:67,b:91,alpha:1}}}).png().toBuffer();
 const ref=await referencePixels(bytes);
 const edit:GarmentEdit={version:1,referencePath:'/models/a/front.png',referenceSha256:ref.sha256,width:64,height:96,reviewed:true,protectedHeadReviewed:true,
 regions:[[[.1,.1],[.9,.1],[.9,.95],[.1,.95]]],protectedRegions:[[[.2,0],[.8,0],[.8,.35],[.2,.35]]]};
 return {ref,edit};
}
describe('garment-only hard pixel preservation',()=>{
 it('retains every excluded pixel even when the model changes the entire frame, including overlapping head paint',async()=>{
  const {ref,edit}=await fixture(),mask=await editMask(edit,ref,true);
  const evil=await sharp({create:{width:128,height:192,channels:4,background:'#ff1111'}}).png().toBuffer();
  const {png,report}=await compositeGarment(ref,evil,mask),out=await sharp(png).ensureAlpha().raw().toBuffer();
  expect(report.changedProtectedPixels).toBe(0);expect(report.protectedSourceSha256).toBe(report.protectedOutputSha256);
  expect(report.width).toBe(64);expect(report.height).toBe(96);
  expect(mask[20*64+32]).toBe(0);expect(out.subarray((20*64+32)*4,(20*64+32)*4+4)).toEqual(ref.data.subarray((20*64+32)*4,(20*64+32)*4+4));
  expect(out[60*64*4+32*4]).not.toBe(ref.data[60*64*4+32*4]);
  for(let i=0;i<mask.length;i++)if(!mask[i])expect(out.subarray(i*4,i*4+4)).toEqual(ref.data.subarray(i*4,i*4+4));
 });
 it('keeps asymmetric mask geometry and feathers only inward',async()=>{
  const {ref,edit}=await fixture();
  const mask=await editMask({...edit,regions:[[[.5,.5],[.9,.5],[.9,.9],[.5,.9]]],protectedRegions:[]},ref,false);
  expect(mask.length).toBe(64*96);
  expect(mask[70*64+45]).toBe(255);
  expect(mask[60*64+35]).toBe(255);
  expect(mask[48*64+32]).toBeGreaterThan(0);
  expect(mask[48*64+32]).toBeLessThan(255);
  expect(mask[47*64+40]).toBe(0);
  expect(mask[60*64+31]).toBe(0);
 });
 it('requires matching reference dimensions/hash and head review before work',async()=>{
  const {ref,edit}=await fixture();
  await expect(editMask({...edit,width:65},ref,true)).rejects.toThrow('reference changed');
  await expect(editMask({...edit,referenceSha256:'a'.repeat(64)},ref,true)).rejects.toThrow('reference changed');
  await expect(editMask({...edit,protectedRegions:[]},ref,true)).rejects.toThrow('protected head');
  await expect(editMask({...edit,protectedHeadReviewed:false},ref,true)).rejects.toThrow('protected head');
  await expect(editMask({...edit,protectedRegions:[]},ref,false)).resolves.toBeInstanceOf(Buffer);
 });
 it('rejects invalid, empty and degenerate masks',async()=>{
  const {ref,edit}=await fixture();
  for(const e of [null,{...edit,regions:[]},{...edit,reviewed:false},{...edit,regions:[[[NaN,0],[0,0],[1,1]]]},{...edit,regions:[[[2,0],[0,0],[1,1]]]}])expect(()=>validateEdit(e)).toThrow();
  await expect(editMask({...edit,regions:[[[0,0],[0,0],[0,0]]]},ref,false)).rejects.toThrow();
  await expect(editMask({...edit,protectedRegions:[[[0,0],[.001,0],[.001,.001]]]},ref,true)).rejects.toThrow('too small');
 });
 it('refuses aspect ratio and mask-size mismatch instead of stretching the frame',async()=>{
  const {ref,edit}=await fixture(),mask=await editMask(edit,ref,true);
  const square=await sharp({create:{width:64,height:64,channels:3,background:'red'}}).png().toBuffer();
  await expect(compositeGarment(ref,square,mask)).rejects.toThrow('framing');
  await expect(compositeGarment(ref,square,Buffer.alloc(1))).rejects.toThrow('dimensions');
 });
});
