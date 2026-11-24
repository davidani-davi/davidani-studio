import { randomUUID } from 'node:crypto';
import type { Category, Idea, Job, JobStore, Mockup } from './types';
import { CATEGORIES } from './types';

export const LEASE_MS = 120_000;
export const MAX_CHOICES = 3, MAX_LINES = 3, MAX_LINE = 24;
export const STALL_MESSAGE = 'The studio computer stopped answering';
export class LeaseError extends Error { constructor(m = 'Lease expired or not yours') { super(m); this.name = 'LeaseError'; } }
export class InputError extends Error { constructor(m: string) { super(m); this.name = 'InputError'; } }

const RUNNING: Record<string, Job['status']> = { queued_ideas: 'ideas_running', queued_mockups: 'mockups_running' };
const REQUEUE: Record<string, Job['status']> = { ideas_running: 'queued_ideas', mockups_running: 'queued_mockups' };

export async function createJob(store: JobStore, input: { photoUrl: string; style?: string; note?: string; category?: Category }, now = Date.now()): Promise<Job> {
  const category = input.category && CATEGORIES.includes(input.category) ? input.category : 'top';
  return store.write({
    id: randomUUID(), createdAt: new Date(now).toISOString(), createdBy: 'studio', photoUrl: input.photoUrl,
    style: input.style?.trim().slice(0, 40) || undefined, note: input.note?.trim().slice(0, 500) || undefined,
    category, status: 'queued_ideas', ideas: [], chosen: [], mockups: [], attempts: 0, seq: 0, queuedAt: now,
  });
}

export async function claimNext(store: JobStore, now = Date.now()): Promise<Job | null> {
  const jobs = (await store.list(50)).reverse(); // oldest first
  for (const j of jobs) {
    if (REQUEUE[j.status] && j.lease && j.lease.until < now) {
      if (j.attempts >= 2) { await store.write({ ...j, status: 'failed', error: STALL_MESSAGE, lease: undefined }); continue; }
      return store.write({ ...j, lease: { token: randomUUID(), until: now + LEASE_MS }, attempts: j.attempts + 1 });
    }
  }
  const queued = jobs.filter(j => RUNNING[j.status]).sort((a, b) => a.queuedAt - b.queuedAt)[0];
  if (!queued) return null;
  return store.write({ ...queued, status: RUNNING[queued.status], lease: { token: randomUUID(), until: now + LEASE_MS }, attempts: queued.attempts + 1 });
}

export async function leased(store: JobStore, id: string, token: string, now: number) {
  const j = await store.read(id);
  if (!j || !j.lease || j.lease.token !== token || j.lease.until < now || !REQUEUE[j.status]) throw new LeaseError();
  return j;
}

export async function heartbeat(store: JobStore, id: string, token: string, now = Date.now()) {
  const j = await leased(store, id, token, now);
  return store.write({ ...j, lease: { token, until: now + LEASE_MS } });
}

export async function completeIdeas(store: JobStore, id: string, token: string, ideas: Idea[], now = Date.now()) {
  const j = await leased(store, id, token, now);
  if (j.status !== 'ideas_running') throw new LeaseError('Not an ideas job');
  return store.write({ ...j, status: 'ideas_ready', ideas, lease: undefined, attempts: 0 });
}

export async function completeMockups(store: JobStore, id: string, token: string, mockups: Mockup[], now = Date.now()) {
  const j = await leased(store, id, token, now);
  if (j.status !== 'mockups_running') throw new LeaseError('Not a mockups job');
  return store.write({ ...j, status: 'done', mockups, lease: undefined });
}

export async function failJob(store: JobStore, id: string, token: string, message: string, now = Date.now()) {
  const j = await leased(store, id, token, now);
  return store.write({ ...j, status: 'failed', error: String(message || 'Failed').slice(0, 300), lease: undefined });
}

export function validChoices(chosen: unknown): string[][] {
  if (!Array.isArray(chosen) || chosen.length < 1 || chosen.length > MAX_CHOICES) throw new InputError('Pick 1 to 3 wordings.');
  return chosen.map(c => {
    if (!Array.isArray(c)) throw new InputError('Each wording is a list of lines.');
    const lines = c.map(l => String(l ?? '').trim()).filter(Boolean);
    if (lines.length < 1 || lines.length > MAX_LINES) throw new InputError('Each wording has 1 to 3 lines.');
    if (lines.some(l => l.length > MAX_LINE)) throw new InputError(`Keep each line to ${MAX_LINE} characters.`);
    return lines;
  });
}

export async function chooseIdeas(store: JobStore, id: string, chosen: unknown, now = Date.now()) {
  const lines = validChoices(chosen);
  const j = await store.read(id);
  if (!j) throw new InputError('Job not found.');
  if (j.status !== 'ideas_ready') throw new InputError('This job is not waiting for a choice.');
  return store.write({ ...j, status: 'queued_mockups', chosen: lines, queuedAt: now, attempts: 0 });
}

export type PublicJob = Omit<Job, 'lease'> & { leaseUntil?: number };
/** What the browser sees: no lease token, only when the lease runs out. */
export function publicJob(j: Job): PublicJob { const { lease, ...rest } = j; return lease ? { ...rest, leaseUntil: lease.until } : rest; }
