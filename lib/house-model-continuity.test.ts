import { expect, it } from 'vitest';
import { houseModelContinuity } from './house-model-continuity';
it('uses the new generated front as canvas for all later Vision and Celine views', () => {
  for (const id of ['studio 98','crop 98','low 98','studio 97','crop 97','studio 99','crop 99','low 97','low 99','studio 100','crop 100','low 100'])
    for (const view of ['side','back','full'] as const)
      expect(houseModelContinuity(id,view,'https://images.test/front.png','https://studio.test')?.canvasImageUrl).toBe('https://images.test/front.png');
});
it('direct views fall back to the approved master and keep directional guidance', () => {
  expect(houseModelContinuity('crop 99','side','','https://studio.test')?.canvasImageUrl).toBe('https://studio.test/models/studio%2099/front.png');
  expect(houseModelContinuity('crop 100','side','','https://studio.test')?.canvasImageUrl).toBe('https://studio.test/models/studio%20100/front.png');
  expect(houseModelContinuity('studio 97','back','','https://studio.test')?.rule).toContain('no face visible');
  expect(houseModelContinuity('studio 97','full','','https://studio.test')?.rule).toContain('including her feet');
});
it('leaves front generation and other models intact', () => {
  expect(houseModelContinuity('studio 97','front','','https://studio.test')).toBeNull();
  expect(houseModelContinuity('studio 10','side','','https://studio.test')).toBeNull();
});
