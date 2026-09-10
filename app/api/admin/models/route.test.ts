// @vitest-environment node
import {beforeEach,describe,expect,it,vi} from 'vitest';
import {GET,POST} from './route';
import {createSessionToken} from '@/lib/auth';
const state=vi.hoisted(()=>({changes:[] as any[],base:[{id:'celine',name:'Celine',poses:[{id:'p',label:'P',publicPath:'/front',filename:'front',subdir:'',views:{front:{publicPath:'/front',filename:'front'}}}]}]}));
vi.mock('@/lib/models-registry',()=>({listBaseHumanModels:async()=>state.base}));
vi.mock('@/lib/model-admin',async()=>({...await vi.importActual<any>('@/lib/model-admin-core'),VIEWS:['front','side','back','full'],readCatalogChanges:async()=>state.changes,appendCatalogChange:async(c:any)=>{const e={...c,id:String(state.changes.length),at:new Date().toISOString()};state.changes.push(e);return e;}}));
vi.mock('@/lib/model-admin-photo',()=>({inspectAdminPhoto:async(url:string)=>{if(url!=='https://safe/photo.png')throw Error('Invalid uploaded photo');return{filename:'photo.png',publicPath:url};}}));
beforeEach(()=>{state.changes=[];vi.stubEnv('AUTH_SECRET','test-secret');});
async function req(body?:any,auth=true,origin='https://studio.test'){
 return new Request('https://studio.test/api/admin/models',{method:body?'POST':'GET',headers:{...(auth?{cookie:`davidani_session=${await createSessionToken('test-secret')}`} : {}),origin,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
}
describe('reference admin API',()=>{
 it('requires a session and refuses cross-origin writes',async()=>{expect((await GET(await req(undefined,false))).status).toBe(401);expect((await POST(await req({action:'deleteModel',modelId:'celine'},true,'https://evil.test'))).status).toBe(401);expect(state.changes).toHaveLength(0);});
 it('lists the complete library for a signed-in admin',async()=>expect((await (await GET(await req())).json()).models[0].name).toBe('Celine'));
 it('creates a model, pose and each named view',async()=>{
  const m=await(await POST(await req({action:'createModel',name:'Vision',character:'vision'}))).json();
  const p=await(await POST(await req({action:'createPose',modelId:m.change.modelId,label:'Look',framing:'crop'}))).json();
  for(const view of ['front','side','back','full'])expect((await POST(await req({action:'setPhoto',modelId:m.change.modelId,poseId:p.change.poseId,view,url:'https://safe/photo.png',expectedUrl:''}))).status).toBe(200);
  expect(state.changes).toHaveLength(6);
 });
 it('rejects invalid fields, unknown models and stale replacement requests',async()=>{
  expect((await POST(await req({action:'createModel',name:''}))).status).toBe(400);
  expect((await POST(await req({action:'deleteModel',modelId:'missing'}))).status).toBe(404);
  expect((await POST(await req({action:'setPhoto',modelId:'celine',poseId:'p',view:'front',url:'https://safe/photo.png',expectedUrl:'/old'}))).status).toBe(409);
  expect((await POST(await req({action:'setPhoto',modelId:'celine',poseId:'p',view:'left'}))).status).toBe(400);
  expect(state.changes).toHaveLength(0);
 });
 it('does not modify the library if a photo cannot be validated',async()=>{
  expect((await POST(await req({action:'setPhoto',modelId:'celine',poseId:'p',view:'front',url:'https://bad/photo',expectedUrl:'/front'}))).status).toBe(400);expect(state.changes).toHaveLength(0);
 });
 it('removes a view and restores deleted models',async()=>{
  expect((await POST(await req({action:'removePhoto',modelId:'celine',poseId:'p',view:'front',expectedUrl:'/front'}))).status).toBe(200);
  expect((await POST(await req({action:'deleteModel',modelId:'celine'}))).status).toBe(200);
  expect((await POST(await req({action:'restoreModel',modelId:'celine'}))).status).toBe(200);
 });
});
