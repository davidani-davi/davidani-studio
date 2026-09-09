// @vitest-environment node
import {it,expect} from 'vitest';
import {conceptCallbackSignature,conceptCallbackUrl,validConceptCallback} from './design-concept-webhook';
it('binds callback capability to exactly one concept and rejects malformed inputs',()=>{
 process.env.AUTH_SECRET='test-concept-auth';const id='abcdef12-abcd-abcd-abcd-abcdef123456',sig=conceptCallbackSignature(id);
 expect(validConceptCallback(id,sig)).toBe(true);expect(validConceptCallback('bbbbbbbb-abcd-abcd-abcd-abcdef123456',sig)).toBe(false);expect(validConceptCallback(id,'bad')).toBe(false);expect(validConceptCallback(null,sig)).toBe(false);
 expect(conceptCallbackUrl(id)).toContain('/api/design-concept-complete?id='+id);
});
