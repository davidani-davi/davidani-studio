import fs from 'node:fs';
import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest';
import sharp from 'sharp';
import {referencePixels,type GarmentEdit} from '@/lib/garment-only';
const mocks=vi.hoisted(()=>({upload:vi.fn(),generate:vi.fn()}));
vi.mock('@/lib/fal',async original=>({...await original<typeof import('@/lib/fal')>(),uploadToFal:mocks.upload}));
vi.mock('../generate-model/route',()=>({POST:mocks.generate}));
import {GET,POST} from './route';
let original:Buffer,generated:Buffer,edit:GarmentEdit,hosted=new Map<string,Buffer>();
function request(body:object){return new Request('https://studio.test/api/model-shots',{method:'POST',headers:{'Content-Type':'application/json','X-DDTO-TOKEN':'test'},body:JSON.stringify({garmentImageUrls:['https://erp/peacock.png'],humanModelId:'studio 103',poseId:'studio 103',view:'full',known:{category:'pants'},modelId:'gpt-image-25',editMode:'garment-only',garmentEdit:edit,...body})});}
beforeEach(async()=>{
 vi.stubEnv('MODEL_SHOTS_TOKEN','test');vi.stubEnv('VERCEL','1');hosted=new Map();
 original=await sharp({create:{width:1024,height:1536,channels:4,background:'#123456'}}).png().toBuffer();
 generated=await sharp({create:{width:1024,height:1536,channels:4,background:'#fedcba'}}).png().toBuffer();
 const ref=await referencePixels(original);
 edit={version:1,referencePath:'/models/studio 103/full.png',referenceSha256:ref.sha256,width:1024,height:1536,regions:[[[.2,.3],[.8,.3],[.8,.9],[.2,.9]]],protectedRegions:[[[.25,0],[.75,0],[.75,.25],[.25,.25]]],reviewed:true,protectedHeadReviewed:true};
 mocks.upload.mockImplementation(async(blob:Blob,name:string)=>{const url='https://host/'+name;hosted.set(url,Buffer.from(await blob.arrayBuffer()));return url;});
 mocks.generate.mockImplementation(async()=>Response.json({images:[{url:'https://generated/result.png'}]}));
 vi.stubGlobal('fetch',vi.fn(async(input:string|URL|Request)=>{const u=String(input);return new Response(new Uint8Array(hosted.get(u)|| (u.startsWith('https://generated/')?generated:original)));}));
});
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();vi.clearAllMocks();});
describe('protected model-shot route',()=>{
 it('uses one masked request and only returns hosted verified original-size PNG',async()=>{
  const response=await POST(request({}));expect(response.status).toBe(200);const data=await response.json();
  expect(mocks.generate).toHaveBeenCalledTimes(1);const input=await mocks.generate.mock.calls[0][0].json();
  expect(input.maskUrl).toBe('https://host/garment-edit-mask.png');expect(input.canvasImageUrl).toBe('https://host/protected-reference.png');expect(input.imageSize).toEqual({width:1024,height:1536});
  expect(input.modelId).toBe('gpt-image-25');expect(input.garmentImageUrls).toEqual(['https://erp/peacock.png']);
  expect(data.url).toBe('https://host/garment-only.png');expect(data.preservation).toMatchObject({verified:true,changedProtectedPixels:0,width:1024,height:1536});
  expect(data.preservation.protectedSourceSha256).toBe(data.preservation.protectedOutputSha256);
 });
 it('face lock needs no drawn mask and preserves the reviewed original head',async()=>{
  original=fs.readFileSync('public/models/studio 103/full.png');
  const response=await POST(request({editMode:'face-locked',garmentEdit:undefined}));
  const data=await response.json();expect(data.ok).toBe(true);expect(data.editMode).toBe('face-locked');
  expect(data.preservation.changedProtectedPixels).toBe(0);expect(data.preservation.protectedPixels).toBe(533504);
 });
 it('face lock refuses unreviewed references and categories before generation',async()=>{
  for(const body of [{editMode:'face-locked'},{editMode:'face-locked',view:'front'},{editMode:'face-locked',known:{category:'top'}}]){
   expect((await(await POST(request(body))).json()).ok).toBe(false);
  }
  expect(mocks.generate).not.toHaveBeenCalled();
 });
 it.each([{garmentEdit:null},{garmentEdit:{reviewed:false}},{editMode:'unknown'},{engine:'nano',modelId:'nano-banana-pro'},{engine:'tryon',modelId:undefined},{humanModelId:'auto'},{view:'side'}])('fails before spending for invalid input %j',async body=>{
  const r=await POST(request(body));expect((await r.json()).ok).toBe(false);expect(mocks.generate).not.toHaveBeenCalled();
 });
 it('rejects replaced reference pixels before generation',async()=>{
  const r=await POST(request({garmentEdit:{...edit,referenceSha256:'a'.repeat(64)}}));expect((await r.json()).error).toContain('reference changed');expect(mocks.generate).not.toHaveBeenCalled();
 });
 it('withholds output if the hosted PNG was altered',async()=>{
  vi.mocked(fetch).mockImplementation(async input=>new Response(new Uint8Array(String(input)==='https://host/garment-only.png'?original:String(input).startsWith('https://generated/')?generated:original)));
  const r=await POST(request({}));expect((await r.json()).error).toContain('Hosted protected image verification failed');
 });
 it('inspects only installed references and needs authentication',async()=>{
  const get=(path:string,token='test')=>GET(new Request('https://studio.test/api/model-shots?referencePath='+encodeURIComponent(path),{headers:{'X-DDTO-TOKEN':token}}));
  expect((await get('/models/studio 103/full.png','wrong')).status).toBe(401);
  expect((await get('https://evil.test/private')).status).toBe(400);
  expect(await(await get('/models/studio 103/full.png')).json()).toMatchObject({ok:true,width:1024,height:1536,sha256:edit.referenceSha256});
 });
});
