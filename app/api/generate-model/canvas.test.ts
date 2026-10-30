import { afterEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  generate: vi.fn().mockResolvedValue({ images: [{ url: 'https://output/full.png' }] }),
  posePath: vi.fn(),
}));
vi.mock('@/lib/fal', () => ({ generate: mocks.generate }));
vi.mock('@/lib/models-registry', () => ({ managedPosePath: mocks.posePath }));
import { POST } from './route';

const body = { modelId: 'gpt-image-25', humanModelId: 'pants DP67113', poseId: 'pants DP67113', view: 'full',
  prompt: 'swap the bottoms', garmentImageUrls: ['https://erp/front.jpg'], rawPrompt: true };
const call = (extra: object) => POST(new Request('https://studio.test/api/generate-model', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, ...extra }) }));
afterEach(() => vi.clearAllMocks());

// Shared bottoms sets have front, side and back only; the full shot paints on a picked body photo.
describe('generate-model canvas', () => {
  it('renders on the given canvas when the set has no photo for this view', async () => {
    mocks.posePath.mockRejectedValue(Error('Missing full reference for DP67113. Add this view in Manage references.'));
    const res = await call({ canvasImageUrl: 'https://blob/studio-own/DP62259/full.jpg' });
    expect(res.status).toBe(200);
    expect(mocks.generate.mock.calls[0][0].referenceImageUrl).toBe('https://blob/studio-own/DP62259/full.jpg');
  });
  it('still refuses a view with no photo when there is no canvas', async () => {
    mocks.posePath.mockRejectedValue(Error('Missing full reference for DP67113. Add this view in Manage references.'));
    const res = await call({});
    expect(res.status).toBe(500);
    expect((await res.json()).error).toMatch(/Missing full reference/);
    expect(mocks.generate).not.toHaveBeenCalled();
  });
  it('uses the library view photo when no canvas is given', async () => {
    mocks.posePath.mockResolvedValue('/models/pants/front.png');
    const res = await call({ view: 'front' });
    expect(res.status).toBe(200);
    expect(mocks.generate.mock.calls[0][0].referenceImageUrl).toBe('https://studio.test/models/pants/front.png');
  });
});
