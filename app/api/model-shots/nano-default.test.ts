import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('@/lib/nano-reference-shots',async importOriginal=>{
  const original=await importOriginal<typeof import('@/lib/nano-reference-shots')>();
  return {...original,runReferenceShot:vi.fn().mockResolvedValue({url:'https://output/native.png'})};
});
vi.mock('../analyze-model/route',()=>({POST:vi.fn(()=>{throw Error('Unexpected analyzer');})}));
vi.mock('../generate-model/route',()=>({POST:vi.fn(()=>{throw Error('Unexpected legacy renderer');})}));
vi.mock('@/lib/face-anchor',()=>({faceAnchorFor:vi.fn(()=>{throw Error('Unexpected face crop');}),HEAD_SHARE:{crop:0.3,full:0.2}}));
import { POST } from './route';
import { runReferenceShot } from '@/lib/nano-reference-shots';
const base={garmentImageUrls:['https://erp/front.jpg','https://erp/back.jpg'],humanModelId:'studio 98',poseId:'front',known:{styleCode:'DET67046',category:'top',color:'PINK PEACH'}};
afterEach(()=>{vi.unstubAllEnvs();vi.clearAllMocks();});
function request(body:object){vi.stubEnv('MODEL_SHOTS_TOKEN','test');vi.stubEnv('VERCEL','1');return new Request('https://studio.test/api/model-shots',{method:'POST',headers:{'Content-Type':'application/json','X-DDTO-TOKEN':'test'},body:JSON.stringify({...base,...body})});}
describe('Model Studio Nano Pro default routing',()=>{
  it('uses native reference path without requiring an explicit modelId',async()=>{
    const response=await POST(request({view:'front'}));const data=await response.json();
    expect(response.status).toBe(200);expect(data).toMatchObject({url:'https://output/native.png',modelId:'nano-banana-pro',resolution:'1K',engine:'nano'});
    expect(vi.mocked(runReferenceShot).mock.calls[0][0].image_urls[0]).toContain('/front.png');
  });
  it('uses the original front reference and generated front for back',async()=>{
    const response=await POST(request({view:'back',modelId:'nano-banana-pro',anchorImageUrl:'https://output/front.png'}));
    expect(response.status).toBe(200);
    const input=vi.mocked(runReferenceShot).mock.calls[0][0];
    expect(input.image_urls[0]).toBe('https://output/front.png');expect(input.image_urls[1]).toContain('/front.png');expect(input.image_urls[2]).toBe('https://erp/back.jpg');
  });
  it('renders full-body at native 2K even from an older 1K client',async()=>{
    const response=await POST(request({view:'full',resolution:'1K',anchorImageUrl:'https://output/front.png'}));
    expect(response.status).toBe(200);expect((await response.json()).resolution).toBe('2K');
    expect(vi.mocked(runReferenceShot).mock.calls[0][0].resolution).toBe('2K');
  });
  it('refuses an unanchored continuation before spending on a render',async()=>{
    expect((await POST(request({view:'side'}))).status).toBe(400);expect(runReferenceShot).not.toHaveBeenCalled();
  });
});
