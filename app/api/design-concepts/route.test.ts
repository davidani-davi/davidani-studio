// @vitest-environment node
import {it,expect,vi,beforeEach} from 'vitest';
vi.mock('@/lib/design-concept-store',()=>({conceptStore:vi.fn(()=>({}))}));
vi.mock('@/lib/design-concept-provider',()=>({conceptProvider:vi.fn(()=>({}))}));
vi.mock('@/lib/design-concepts',async(importOriginal)=>({...await importOriginal<typeof import('@/lib/design-concepts')>(),submitConcept:vi.fn(async()=>({id:'test',status:'running'})),pollConcept:vi.fn(async()=>null)}));
import {POST,GET} from './route';
import {submitConcept,pollConcept} from '@/lib/design-concepts';
beforeEach(()=>{vi.clearAllMocks();process.env.MODEL_SHOTS_TOKEN='concept-test';});
it('authenticates before storage or provider access and validates poll IDs',async()=>{
 expect((await POST(new Request('https://studio/api/design-concepts',{method:'POST',body:'{}'}))).status).toBe(401);expect(submitConcept).not.toHaveBeenCalled();
 expect((await GET(new Request('https://studio/api/design-concepts?id=bad',{headers:{'x-ddto-token':'concept-test'}}))).status).toBe(400);expect(pollConcept).not.toHaveBeenCalled();
});
it('returns the durable task, missing tasks, and retryable failures',async()=>{
 const headers={'x-ddto-token':'concept-test'};
 expect((await POST(new Request('https://studio/api/design-concepts',{method:'POST',headers,body:'{}'}))).status).toBe(202);
 const url='https://studio/api/design-concepts?id=abcdef12-abcd-abcd-abcd-abcdef123456';
 expect((await GET(new Request(url,{headers}))).status).toBe(404);
 vi.mocked(pollConcept).mockRejectedValueOnce(Error('network'));
 expect((await GET(new Request(url,{headers}))).status).toBe(503);
});
