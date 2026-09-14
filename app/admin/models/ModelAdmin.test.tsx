import {describe,it,expect,vi,beforeEach,afterEach} from 'vitest';
import {render,screen,fireEvent,within,waitFor} from '@testing-library/react';
import ModelAdmin from './ModelAdmin';
import type {ManagedModel} from '@/lib/model-admin-core';
const pose=(framing:'crop'|'low')=>({id:framing,label:framing==='low'?'Pants pose':'Top pose',framing,publicPath:'/front.png',filename:'front.png',subdir:'',views:{front:{publicPath:'/front.png',filename:'front.png'}}});
const models:ManagedModel[]=[{id:'top',name:'Celine 1',character:'celine',poses:[pose('crop')]},{id:'studio 103',name:'DP52083 · Donuts',poses:[pose('low')]},{id:'mixed',name:'Shared reference',poses:[pose('crop'),pose('low')]},{id:'crop 97',name:'Hidden crop',poses:[pose('crop')]},{id:'deleted-bottom',name:'Retired pants',deleted:true,poses:[pose('low')]}];
beforeEach(()=>vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({models,cloudUploads:false})))));
afterEach(()=>vi.unstubAllGlobals());
describe('reference library navigation',()=>{
 it('starts on tops, filters bottoms to three views, and changes the selected editor',async()=>{
  render(<ModelAdmin/>);
  const library=screen.getByRole('complementary',{name:'Reference library'});
  await within(library).findByRole('button',{name:/Celine 1/});
  expect(within(library).queryByRole('button',{name:/Donuts/})).toBeNull();
  expect(await screen.findByRole('heading',{name:'Full',exact:true})).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:/^Bottoms/}));
  await screen.findByRole('heading',{name:'DP52083 · Donuts'});
  expect(within(library).queryByRole('button',{name:/Celine 1/})).toBeNull();
  expect(screen.queryByRole('heading',{name:'Full',exact:true})).toBeNull();
  expect(screen.getByRole('heading',{name:'DP52083 · Donuts'})).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:/All references/}));
  expect(within(library).getAllByRole('button',{pressed:false}).length).toBeGreaterThan(1);
  expect(within(library).queryByRole('button',{name:/Hidden crop/})).toBeNull();
 });
 it('searches within a section, clears an invisible selection and keeps trash separate',async()=>{
  render(<ModelAdmin/>);await screen.findByRole('heading',{name:'Celine 1'});
  fireEvent.change(screen.getByRole('textbox',{name:'Search models'}),{target:{value:'missing'}});
  await screen.findByRole('heading',{name:'Choose a model'});
  fireEvent.change(screen.getByRole('textbox',{name:'Search models'}),{target:{value:''}});
  fireEvent.click(screen.getByRole('button',{name:/^Bottoms/}));
  fireEvent.click(screen.getByRole('button',{name:'Trash',exact:true}));
  await screen.findByRole('heading',{name:'Retired pants'});
  expect(screen.getByRole('button',{name:'Restore model'})).toBeVisible();
  fireEvent.click(screen.getByRole('button',{name:'Back to models'}));
  await screen.findByRole('heading',{name:'DP52083 · Donuts'});
 });
 it('selects the matching pose for a model that belongs in both sections',async()=>{
  render(<ModelAdmin/>);await screen.findByRole('heading',{name:'Celine 1'});
  fireEvent.click(screen.getByRole('button',{name:/Shared reference/}));
  expect(screen.getByLabelText('Pose set')).toHaveValue('crop');
  fireEvent.click(screen.getByRole('button',{name:/^Bottoms/}));
  expect(screen.getByLabelText('Pose set')).toHaveValue('low');
  fireEvent.click(screen.getByRole('button',{name:'Add pose set'}));
  expect(within(screen.getByRole('dialog')).getByLabelText('Front, side and back framing')).toHaveValue('low');
 });
 it('keeps errors visible and allows a failed read to be retried',async()=>{
  vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({error:'Unavailable'}),{status:503}));
  render(<ModelAdmin/>);expect(await screen.findByRole('alert')).toHaveTextContent('Unavailable');
  fireEvent.click(screen.getByRole('button',{name:'Refresh'}));
  await screen.findByRole('heading',{name:'Celine 1'});
  await waitFor(()=>expect(screen.queryByRole('alert')).toBeNull());
 });
});

it('reopens and saves a custom hair blend without resetting it, and requires review after a change',async()=>{
 const url='/user-assets/model-admin/photos/reviewed.png';
 let protection={width:2000,height:2992,sha256:'same',protectedRows:748,transitionRows:48};
 let saved:any;
 const library=()=>[{id:'reviewed',name:'Reviewed model',poses:[{...pose('crop'),publicPath:url,views:{front:{publicPath:url,filename:'reviewed.png',protection}}}]}];
 vi.mocked(fetch).mockImplementation(async(_url,init)=>{
  if(init?.method==='POST'){
   saved=JSON.parse(String(init.body));
   protection={...protection,protectedRows:Math.round(2992*saved.protectedPercent/100),transitionRows:Math.round(2992*saved.blendPercent/100)};
   return new Response(JSON.stringify({change:{id:'saved',at:'2026-09-14',kind:'photo',modelId:'reviewed',poseId:'crop',view:'front',photo:{publicPath:url,filename:'reviewed.png',protection}}}));
  }
  return new Response(JSON.stringify({models:library(),cloudUploads:false}));
 });
 render(<ModelAdmin/>);await screen.findByRole('heading',{name:'Reviewed model'});
 fireEvent.click(screen.getByRole('button',{name:'Face protection'}));
 const review=()=>screen.getByRole('checkbox',{name:/I checked/});
 expect(screen.getByRole('button',{name:'Save photo'})).toBeDisabled();
 fireEvent.click(review());fireEvent.click(screen.getByRole('button',{name:'Save photo'}));
 await waitFor(()=>expect(screen.queryByRole('dialog')).toBeNull());
 expect(saved.blendPercent).toBeCloseTo(48/2992*100,10);
 expect(protection.transitionRows).toBe(48);
 fireEvent.click(screen.getByRole('button',{name:'Face protection'}));
 fireEvent.click(review());
 fireEvent.change(screen.getByRole('slider',{name:'Front hair blend'}),{target:{value:'2'}});
 expect(screen.getByRole('button',{name:'Save photo'})).toBeDisabled();
 expect(screen.getByLabelText('Hair blend area')).toHaveStyle({top:'23%',height:'2%'});
 fireEvent.click(review());fireEvent.click(screen.getByRole('button',{name:'Save photo'}));
 await waitFor(()=>expect(screen.queryByRole('dialog')).toBeNull());
 expect(protection.transitionRows).toBe(60);
 fireEvent.click(screen.getByRole('button',{name:'Refresh'}));
 await screen.findByRole('button',{name:'Face protection'});
 fireEvent.click(screen.getByRole('button',{name:'Face protection'}));
 expect(Number((screen.getByRole('slider',{name:'Front hair blend'}) as HTMLInputElement).value)).toBeCloseTo(60/2992*100,4);
});
