import {describe,it,expect,vi,beforeEach,afterEach} from 'vitest';
import {render,screen,fireEvent,within,waitFor} from '@testing-library/react';
import ModelAdmin,{photoFilename} from './ModelAdmin';
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
  fireEvent.click(screen.getByRole('button',{name:/^Trash\s*1$/}));
  await screen.findByRole('heading',{name:'Retired pants'});
  expect(screen.getByRole('heading',{name:'Trash · 1 model'})).toBeInTheDocument();
  expect(screen.getByRole('button',{name:/^Bottoms/})).toHaveAttribute('aria-pressed','false');
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
 it('stays on the live list after a delete, counts live models and offers Undo',async()=>{
  vi.stubGlobal('confirm',vi.fn(()=>true));
  const posts:any[]=[];
  vi.mocked(fetch).mockImplementation(async(_url,init)=>{
   if(init?.method!=='POST')return new Response(JSON.stringify({models,cloudUploads:false}));
   const body=JSON.parse(String(init.body));posts.push(body.action);
   return new Response(JSON.stringify({change:{kind:'model',modelId:body.modelId,patch:{deleted:body.action==='deleteModel'}}}));
  });
  render(<ModelAdmin/>);await screen.findByRole('heading',{name:'Celine 1'});
  expect(screen.getByRole('button',{name:/^Tops/})).toHaveTextContent('2');
  fireEvent.click(screen.getByRole('button',{name:'Delete model'}));
  const notice=await screen.findByRole('status');
  expect(notice).toHaveTextContent('Moved Celine 1 to Trash.');
  // Still on Tops, the next live model is open, and the counts are live counts.
  await screen.findByRole('heading',{name:'Shared reference'});
  expect(screen.getByRole('heading',{name:'Tops references'})).toBeInTheDocument();
  expect(screen.getByRole('button',{name:/^Tops/})).toHaveTextContent('1');
  expect(screen.getByRole('button',{name:/^Trash/})).toHaveTextContent('2');
  expect(within(screen.getByRole('complementary',{name:'Reference library'})).queryByRole('button',{name:/Celine 1/})).toBeNull();
  fireEvent.click(within(notice).getByRole('button',{name:'Undo'}));
  await screen.findByRole('heading',{name:'Celine 1'});
  expect(screen.getByRole('status')).toHaveTextContent('Restored Celine 1.');
  expect(screen.getByRole('button',{name:/^Tops/})).toHaveTextContent('2');
  expect(posts).toEqual(['deleteModel','restoreModel']);
 });
 it('keeps errors visible and allows a failed read to be retried',async()=>{
  vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({error:'Unavailable'}),{status:503}));
  render(<ModelAdmin/>);expect(await screen.findByRole('alert')).toHaveTextContent('Unavailable');
  fireEvent.click(screen.getByRole('button',{name:'Refresh'}));
  await screen.findByRole('heading',{name:'Celine 1'});
  await waitFor(()=>expect(screen.queryByRole('alert')).toBeNull());
 });
});

it('does not offer legacy row protection as approval for Simple garment swap',async()=>{
 const url='/user-assets/model-admin/photos/reviewed.png';
 vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({models:[{id:'reviewed',name:'Reviewed model',poses:[{...pose('crop'),publicPath:url,views:{front:{publicPath:url,filename:'reviewed.png',protection:{width:2000,height:2992,sha256:'same',protectedRows:748,transitionRows:48}}}}]}],cloudUploads:false})));
 render(<ModelAdmin/>);await screen.findByRole('heading',{name:'Reviewed model'});
 expect(screen.queryByRole('button',{name:'Face protection'})).toBeNull();
 vi.stubGlobal('URL',Object.assign(URL,{createObjectURL:vi.fn(()=>'/preview.png'),revokeObjectURL:vi.fn()}));
 fireEvent.change(screen.getByLabelText('Replace front photo'),{target:{files:[new File(['photo'],'photo.png',{type:'image/png'})]}});
 expect(screen.getByRole('dialog')).toHaveTextContent('New or replaced photos need a face/hair contour review');
 expect(screen.queryByRole('slider')).toBeNull();
 expect(screen.getByRole('button',{name:'Save photo'})).toBeEnabled();
});
describe('download a reference photo',()=>{
 it('saves the stored original under the model, pose and view name',async()=>{
  const fetchMock=vi.fn(async(url:string)=>url==='/front.png'?new Response(new Blob(['png'],{type:'image/png'})):new Response(JSON.stringify({models,cloudUploads:false})));
  vi.stubGlobal('fetch',fetchMock);
  const create=vi.spyOn(URL,'createObjectURL').mockReturnValue('blob:front');const revoke=vi.spyOn(URL,'revokeObjectURL').mockImplementation(()=>{});
  const clicks:{href:string;download:string}[]=[];
  const click=vi.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(function(this:HTMLAnchorElement){clicks.push({href:this.href,download:this.download});});
  render(<ModelAdmin/>);await screen.findByRole('heading',{name:'Celine 1'});
  fireEvent.click(screen.getByRole('button',{name:'Download front photo'}));
  await waitFor(()=>expect(clicks).toEqual([{href:'blob:front',download:'Celine-1-Top-pose-front.png'}]));
  expect(fetchMock).toHaveBeenCalledWith('/front.png',{cache:'no-store'});
  await waitFor(()=>expect(screen.getByRole('button',{name:'Download front photo'})).toHaveTextContent(/^Download$/));
  click.mockRestore();create.mockRestore();revoke.mockRestore();
 });
 it('opens the file when the fetch fails, asking Blob for an attachment',async()=>{
  const url='https://x.public.blob.vercel-storage.com/a/front.jpg';
  const m=[{id:'top',name:'Celine 1',poses:[{...pose('crop'),views:{front:{publicPath:url,filename:'front.jpg'}}}]}];
  vi.stubGlobal('fetch',vi.fn(async(u:string)=>u===url?new Response('',{status:500}):new Response(JSON.stringify({models:m,cloudUploads:false}))));
  const open=vi.spyOn(window,'open').mockReturnValue(null);
  render(<ModelAdmin/>);await screen.findByRole('heading',{name:'Celine 1'});
  fireEvent.click(screen.getByRole('button',{name:'Download front photo'}));
  await waitFor(()=>expect(open).toHaveBeenCalledWith(`${url}?download=1`,'_blank','noopener'));
  open.mockRestore();
 });
 it('names files readably and keeps the stored extension',()=>{
  expect(photoFilename(['Celine · DET70085',false,'front'],'https://x.public.blob.vercel-storage.com/a/b.JPG?v=2')).toBe('Celine-DET70085-front.jpg');
  expect(photoFilename(['',undefined],'/models/x')).toBe('reference.jpg');
 });
});
