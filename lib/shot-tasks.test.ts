import {beforeEach,afterEach,it,expect,vi} from 'vitest';
const mock=vi.hoisted(()=>({put:vi.fn()}));
vi.mock('@vercel/blob',()=>({put:mock.put,list:vi.fn()}));
const original={...process.env};
beforeEach(()=>{vi.resetModules();mock.put.mockReset();process.env.BLOB_READ_WRITE_TOKEN='test';});
afterEach(()=>{process.env={...original};});
const task={id:'safe-task-123',status:'running' as const,view:'front',createdAt:1,updatedAt:1};
it('uses an exclusive Blob claim and distinguishes collisions from outages',async()=>{
  const {createShotTask}=await import('./shot-tasks');
  mock.put.mockResolvedValue({});expect(await createShotTask(task)).toBe(true);
  expect(mock.put.mock.calls[0][2]).toMatchObject({allowOverwrite:false,addRandomSuffix:false});
  mock.put.mockRejectedValue(Error('blob already exists'));expect(await createShotTask(task)).toBe(false);
  mock.put.mockRejectedValue(Object.assign(Error('precondition'),{name:'BlobPreconditionFailedError'}));
  expect(await createShotTask(task)).toBe(false);
  mock.put.mockRejectedValue(Error('offline'));await expect(createShotTask(task)).rejects.toThrow('offline');
  await expect(createShotTask({...task,id:'../bad'})).rejects.toThrow('Invalid task ID');
});
it('requires persistent storage in serverless production',async()=>{
  delete process.env.BLOB_READ_WRITE_TOKEN;process.env.VERCEL='1';
  const {createShotTask}=await import('./shot-tasks');
  await expect(createShotTask(task)).rejects.toThrow('Persistent shot storage');
});
