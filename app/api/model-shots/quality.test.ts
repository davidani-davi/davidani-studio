import fs from 'node:fs';
import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest';
const mocks=vi.hoisted(()=>({upload:vi.fn(),generate:vi.fn(),ground:vi.fn()}));
vi.mock('@/lib/fal',async original=>({...await original<typeof import('@/lib/fal')>(),uploadToFal:mocks.upload,groundPhrase:mocks.ground}));
vi.mock('../generate-model/route',()=>({POST:mocks.generate}));
import {POST} from './route';
let original:Buffer,hosted=new Map<string,Buffer>();
function request(body:object){return new Request('https://studio.test/api/model-shots',{method:'POST',headers:{'Content-Type':'application/json','X-DDTO-TOKEN':'test'},body:JSON.stringify({humanModelId:'studio 100',poseId:'studio 100',view:'back',editMode:'simple',modelId:'gpt-image-25',known:{category:'top',color:'PINK'},garmentImageUrls:['https://erp/pink-front.png','https://erp/pink-back.png'],anchorImageUrl:'https://render/pink-front.png',...body})});}
beforeEach(()=>{
 vi.stubEnv('MODEL_SHOTS_TOKEN','test');vi.stubEnv('VERCEL','1');hosted=new Map();
 original=fs.readFileSync('public/models/crop 100/back.png');
 mocks.upload.mockImplementation(async(blob:Blob,name:string)=>{const url='https://host/'+name;hosted.set(url,Buffer.from(await blob.arrayBuffer()));return url;});
 mocks.generate.mockImplementation(async()=>Response.json({images:[{url:'https://generated/result.png'}]}));
 mocks.ground.mockResolvedValue([]);
 vi.stubGlobal('fetch',vi.fn(async(input:string|URL|Request)=>new Response(new Uint8Array(hosted.get(String(input))||original))));
});
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();vi.clearAllMocks();});

// High quality for Simple renders (2026-11-03, DET60450): same frame, GPT high instead of medium.
describe('model-shots route: Simple quality',()=>{
 it('renders at medium by default and says so',async()=>{
  const data=await (await POST(request({}))).json();
  expect(data.ok).toBe(true);
  const payload=await mocks.generate.mock.calls[0][0].json();
  expect(payload.resolution).toBe('2K');
  expect(data.quality).toBe('medium');
 });
 it('renders High at the same size and says so',async()=>{
  const high=await (await POST(request({quality:'high'}))).json();
  const standard=await (await POST(request({}))).json();
  const [h,m]=await Promise.all(mocks.generate.mock.calls.map(c=>c[0].json()));
  expect(h.resolution).toBe('4K');
  expect(m.resolution).toBe('2K');
  expect(h.imageSize).toEqual(m.imageSize);
  expect(high.quality).toBe('high');
  expect(high.resolution).toBe(standard.resolution);
 });
 it('refuses an unknown quality before anything is queued',async()=>{
  const r=await POST(request({quality:'ultra',async:true}));
  expect(r.status).toBe(400);
  expect((await r.json()).error).toBe('Choose Standard or High quality.');
  expect(mocks.generate).not.toHaveBeenCalled();
 });
 it('refuses High on Nano',async()=>{
  const r=await POST(request({quality:'high',modelId:undefined,engine:'nano'}));
  expect(r.status).toBe(400);
  expect(mocks.generate).not.toHaveBeenCalled();
 });
});
