// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { memoryStore } from './store';
import { createJob, claimNext, heartbeat, completeIdeas, completeMockups, failJob, chooseIdeas, LeaseError, LEASE_MS } from './jobs';
import type { Idea } from './types';
import { StaleWriteError } from './types';

const photo = 'https://x.public.blob.vercel-storage.com/wording-studio-uploads/a.jpg';
const idea = (id: string): Idea => ({ id, main: ['DREAM', 'FREE'], evidence: 'untested', why: 'short and positive' });

describe('wording studio jobs', () => {
  it('claims oldest queued job and sets a 120 s lease', async () => {
    const s = memoryStore();
    const a = await createJob(s, { photoUrl: photo }, 1000);
    await createJob(s, { photoUrl: photo }, 2000);
    const claimed = await claimNext(s, 5000);
    expect(claimed?.id).toBe(a.id);
    expect(claimed?.status).toBe('ideas_running');
    expect(claimed?.lease?.until).toBe(5000 + LEASE_MS);
    expect(LEASE_MS).toBe(120000);
    expect(claimed?.attempts).toBe(1);
  });

  it('requeues an expired lease once then fails with "The studio computer stopped answering"', async () => {
    const s = memoryStore();
    const a = await createJob(s, { photoUrl: photo }, 0);
    await claimNext(s, 1000);
    const again = await claimNext(s, 1000 + LEASE_MS + 1);
    expect(again?.id).toBe(a.id);
    expect(again?.attempts).toBe(2);
    const none = await claimNext(s, 1000 + 2 * LEASE_MS + 10);
    expect(none).toBeNull();
    const failed = await s.read(a.id);
    expect(failed?.status).toBe('failed');
    expect(failed?.error).toBe('The studio computer stopped answering');
  });

  it('rejects complete with a wrong lease (LeaseError)', async () => {
    const s = memoryStore();
    const a = await createJob(s, { photoUrl: photo }, 0);
    const c = await claimNext(s, 10);
    await expect(completeIdeas(s, a.id, 'wrong', [idea('1')], 20)).rejects.toBeInstanceOf(LeaseError);
    await expect(heartbeat(s, a.id, c!.lease!.token, 10 + LEASE_MS + 1)).rejects.toBeInstanceOf(LeaseError);
    await expect(failJob(s, a.id, 'wrong', 'x', 20)).rejects.toBeInstanceOf(LeaseError);
    const done = await completeIdeas(s, a.id, c!.lease!.token, [idea('1')], 20);
    expect(done.status).toBe('ideas_ready');
    expect(done.lease).toBeUndefined();
  });

  it('chooseIdeas rejects 0 or 4 choices and lines over 24 chars', async () => {
    const s = memoryStore();
    const a = await createJob(s, { photoUrl: photo }, 0);
    const c = await claimNext(s, 10);
    await completeIdeas(s, a.id, c!.lease!.token, [idea('1')], 20);
    await expect(chooseIdeas(s, a.id, [], 30)).rejects.toThrow();
    await expect(chooseIdeas(s, a.id, [['A'], ['B'], ['C'], ['D']], 30)).rejects.toThrow();
    await expect(chooseIdeas(s, a.id, [['X'.repeat(25)]], 30)).rejects.toThrow();
    await expect(chooseIdeas(s, a.id, [['A', 'B', 'C', 'D']], 30)).rejects.toThrow();
    const ok = await chooseIdeas(s, a.id, [['DREAM', 'FREE'], ['GROW IN GRACE']], 30);
    expect(ok.status).toBe('queued_mockups');
    expect(ok.queuedAt).toBe(30);
    const m = await claimNext(s, 40);
    expect(m?.status).toBe('mockups_running');
    const fin = await completeMockups(s, a.id, m!.lease!.token, [{ wording: ['DREAM', 'FREE'], url: 'https://b/x.png' }], 50);
    expect(fin.status).toBe('done');
  });

  it('write never reuses a pathname', async () => {
    const s = memoryStore();
    const a = await createJob(s, { photoUrl: photo }, 0);
    await claimNext(s, 1);
    const c = await s.read(a.id);
    await heartbeat(s, a.id, c!.lease!.token, 2);
    const keys = s.keys().filter(k => k.includes(a.id));
    expect(keys.length).toBe(3);
    expect(new Set(keys).size).toBe(3);
    expect((await s.read(a.id))?.seq).toBe(3);
  });

  it('a heartbeat built on a copy read before complete cannot undo it', async () => {
    const s = memoryStore();
    const a = await createJob(s, { photoUrl: photo }, 0);
    const c = await claimNext(s, 10);
    const stale = await s.read(a.id);
    await completeIdeas(s, a.id, c!.lease!.token, [idea('1')], 20);
    await expect(s.write({ ...stale!, lease: { token: c!.lease!.token, until: 99_999 } })).rejects.toBeInstanceOf(StaleWriteError);
    expect((await s.read(a.id))?.status).toBe('ideas_ready');
  });
});
