import {beforeEach,describe,expect,it,vi} from 'vitest';
vi.mock('@vercel/blob',()=>({list:vi.fn(),put:vi.fn()}));
vi.mock('node:fs/promises',()=>({default:{readFile:vi.fn(),writeFile:vi.fn(),mkdir:vi.fn(),readdir:vi.fn()}}));
import fs from 'node:fs/promises';
import {list,put} from '@vercel/blob';
import {readIdentitySet,listIdentitySets,createIdentitySet} from './reference-identity-store';
const id='11111111-1111-4111-a111-111111111111';const set:any={id,createdAt:'2026-09-10',name:'Test'};
beforeEach(()=>{vi.resetAllMocks();vi.stubEnv('BLOB_READ_WRITE_TOKEN','');vi.stubEnv('VERCEL','');});
describe('durable reference set receipts',()=>{
 it('writes locally once and handles duplicate receipts',async()=>{expect(await createIdentitySet(set)).toBe(true);expect(fs.writeFile).toHaveBeenCalledWith(expect.any(String),JSON.stringify(set),{flag:'wx'});vi.mocked(fs.writeFile).mockRejectedValue({code:'EEXIST'});expect(await createIdentitySet(set)).toBe(false);});
 it('rejects invalid IDs and ephemeral production storage',async()=>{await expect(createIdentitySet({...set,id:'../'})).rejects.toThrow();vi.stubEnv('VERCEL','1');await expect(createIdentitySet(set)).rejects.toThrow('Persistent');expect(fs.writeFile).not.toHaveBeenCalled();});
 it('returns missing records locally but surfaces IO errors',async()=>{expect(await readIdentitySet('../')).toBeNull();vi.mocked(fs.readFile).mockRejectedValue({code:'ENOENT'});expect(await readIdentitySet(id)).toBeNull();vi.mocked(fs.readFile).mockRejectedValue(Error('disk'));await expect(readIdentitySet(id)).rejects.toThrow('disk');});
 it('reads and sorts local history, including an empty store',async()=>{vi.mocked(fs.readdir).mockRejectedValue({code:'ENOENT'});expect(await listIdentitySets()).toEqual([]);vi.mocked(fs.readdir).mockResolvedValue(['x.json','other.tmp'] as any);vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(set));expect(await listIdentitySets()).toEqual([set]);});
 it('uses immutable Blob records and catches only duplicate writes',async()=>{vi.stubEnv('BLOB_READ_WRITE_TOKEN','test');expect(await createIdentitySet(set)).toBe(true);expect(put).toHaveBeenCalledWith(expect.any(String),JSON.stringify(set),expect.objectContaining({allowOverwrite:false}));vi.mocked(put).mockRejectedValue({name:'BlobPreconditionFailedError'});expect(await createIdentitySet(set)).toBe(false);vi.mocked(put).mockRejectedValue(Error('offline'));await expect(createIdentitySet(set)).rejects.toThrow('offline');});
 it('reads exact Blob keys, paginates history and propagates unavailable storage',async()=>{
  vi.stubEnv('BLOB_READ_WRITE_TOKEN','test');vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,json:async()=>set}));vi.mocked(list).mockResolvedValue({blobs:[{pathname:`reference-identity/sets/${id}.json`,url:'https://owned/set.json'}],hasMore:false} as any);expect(await readIdentitySet(id)).toEqual(set);expect(await listIdentitySets()).toEqual([set]);
  vi.mocked(list).mockResolvedValueOnce({blobs:[],hasMore:true,cursor:'next'} as any).mockResolvedValueOnce({blobs:[],hasMore:false} as any);expect(await listIdentitySets()).toEqual([]);expect(list).toHaveBeenLastCalledWith(expect.objectContaining({cursor:'next'}));
  vi.mocked(fetch).mockResolvedValue({ok:false} as any);await expect(readIdentitySet(id)).rejects.toThrow();
 });
});
