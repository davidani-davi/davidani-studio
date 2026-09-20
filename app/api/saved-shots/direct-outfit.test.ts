import { expect, it, vi } from 'vitest';
const save=vi.hoisted(()=>vi.fn());
vi.mock('@/lib/saved-shots',async()=>({...await vi.importActual<any>('@/lib/saved-shots'),saveShots:save}));
import { POST } from './route';
it('retains direct provenance so reloaded shots keep native PNG delivery',async()=>{
 vi.stubEnv('MODEL_SHOTS_TOKEN','test');
 save.mockResolvedValue({entry:{shots:[]},added:[],failed:[]});
 try {
  const r=await POST(new Request('https://studio.test/api/saved-shots',{method:'POST',headers:{'Content-Type':'application/json','X-DDTO-TOKEN':'test'},body:JSON.stringify({style:'DWT68142',shots:[{view:'front',url:'https://fal.test/direct.png',editMode:'direct',humanModelId:'face:vision'}]})}));
  expect(r.status).toBe(200);
  expect(save).toHaveBeenCalledWith('DWT68142',[expect.objectContaining({editMode:'direct',humanModelId:'face:vision'})]);
 }finally{vi.unstubAllEnvs();}
});
