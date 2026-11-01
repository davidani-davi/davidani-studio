import { describe, expect, it, vi } from 'vitest';
import { outlineDraftSet } from './draft-outlines';
import type { UserModel } from './user-assets';
import type { ViewRead } from './view-arrange';

const contour = (url: string, view: string, source: 'auto-draft-v1' | 'recast-mask-v1' = 'auto-draft-v1') =>
  ({ kind: 'contour' as const, width: 1, height: 1, sha256: url + '@' + view, source, detectedAt: '' });

describe('recast outlines on the Listing Team set step', () => {
  it('leaves a set with poses alone: no reads, no detection, no save', async () => {
    const model: UserModel = {
      id: 'vision-dd70049', name: 'Vision · DD70049', createdAt: '', views: { front: 'u/f.png', side: 'u/s.png' },
      contours: { front: contour('u/f.png', 'front', 'recast-mask-v1') },
      poses: [{ id: 'front-03', view: 'front', framing: 'crop', stance: 'standing', arms: 'at-sides', url: 'u/f.png', checks: { pass: true } }],
    };
    const deps = { read: vi.fn(), detect: vi.fn(), save: vi.fn() };
    const out = await outlineDraftSet(model, deps, { arrange: true });
    expect(deps.read).not.toHaveBeenCalled();
    expect(deps.detect).not.toHaveBeenCalled();
    expect(deps.save).not.toHaveBeenCalled();
    expect(out).toMatchObject({ model, arranged: null, rechecked: [], outlines: { front: 'contour', side: 'missing' } });
  });

  it('moves a recast outline with its photo and finds new ones only for the other moved views', async () => {
    const model: UserModel = {
      id: 'draft-x', name: 'Draft · x', createdAt: '', views: { front: 'u/back.jpg', back: 'u/front.jpg' },
      contours: { front: contour('u/back.jpg', 'front', 'recast-mask-v1'), back: contour('u/front.jpg', 'back') },
    };
    const reads: Record<string, ViewRead> = { 'u/back.jpg': { facing: 'back', feet: false }, 'u/front.jpg': { facing: 'front', feet: false } };
    const detected: string[] = [];
    const out = await outlineDraftSet(model, {
      read: async (u) => reads[u],
      detect: async (u, v) => { detected.push(v); return contour(u, v); },
      save: async (m, contours, views) => ({ ...m, contours, views }),
    }, { arrange: true });
    expect(out.arranged).toEqual({ front: 'back', back: 'front' });
    expect(out.model.views).toEqual({ front: 'u/front.jpg', back: 'u/back.jpg' });
    expect(out.model.contours!.back).toBe(model.contours!.front);
    expect(detected).toEqual(['front']);
    expect(out.model.contours!.front!.sha256).toBe('u/front.jpg@front');
  });
});
