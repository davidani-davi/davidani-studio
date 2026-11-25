import { describe, it, expect } from 'vitest';
import { simpleReferenceShot, parsePromptRules, imageRoles } from './simple-reference-shot';

const base = { referenceUrl: 'https://ref/front.png', garmentImageUrls: ['https://erp/front.png', 'https://erp/back.png'], category: 'top' as const, framing: 'crop' as const, color: 'NAVY', garmentName: 'Cotton Shirt' };

describe('image roles (roles-v1, the default)', () => {
  it('is on by default since the 2026-11-24 A/B, and off sends the older prompt', () => {
    const def = simpleReferenceShot({ ...base, view: 'front' });
    expect(def.prompt).toContain('IMAGE ROLES');
    expect(def.promptRules).toBe('roles-v1');
    const off = simpleReferenceShot({ ...base, view: 'front', promptRules: 'off' });
    expect(off.prompt).not.toContain('IMAGE ROLES');
    expect(off.promptRules).toBeUndefined();
    expect(off.prompt.startsWith('Edit image 1 as the exact base photograph. Replace only the top')).toBe(true);
    expect(simpleReferenceShot({ ...base, view: 'front', promptRules: 'roles-v1' }).prompt).toBe(def.prompt);
  });
  it('front names image 1 and image 2 and a priority order without image 3', () => {
    const on = simpleReferenceShot({ ...base, view: 'front', promptRules: 'roles-v1' });
    expect(on.promptRules).toBe('roles-v1');
    expect(on.prompt).toContain('IMAGE ROLES: image 1 = the base photograph');
    expect(on.prompt).toContain('image 2 = the NAVY product photographed from the front: the truth for the garment');
    expect(on.prompt).toContain('PRIORITY when they disagree: the requested change at the end, then the product photographs, then the garment title.');
    expect(on.prompt).not.toContain('image 3 =');
    // everything after the roles line is the unchanged prompt
    const off = simpleReferenceShot({ ...base, view: 'front', promptRules: 'off' });
    expect(on.prompt.replace(/ IMAGE ROLES:.*?Image 1's own clothing never decides anything about the new garment\./, '')).toBe(off.prompt);
  });
  it('a later view names the front render as image 3 and ranks it for colour', () => {
    const on = simpleReferenceShot({ ...base, view: 'back', anchorImageUrl: 'https://gen/front.png', promptRules: 'roles-v1' });
    expect(on.prompt).toContain('image 2 = the NAVY product photographed from the back');
    expect(on.prompt).toContain('image 3 = this garment already rendered on the front view of this set');
    expect(on.prompt).toContain('then image 3 for colour');
  });
  it('a borrowed photo is shape only, never colour', () => {
    const on = simpleReferenceShot({ ...base, view: 'back', anchorImageUrl: 'https://gen/front.png', garmentBorrowed: { back: 'DEEP BLUE' }, modelId: 'gpt-image-25', editMode: 'simple', promptRules: 'roles-v1' } as Parameters<typeof simpleReferenceShot>[0]);
    expect(on.prompt).toContain('image 2 = the DEEP BLUE colourway of this product photographed from the back: shape, construction and print placement only, never colour');
  });
  it('never describes a facial feature or names a flaw', () => {
    const text = imageRoles([{ n: 2, kind: 'front', donor: '' }], '', 'top');
    expect(text).not.toMatch(/\b(eyes?|nose|lips|jaw|cheek|skin tone|no |never shorten|ghost)\b/i);
    expect(text).toContain('image 2 = the product photographed from the front');
  });
  it('parses only the known value', () => {
    expect(parsePromptRules('roles-v1')).toBe('roles-v1');
    expect(parsePromptRules('off')).toBe('off');
    expect(parsePromptRules('roles-v2')).toBeUndefined();
    expect(parsePromptRules(undefined)).toBeUndefined();
  });
});
