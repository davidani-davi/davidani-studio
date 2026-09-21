import {describe,it,expect} from 'vitest';
import {contourFaceMask} from './contour-face-mask';
const ref={width:100,height:100,sha256:'reviewed',data:Buffer.alloc(40000)};
const reviewed={width:100,height:100,sha256:'reviewed',points:[[30,20],[65,25],[70,50],[48,65],[25,45]] as [number,number][],featherPixels:10};
describe('reviewed contour candidate',()=>{
 it('preserves interior and feathers only outward with bounded support',()=>{
  const m=contourFaceMask(ref,reviewed);
  expect(m[40*100+45]).toBe(0);expect(m[65*100+48]).toBe(0);
  expect(m[70*100+48]).toBeGreaterThan(0);expect(m[70*100+48]).toBeLessThan(255);
  expect(m[76*100+48]).toBe(255);
  for(let y=0;y<100;y++){expect(m[y*100]).toBe(255);expect(m[y*100+99]).toBe(255);}
  for(let y=76;y<100;y++)expect([...m.subarray(y*100,(y+1)*100)].every(v=>v===255)).toBe(true);
 });
 it('fails closed on changed assets and invalid review coordinates',()=>{
  expect(()=>contourFaceMask({...ref,sha256:'changed'},reviewed)).toThrow('changed');
  for(const patch of [{width:99},{height:99}])expect(()=>contourFaceMask(ref,{...reviewed,...patch})).toThrow('changed');
  for(const patch of [{featherPixels:0},{featherPixels:NaN},{featherPixels:30},{points:[[NaN,0],[1,1],[2,2]]},{points:[[100,0],[1,1],[2,2]]},{points:[[0,0]]}])expect(()=>contourFaceMask(ref,{...reviewed,...patch} as typeof reviewed)).toThrow('Invalid');
 });
});
