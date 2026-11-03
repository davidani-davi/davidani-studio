import { describe, it, expect } from 'vitest';
import { cleanFacts, factsBlock, factsSetLength, parseFactsRead } from './garment-facts';
import { simpleReferenceShot } from './simple-reference-shot';

const pants = { referenceUrl: 'https://ref/front.jpg', garmentImageUrls: ['https://blob/front.jpg'], category: 'pants' as const, framing: 'low' as const, view: 'front' as const, garmentName: 'Seamed Cargo Drawstring Wide Leg Pants' };
const top = { referenceUrl: 'https://ref/front.png', garmentImageUrls: ['https://erp/front.png'], category: 'top' as const, framing: 'crop' as const, view: 'front' as const, garmentName: 'Oversized Cable Knit Sweater' };

describe('garment facts', () => {
  it('without facts the Simple prompt is byte-identical', () => {
    for (const o of [pants, top]) {
      const before = simpleReferenceShot(o);
      expect(simpleReferenceShot({ ...o, garmentFacts: null }).prompt).toBe(before.prompt);
      expect(simpleReferenceShot({ ...o, garmentFacts: {} }).prompt).toBe(before.prompt);
      expect(simpleReferenceShot({ ...o, garmentFacts: { bottomLength: 'nonsense' } as any }).prompt).toBe(before.prompt);
      expect(before.prompt).not.toContain('GARMENT FACTS');
      expect(before.garmentFactsUsed).toBe(false);
    }
  });

  it('pants facts state the length and leg shape, and image 2 stops deciding the hem', () => {
    const before = simpleReferenceShot(pants);
    const shot = simpleReferenceShot({ ...pants, garmentFacts: { photo: 'hanger', bottomLength: 'full', shape: 'wide', sleeve: 'long' } });
    expect(shot.garmentFactsUsed).toBe(true);
    expect(shot.prompt).toContain('GARMENT FACTS (checked against the real garment by the operator)');
    expect(shot.prompt).toContain('Leg length: full length: both hems reach the top of the foot and cover the ankle.');
    expect(shot.prompt).toContain('Leg shape: wide leg');
    expect(shot.prompt).toContain('snapshot of the garment hanging on a hanger');
    // Bottoms never get sleeve facts.
    expect(shot.prompt).not.toContain('Sleeves:');
    expect(before.prompt).toContain('image 2 alone decides where the hem falls');
    expect(shot.prompt).not.toContain('image 2 alone decides where the hem falls');
    expect(shot.prompt).toContain('with the length and shape the GARMENT FACTS state');
    // Images and order unchanged.
    expect(shot.image_urls).toEqual(before.image_urls);
  });

  it('a photo type alone adds only the photo sentence and leaves the hem to image 2', () => {
    const shot = simpleReferenceShot({ ...pants, garmentFacts: { photo: 'mannequin' } });
    expect(shot.prompt).not.toContain('GARMENT FACTS');
    expect(shot.prompt).toContain('dress form');
    expect(shot.prompt).toContain('image 2 alone decides where the hem falls');
  });

  it('a top states sleeves and fit, never leg facts', () => {
    const b = factsBlock({ topLength: 'hip', sleeve: 'three-quarter', fit: 'boxy', bottomLength: 'full', shape: 'wide' }, 'top', 'top');
    expect(b).toContain('Length: hip length');
    expect(b).toContain('Sleeves: 7/10 (three-quarter)');
    expect(b).toContain('Fit: boxy');
    expect(b).not.toContain('Leg');
  });

  it('a skirt uses skirt lengths and drops a pants-only code', () => {
    expect(factsBlock({ bottomLength: 'midi' }, 'bottoms', 'skirt')).toContain('Skirt length: midi: the hem ends at mid-calf.');
    expect(factsBlock({ bottomLength: 'capri' }, 'bottoms', 'skirt')).toBe('');
  });

  it('a set names top and bottom lengths', () => {
    const b = factsBlock({ topLength: 'cropped', bottomLength: 'ankle' }, 'outfit', 'set');
    expect(b).toContain('Top length: cropped');
    expect(b).toContain('Bottom length: 9/10 (ankle)');
  });

  it('cleanFacts keeps known codes only and a short safe details line', () => {
    expect(cleanFacts(null)).toBeNull();
    expect(cleanFacts({ bottomLength: 'FULL', fit: 'huge', details: 'print only "inside"\nthe back leg' })).toEqual({ bottomLength: 'full', details: 'print only inside the back leg' });
    expect(cleanFacts({ details: 'x'.repeat(500) })!.details!.length).toBe(200);
  });

  it('factsSetLength follows the scope', () => {
    expect(factsSetLength({ sleeve: 'long' }, 'bottoms')).toBe(false);
    expect(factsSetLength({ bottomLength: 'full' }, 'bottoms')).toBe(true);
    expect(factsSetLength({ sleeve: 'long' }, 'top')).toBe(true);
    expect(factsSetLength(null, 'outfit')).toBe(false);
  });

  it('parseFactsRead drops nulls and unknown codes, keeps reasons for kept fields', () => {
    const r = parseFactsRead('Here: {"photo":"hanger","bottomLength":"cropped","shape":"wide","sleeve":null,"fit":"null","details":"","why":{"bottomLength":{"en":"L/R 3.0","ko":"8부"},"sleeve":{"en":"x"}},"sure":{"bottomLength":"Medium","shape":"sure"}}');
    expect(r!.facts).toEqual({ photo: 'hanger', bottomLength: 'cropped', shape: 'wide' });
    expect(r!.why).toEqual({ bottomLength: { en: 'L/R 3.0', ko: '8부' } });
    expect(r!.sure).toEqual({ bottomLength: 'medium' });
    expect(parseFactsRead('no json')).toBeNull();
    expect(parseFactsRead('{broken')).toBeNull();
  });
});
