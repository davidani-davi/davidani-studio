// @vitest-environment node
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import sharp from 'sharp';
import {inspectAdminPhoto,validUploadPath} from './model-admin-photo';
const blob=vi.hoisted(()=>({list:vi.fn(),head:vi.fn()}));
vi.mock('@vercel/blob',()=>blob);
const key='model-admin/photos/12345678-1234-1234-1234-123456789012.png';
const url='https://test.public.blob.vercel-storage.com/'+key;
beforeEach(()=>{vi.stubEnv('BLOB_READ_WRITE_TOKEN','test');blob.list.mockResolvedValue({blobs:[{url}]});blob.head.mockResolvedValue({url,pathname:key,size:100});});
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();vi.clearAllMocks();});
describe('reference upload validation',()=>{
 it('rejects traversal and unsupported paths',()=>{expect(validUploadPath(key)).toBe(true);for(const p of ['../'+key,key+'.html','models/front.png'])expect(validUploadPath(p)).toBe(false);});
 it('never fetches external or unowned URLs',async()=>{const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);await expect(inspectAdminPhoto('http://169.254.169.254/photo.png')).rejects.toThrow();blob.list.mockResolvedValue({blobs:[]});await expect(inspectAdminPhoto(url)).rejects.toThrow('not in this reference library');expect(fetcher).not.toHaveBeenCalled();});
 it('records protection against original decoded pixels',async()=>{const bytes=await sharp({create:{width:20,height:40,channels:3,background:'#bca'}}).png().toBuffer();vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(bytes)));const p=await inspectAdminPhoto(url,25);expect(p.publicPath).toBe(url);expect(p.protection).toMatchObject({width:20,height:40,protectedRows:10,transitionRows:1});expect(p.protection?.sha256).toMatch(/^[a-f0-9]{64}$/);});
 it('rejects non-image bytes before recording a reference',async()=>{vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response('<html>bad</html>')));await expect(inspectAdminPhoto(url)).rejects.toThrow();});
 it('rejects files beyond the pixel limit',async()=>{const bytes=await sharp({create:{width:4097,height:1,channels:3,background:'white'}}).png().toBuffer();vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(bytes)));await expect(inspectAdminPhoto(url)).rejects.toThrow();});
});

describe('saved face and hair protection',()=>{
 async function image(background='#bca'){
  const bytes=await sharp({create:{width:20,height:2992,channels:3,background}}).png().toBuffer();
  vi.stubGlobal('fetch',vi.fn(async()=>new Response(bytes)));
 }
 it('keeps the reviewed 48-row blend through a save/reopen and older callers',async()=>{
  await image();
  const saved=await inspectAdminPhoto(url,25,48/2992*100);
  expect(saved.protection).toMatchObject({protectedRows:748,transitionRows:48});
  const reopened=await inspectAdminPhoto(url,25,undefined,saved.protection);
  expect(reopened.protection).toEqual(saved.protection);
  const changed=await inspectAdminPhoto(url,25,.5,saved.protection);
  expect(changed.protection?.transitionRows).toBe(15);
  expect((await inspectAdminPhoto(url,undefined,undefined,saved.protection)).protection).toBeUndefined();
 });
 it('does not transfer a reviewed blend to a replacement photo',async()=>{
  await image();const previous=(await inspectAdminPhoto(url,25,1.6)).protection;
  await image('#abc');const replacement=await inspectAdminPhoto(url,25,undefined,previous);
  expect(replacement.protection?.transitionRows).toBe(15);
  expect(replacement.protection?.sha256).not.toBe(previous?.sha256);
 });
 it.each([0,-1,6,NaN,Infinity,'1.6',null])('rejects invalid hair blend %s',async blend=>{
  await expect(inspectAdminPhoto(url,25,blend as number)).rejects.toThrow('hair blend');
 });
 it('rejects missing boundaries and bands that consume the protected region',async()=>{
  await expect(inspectAdminPhoto(url,undefined,1)).rejects.toThrow('hair blend');
  await expect(inspectAdminPhoto(url,1,1)).rejects.toThrow('hair blend');
  await expect(inspectAdminPhoto(url,NaN)).rejects.toThrow('boundary');
  await image();const previous=(await inspectAdminPhoto(url,25,1.6)).protection;
  await expect(inspectAdminPhoto(url,1,undefined,previous)).rejects.toThrow('protected area');
 });
});
