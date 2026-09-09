import { describe, expect, it } from 'vitest';
import { applyModelPhotoFinish } from './model-photo-finish';
import { optimizePromptForModel } from './prompt-strategy';

describe('house-model photographic finish', () => {
  it.each(['studio 100', 'crop 100', 'low 100', 'studio 97', 'crop 98', 'studio 99'])(
    'restrains artificial detail for %s without deleting real textile facts', id => {
      const out = applyModelPhotoFinish('Brushed slub knit, ribbed cuffs. Render high-detail textures. Keep center seam.', id);
      expect(out).not.toContain('high-detail textures');
      expect(out).toContain('Brushed slub knit, ribbed cuffs.');
      expect(out).toContain('Keep center seam.');
      expect(out).toContain('without increasing their contrast, density or coarseness');
      expect(out).toContain('including its underside');
    });
  it('survives GPT negative-tail removal', () => {
    const out = optimizePromptForModel('gpt-image', applyModelPhotoFinish('Edit the top. Negative prompt: no extra hands', 'crop 100'));
    expect(out).toContain('Photographic finish:');
    expect(out).not.toContain('Negative prompt:');
  });
  it('leaves unrelated models untouched', () => {
    expect(applyModelPhotoFinish('Keep high-detail textures', 'studio 10')).toBe('Keep high-detail textures');
  });
});
