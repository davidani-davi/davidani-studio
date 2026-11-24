// @vitest-environment node
import { it, expect } from 'vitest';
import { uploadPolicy } from '@/lib/wording-studio/upload';

it('upload token refuses application/pdf and allows a 20 MB image/heic', () => {
  const p = uploadPolicy('wording-studio-uploads/1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed.heic');
  expect(p.allowedContentTypes).toContain('image/heic');
  expect(p.allowedContentTypes).not.toContain('application/pdf');
  expect(p.maximumSizeInBytes).toBeGreaterThanOrEqual(20_000_000);
});
it('refuses a pathname outside the uploads prefix', () => {
  expect(() => uploadPolicy('model-admin/x.jpg')).toThrow();
  expect(() => uploadPolicy('wording-studio-uploads/../x.jpg')).toThrow();
});
