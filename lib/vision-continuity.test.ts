import { expect, it } from 'vitest';
import { visionContinuity } from './vision-continuity';
it('uses the new generated front as canvas for all later Vision views', () => {
  for (const id of ['studio 97','crop 97','studio 99','crop 99','low 97','low 99'])
    for (const view of ['side','back','full'] as const)
      expect(visionContinuity(id,view,'https://images.test/front.png','https://studio.test')?.canvasImageUrl).toBe('https://images.test/front.png');
});
it('direct views fall back to the approved master and keep directional guidance', () => {
  expect(visionContinuity('crop 99','side','','https://studio.test')?.canvasImageUrl).toBe('https://studio.test/models/studio%2099/front.png');
  expect(visionContinuity('studio 97','back','','https://studio.test')?.rule).toContain('no face visible');
  expect(visionContinuity('studio 97','full','','https://studio.test')?.rule).toContain('including her feet');
});
it('leaves front generation and other models intact', () => {
  expect(visionContinuity('studio 97','front','','https://studio.test')).toBeNull();
  expect(visionContinuity('studio 98','side','','https://studio.test')).toBeNull();
});
