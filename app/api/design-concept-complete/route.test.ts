// @vitest-environment node
import {it,expect,vi} from 'vitest';
vi.mock('@/lib/design-concept-store',()=>({conceptStore:vi.fn(()=>({}))}));
vi.mock('@/lib/design-concept-provider',()=>({conceptProvider:vi.fn(()=>({}))}));
vi.mock('@/lib/design-concepts',async(importOriginal)=>({...await importOriginal<typeof import('@/lib/design-concepts')>(),pollConcept:vi.fn(async()=>({status:'done'}))}));
import {POST} from './route';import {conceptCallbackUrl} from '@/lib/design-concept-webhook';import {pollConcept} from '@/lib/design-concepts';
it('ignores untrusted callback payloads and only polls the server-owned request',async()=>{
 process.env.AUTH_SECRET='callback-test';const id='abcdef12-abcd-abcd-abcd-abcdef123456';
 expect((await POST(new Request('https://studio/api/design-concept-complete?id='+id,{method:'POST'}))).status).toBe(401);expect(pollConcept).not.toHaveBeenCalled();
 expect((await POST(new Request(conceptCallbackUrl(id),{method:'POST',body:'{"image":"https://attacker.test"}'}))).status).toBe(200);expect(pollConcept).toHaveBeenCalledWith({}, {},id,'callback');
 vi.mocked(pollConcept).mockResolvedValueOnce({status:'running'} as any);expect((await POST(new Request(conceptCallbackUrl(id),{method:'POST'}))).status).toBe(503);
 vi.mocked(pollConcept).mockRejectedValueOnce(Error('network'));expect((await POST(new Request(conceptCallbackUrl(id),{method:'POST'}))).status).toBe(503);
});
