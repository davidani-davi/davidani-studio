import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('@/lib/nano-reference-shots',async importOriginal=>({...await importOriginal<typeof import('@/lib/nano-reference-shots')>(),runReferenceShot:vi.fn().mockResolvedValue({url:'https://output/native.png'})}));
vi.mock('../generate-model/route',()=>({POST:vi.fn().mockImplementation(async()=>Response.json({images:[{url:'https://output/native.png'}]}))}));
import { POST } from './route';
import { POST as generate } from '../generate-model/route';
import { runReferenceShot } from '@/lib/nano-reference-shots';
const base={garmentImageUrls:['https://erp/front.jpg','https://erp/back.jpg'],humanModelId:'studio 103',poseId:'studio 103',known:{styleCode:'DP62206',category:'pants',color:'LIGHT DENIM'}};
afterEach(()=>{vi.unstubAllEnvs();vi.clearAllMocks();});
function request(body:object){vi.stubEnv('MODEL_SHOTS_TOKEN','test');vi.stubEnv('VERCEL','1');return new Request('https://studio.test/api/model-shots',{method:'POST',headers:{'Content-Type':'application/json','X-DDTO-TOKEN':'test'},body:JSON.stringify({...base,...body})});}
describe('independent native reference shots',()=>{
  it('defaults to GPT2.5 and ignores stale restore=true',async()=>{
    const response=await POST(request({view:'front',restore:true}));
    expect(response.status).toBe(200);expect(await response.json()).toMatchObject({url:'https://output/native.png',modelId:'gpt-image-25',engine:'gpt25',restore:{applied:false}});
    expect(runReferenceShot).not.toHaveBeenCalled();
  });
  for(const modelId of ['gpt-image-25','gpt-image','nano-banana-pro']) {
    it.each(['front','side','back'])(`${modelId} %s uses matching original view and never generated anchor`,async view=>{
      const response=await POST(request({view,modelId,anchorImageUrl:'https://output/old-front.png',restore:true}));
      expect(response.status).toBe(200);const data=await response.json();
      expect(data).toMatchObject({url:'https://output/native.png',modelId,anchored:false,restore:{applied:false},reference:{view}});
      expect(data.reference.url).toMatch(new RegExp('/'+view+'\\.'));
      expect(data.prompt).toContain('keep the existing top');
      if(modelId==='nano-banana-pro') {
        const input=vi.mocked(runReferenceShot).mock.calls[0][0];
        expect(input.image_urls).toEqual([data.reference.url,...base.garmentImageUrls]);expect(input.resolution).toBe('1K');
      }else {
        const payload=await vi.mocked(generate).mock.calls[0][0].json();
        expect(payload.canvasImageUrl).toBe(data.reference.url);expect(payload.garmentImageUrls).toEqual(base.garmentImageUrls);
        expect(payload.rawPrompt).toBe(true);expect(payload.preserveSecondaryReferences).toBe(true);
      }
    });
  }
  it.each(['gpt-image-25','gpt-image','nano-banana-pro'])('rejects a pants full shot with %s before spending',async modelId=>{
    expect((await POST(request({view:'full',modelId}))).status).toBe(400);
    expect(generate).not.toHaveBeenCalled();expect(runReferenceShot).not.toHaveBeenCalled();
  });
  it.each([['gpt2','gpt-image'],['nano','nano-banana-pro']])('respects engine-only %s selections',async(engine,modelId)=>{
    const data=await (await POST(request({view:'front',engine}))).json();expect(data.modelId).toBe(modelId);
  });
  it('rejects contradictory selections instead of choosing a different engine',async()=>{
    const response=await POST(request({view:'front',engine:'gpt25',modelId:'nano-banana-pro'}));
    expect(response.status).toBe(400);expect(generate).not.toHaveBeenCalled();expect(runReferenceShot).not.toHaveBeenCalled();
  });
  it('flags inferred back details separately from a pose reference',async()=>{
    const data=await (await POST(request({view:'back',garmentImageUrls:[base.garmentImageUrls[0]]}))).json();
    expect(data.garmentBackInferred).toBe(true);expect(data.reference.view).toBe('back');
  });
});
