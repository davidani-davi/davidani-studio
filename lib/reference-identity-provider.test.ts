import {beforeEach,describe,expect,it,vi} from 'vitest';
vi.mock('@fal-ai/client',()=>({fal:{config:vi.fn(),subscribe:vi.fn(),storage:{upload:vi.fn()}}}));
import {fal} from '@fal-ai/client';
import {generate} from './fal';
import {identityGenerationParams,IDENTITY_PROMPT} from './reference-identity-core';
beforeEach(()=>{vi.clearAllMocks();vi.stubEnv('FAL_KEY','test');vi.stubEnv('OPENAI_API_KEY','test-openai');vi.stubGlobal('fetch',vi.fn());});
describe('identity prompt reaches GPT 2.5 unchanged',()=>{
 it('submits exactly the original two URLs and prompt, without face neutralization or post-processing',async()=>{
  vi.mocked(fal.subscribe).mockResolvedValue({data:{images:[{url:'https://provider/out.png'}]},requestId:'r'} as any);
  const out=await generate(identityGenerationParams('https://photos/source.jpg','https://photos/master.png'));
  expect(fal.subscribe).toHaveBeenCalledTimes(1);
  expect(fal.subscribe).toHaveBeenCalledWith('openai/gpt-image-2.5/sunburst/edit',expect.objectContaining({input:{prompt:IDENTITY_PROMPT,image_urls:['https://photos/source.jpg','https://photos/master.png'],quality:'high',output_format:'png',num_images:1,openai_api_key:'test-openai'}}));
  expect(fal.storage.upload).not.toHaveBeenCalled();expect(fetch).not.toHaveBeenCalled();expect(out.images[0].url).toBe('https://provider/out.png');
 });
 it('surfaces a rejected request rather than rewriting the prompt or switching model',async()=>{
  vi.mocked(fal.subscribe).mockRejectedValue(Object.assign(Error('rejected'),{status:422}));
  await expect(generate(identityGenerationParams('https://photos/source.jpg','https://photos/master.png'))).rejects.toThrow();expect(fal.subscribe).toHaveBeenCalledTimes(1);
 });
});
