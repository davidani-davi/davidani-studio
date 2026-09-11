import {describe,it,expect} from 'vitest';
import {matchesLibrarySection,libraryLabel,libraryPoses,isDerivedReference} from './model-library';
import type {ManagedModel} from './model-admin-core';
const model=(framing?:'crop'|'low'|'full'):ManagedModel=>({id:'custom-one',name:'Reference',poses:[{id:'p',label:'Pose',framing,publicPath:'/front.png',filename:'front.png',subdir:'',views:{}}]});
describe('reference library sections',()=>{
 it('separates curated pants, including Donuts, from full-body models wearing pants',()=>{
  expect(matchesLibrarySection({...model(),id:'studio 103'},'bottoms')).toBe(true);
  expect(matchesLibrarySection({...model(),id:'pants-dp62024'},'tops')).toBe(false);
  expect(matchesLibrarySection({...model(),wears:'pants',lowOk:true},'tops')).toBe(true);
  expect(matchesLibrarySection({...model(),wears:'pants',lowOk:true},'bottoms')).toBe(false);
 });
 it('files custom waist-down poses under bottoms and cropped/full poses under tops',()=>{
  expect(libraryLabel(model('low'))).toBe('Bottoms');
  expect(libraryLabel(model('crop'))).toBe('Tops');
  expect(libraryLabel(model('full'))).toBe('Tops');
  expect(matchesLibrarySection(model('low'),'all')).toBe(true);
 });
 it('shows mixed models in both sections and selects poses for that section',()=>{
  const m=model('crop');m.poses.push({...model('low').poses[0],id:'low'});
  expect(libraryLabel(m)).toBe('Tops & bottoms');
  expect(libraryPoses(m,'bottoms').map(p=>p.id)).toEqual(['low']);
  expect(libraryPoses(m,'tops').map(p=>p.id)).toEqual(['p']);
  expect(libraryPoses(m,'all')).toHaveLength(2);
  expect(libraryPoses(undefined,'all')).toEqual([]);
 });
 it('keeps deleted last poses discoverable for restore and new empty models discoverable',()=>{
  const m=model('low');m.poses[0].deleted=true;m.deleted=true;
  expect(libraryLabel(m)).toBe('Bottoms');
  expect(libraryPoses(m,'bottoms')).toHaveLength(1);
  expect(libraryLabel({...m,poses:[]})).toBe('Tops');
 });
 it('hides generated framing variants without hiding custom or parent entries',()=>{
  expect(isDerivedReference('crop 97')).toBe(true);expect(isDerivedReference('low 103')).toBe(true);
  expect(isDerivedReference('studio 97')).toBe(false);expect(isDerivedReference('custom-low')).toBe(false);
 });
});
