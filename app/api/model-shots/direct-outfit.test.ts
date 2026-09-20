import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mocks=vi.hoisted(()=>({render:vi.fn(),legacy:vi.fn()}));
vi.mock('@/lib/direct-outfit',async()=>({...await vi.importActual<any>('@/lib/direct-outfit'),renderDirectOutfit:mocks.render}));
vi.mock('../generate-model/route',()=>({POST:mocks.legacy}));
import { POST } from './route';
beforeEach(()=>{vi.stubEnv('MODEL_SHOTS_TOKEN','test');mocks.render.mockReset();mocks.legacy.mockReset();});
afterEach(()=>vi.unstubAllEnvs());
function request(body:object){return new Request('https://studio.test/api/model-shots',{method:'POST',headers:{'Content-Type':'application/json','X-DDTO-TOKEN':'test'},body:JSON.stringify(body)});}
it('routes the exact ERP view directly without invoking the legacy model/compositing route',async()=>{
 mocks.render.mockResolvedValue({ok:true,url:'https://output.test/native.png',editMode:'direct'});
 const res=await POST(request({editMode:'direct',view:'side',identityId:'vision',engine:'gpt25',outfitSources:{side:'https://erp.test/side.jpg'},note:'Keep the sleeve.'}));
 expect(res.status).toBe(200);
 expect(mocks.render).toHaveBeenCalledWith(expect.objectContaining({view:'side',identityId:'vision',sources:{side:'https://erp.test/side.jpg'},modelId:'gpt-image-25'}),'Keep the sleeve.');
 expect(mocks.legacy).not.toHaveBeenCalled();
});
it('rejects a missing matching view before spending a render',async()=>{
 const res=await POST(request({editMode:'direct',view:'back',identityId:'celine',outfitSources:{front:'https://erp.test/front.jpg'}}));
 expect(res.status).toBe(400);expect(mocks.render).not.toHaveBeenCalled();expect(mocks.legacy).not.toHaveBeenCalled();
});
