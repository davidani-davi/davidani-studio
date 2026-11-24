import { describe, it, expect } from 'vitest';
import { simpleQualityOf, simpleQualityRefusal, simpleGptResolution } from './simple-quality';
import { buildGptImageOptions } from './fal';

describe('Simple render quality', () => {
  it('defaults to medium; only "high" turns it up', () => {
    expect(simpleQualityOf(undefined)).toBe('medium');
    expect(simpleQualityOf('standard')).toBe('medium');
    expect(simpleQualityOf('medium')).toBe('medium');
    expect(simpleQualityOf('HIGH')).toBe('medium');
    expect(simpleQualityOf('high')).toBe('high');
  });
  it('maps to GPT medium and high through the resolution generate-model already reads', () => {
    expect(buildGptImageOptions({ resolution: simpleGptResolution('medium') }).quality).toBe('medium');
    expect(buildGptImageOptions({ resolution: simpleGptResolution('high') }).quality).toBe('high');
  });
  it('refuses unknown values and High on Nano, only in Simple mode', () => {
    const ok = { quality: 'high', editMode: 'simple', nano: false };
    expect(simpleQualityRefusal(ok)).toBe('');
    expect(simpleQualityRefusal({ ...ok, quality: undefined })).toBe('');
    expect(simpleQualityRefusal({ ...ok, quality: 'standard' })).toBe('');
    expect(simpleQualityRefusal({ ...ok, quality: 'ultra' })).toBe('Choose Standard or High quality.');
    expect(simpleQualityRefusal({ ...ok, nano: true })).toBe('High quality works with GPT Image 2.5 or GPT 2, not Nano.');
    expect(simpleQualityRefusal({ ...ok, quality: 'standard', nano: true })).toBe('');
    // House reference sets read body.quality their own way (noPlateQualityOf).
    expect(simpleQualityRefusal({ ...ok, quality: 'xhigh', editMode: undefined })).toBe('');
  });
});
