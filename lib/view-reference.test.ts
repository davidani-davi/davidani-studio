import { describe,it,expect } from 'vitest';
import { staticModelsTagged } from './models-registry';
import { viewReference } from './view-reference';
import { framingFor } from './plate-framing';
const models=staticModelsTagged();
describe('exact view references',()=>{
  for(const model of models.filter(m=>m.id.startsWith('studio '))) {
    it.each(['front','side','back','full'] as const)(`${model.name}: %s uses that view`,view=>{
      const ref=viewReference(models,model.id,model.poses[0].id,view,framingFor('pants',view));
      expect(ref.view).toBe(view);expect(ref.publicPath).toMatch(new RegExp('/'+view+'\\.'));
      if(view==='full')expect(ref.humanModelId).toBe(model.id);
    });
  }
  it('rejects an absent view rather than substitute a front',()=>{
    const one=models.find(m=>m.id==='studio 103')!;
    const broken={...one,poses:[{...one.poses[0],views:{front:one.poses[0].views.front}}]};
    expect(()=>viewReference([broken],one.id,one.poses[0].id,'back','low')).toThrow('Missing back reference');
  });
  it('records when a generated DONUTS pose supplies the reference',()=>{
    expect(viewReference(models,'studio 103','studio 103','back','low')).toMatchObject({humanModelId:'low 103',synthesized:true});
  });
});
