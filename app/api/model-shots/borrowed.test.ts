import fs from 'node:fs';
import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest';
const mocks=vi.hoisted(()=>({upload:vi.fn(),generate:vi.fn(),ground:vi.fn()}));
vi.mock('@/lib/fal',async original=>({...await original<typeof import('@/lib/fal')>(),uploadToFal:mocks.upload,groundPhrase:mocks.ground}));
vi.mock('../generate-model/route',()=>({POST:mocks.generate}));
import {POST} from './route';
let original:Buffer,hosted=new Map<string,Buffer>();
const DB='DEEP BLUE';
function request(body:object){return new Request('https://studio.test/api/model-shots',{method:'POST',headers:{'Content-Type':'application/json','X-DDTO-TOKEN':'test'},body:JSON.stringify({humanModelId:'studio 100',poseId:'studio 100',view:'back',editMode:'simple',modelId:'gpt-image-25',known:{category:'top',color:'PINK'},garmentImageUrls:['https://erp/pink-front.png','https://erp/deep-blue-back.png'],anchorImageUrl:'https://render/pink-front.png',garmentBorrowed:{back:DB},...body})});}
beforeEach(()=>{
 vi.stubEnv('MODEL_SHOTS_TOKEN','test');vi.stubEnv('VERCEL','1');hosted=new Map();
 original=fs.readFileSync('public/models/crop 100/back.png');
 mocks.upload.mockImplementation(async(blob:Blob,name:string)=>{const url='https://host/'+name;hosted.set(url,Buffer.from(await blob.arrayBuffer()));return url;});
 mocks.generate.mockImplementation(async()=>Response.json({images:[{url:'https://generated/result.png'}]}));
 mocks.ground.mockResolvedValue([]);
 vi.stubGlobal('fetch',vi.fn(async(input:string|URL|Request)=>new Response(new Uint8Array(hosted.get(String(input))||original))));
});
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();vi.clearAllMocks();});

// Borrowed colourway photos (2026-11-03): the route refuses before anything is queued or paid for.
describe('model-shots route: borrowed colourway photos',()=>{
 it('refuses a borrow on another engine, even as an async task, without calling fal',async()=>{
  const r=await POST(request({modelId:'gpt-image',async:true}));
  expect(r.status).toBe(400);
  expect((await r.json()).error).toBe('Borrowed photos need GPT Image 2.5 in Simple mode.');
  expect(mocks.generate).not.toHaveBeenCalled();
 });
 it('refuses a borrowed back with no front render',async()=>{
  const r=await POST(request({anchorImageUrl:''}));
  expect(r.status).toBe(400);
  expect((await r.json()).error).toBe('Make the front first: a borrowed back photo takes its colours from the front render.');
  expect(mocks.generate).not.toHaveBeenCalled();
 });
 it('sends the borrowed back as shape only and says it used it',async()=>{
  const r=await POST(request({}));
  const data=await r.json();
  expect(data.ok).toBe(true);
  const payload=await mocks.generate.mock.calls[0][0].json();
  expect(payload.prompt).toContain('Image 2 shows this same garment in another colourway (DEEP BLUE).');
  expect(data.garmentBorrowedUsed).toEqual({back:true});
 });
 it('says nothing about borrowing when nothing is borrowed',async()=>{
  const data=await (await POST(request({garmentBorrowed:undefined}))).json();
  expect(data.ok).toBe(true);
  expect(data.garmentBorrowedUsed).toBeUndefined();
 });
});
