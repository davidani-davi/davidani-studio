// @vitest-environment node
import {describe,it,expect} from 'vitest';
import {applyCatalogChanges,type CatalogChange} from './model-admin-core';
import {viewReference} from './view-reference';
import {simpleFaceMask} from './simple-reference-shot';
import type {HumanModel} from './models-registry';
const base:HumanModel[]=[{id:'studio 1',name:'Celine',poses:[{id:'p',label:'Pose',publicPath:'/front.jpg',filename:'front.jpg',subdir:'',views:{front:{filename:'front.jpg',publicPath:'/front.jpg'},side:{filename:'side.jpg',publicPath:'/side.jpg'}},viewVariants:{front:[{filename:'old.jpg',publicPath:'/old.jpg'}]}}]},{id:'crop 1',name:'Crop',poses:[{id:'crop',label:'Crop',publicPath:'/crop.jpg',filename:'crop.jpg',subdir:'',views:{front:{filename:'crop.jpg',publicPath:'/crop.jpg'}}}]}];
let n=0;const event=(partial:Partial<CatalogChange>):CatalogChange=>({id:String(++n),at:String(n).padStart(4,'0'),modelId:'studio 1',kind:'photo',poseId:'p',...partial});
describe('admin reference catalog',()=>{
 it('replaces only the chosen view and retires stale alternates',()=>{
  const m=applyCatalogChanges(base,[event({view:'front',photo:{filename:'new.png',publicPath:'https://store/new.png'}})]);
  expect(m[0].poses[0].views.side).toEqual(base[0].poses[0].views.side);
  expect(m[0].poses[0].publicPath).toBe('https://store/new.png');expect(m[0].poses[0].viewVariants?.front).toBeUndefined();
  expect(base[0].poses[0].publicPath).toBe('/front.jpg');
 });
 it('merges independent concurrent photo changes without dropping either',()=>{
  const a=event({view:'front',photo:{filename:'a',publicPath:'/a'}}),b=event({view:'side',photo:{filename:'b',publicPath:'/b'}});
  expect(applyCatalogChanges(base,[b,a])[0].poses[0].views).toMatchObject({front:{publicPath:'/a'},side:{publicPath:'/b'}});
 });
 it('removes views without substituting another angle',()=>{
  const m=applyCatalogChanges(base,[event({view:'side',photo:null})]);
  expect(()=>viewReference(m,'studio 1','p','side','full')).toThrow('Missing side');
 });
 it('deletes and restores models with derived references',()=>{
  const del=event({kind:'model',patch:{deleted:true}});
  expect(applyCatalogChanges(base,[del])).toEqual([]);
  expect(applyCatalogChanges(base,[del],true)).toHaveLength(2);
  expect(applyCatalogChanges(base,[del,event({kind:'model',patch:{deleted:false}})])).toHaveLength(2);
 });
 it('supports new models and multiple independently routed pose sets',()=>{
  const changes=[event({kind:'model',modelId:'new',create:true,patch:{name:'Vision'}}),event({kind:'pose',modelId:'new',poseId:'one',create:true,patch:{label:'Arms relaxed',framing:'crop'}}),event({kind:'pose',modelId:'new',poseId:'two',create:true,patch:{label:'Hands in pockets',framing:'crop'}}),event({modelId:'new',poseId:'two',view:'side',photo:{filename:'side',publicPath:'/new-side'}})];
  expect(applyCatalogChanges([],changes,true)[0].poses).toHaveLength(2);
  const m=applyCatalogChanges([],changes);
  expect(viewReference(m,'new','two','side','crop')).toMatchObject({publicPath:'/new-side',reframed:false});
  expect(()=>viewReference(m,'new','two','front','crop')).toThrow('Missing front');
 });
 it('never routes a new pose to the old first pose crop',()=>{
  const changes=[event({kind:'pose',poseId:'new',create:true,patch:{label:'New',framing:'crop'}}),event({poseId:'new',view:'front',photo:{filename:'new',publicPath:'/new'}})];
  expect(viewReference(applyCatalogChanges(base,changes),'studio 1','new','front','crop').publicPath).toBe('/new');
 });
 it('makes deleted poses unavailable and restores their photos',()=>{
  const del=event({kind:'pose',patch:{deleted:true}});
  expect(applyCatalogChanges(base,[del]).find(m=>m.id==='studio 1')).toBeUndefined();
  expect(applyCatalogChanges(base,[del,event({kind:'pose',patch:{deleted:false}})])[0].poses[0].views.front?.publicPath).toBe('/front.jpg');
 });
 it('uses photo-specific reviewed protection and rejects changed pixels',()=>{
  const protection={width:2,height:4,sha256:'same',protectedRows:2,transitionRows:1};
  const ref={width:2,height:4,sha256:'same',data:Buffer.alloc(32)};
  expect([...simpleFaceMask(ref,'https://store/new.png','front','crop',protection)!]).toEqual([0,0,0,0,255,255,255,255]);
  expect(simpleFaceMask(ref,'https://store/back.png','back','crop',protection)).toEqual(simpleFaceMask(ref,'https://store/new.png','front','crop',protection));
  expect(()=>simpleFaceMask({...ref,sha256:'changed'},'/new','front','crop',protection)).toThrow('changed');
 });
});
