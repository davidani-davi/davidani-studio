#!/usr/bin/env node
// Wording Studio worker on the Mac mini. Outbound only: polls the Studio for jobs, runs them, posts results.
// Usage: node mini-worker/wording/worker.mjs ~/.config/davidani/wording-worker.json  (chmod 600: {endpoint, token, pgUrl, trackerDb})
import { readFileSync, statSync } from 'node:fs';
import { gatherEvidence } from './evidence.mjs';
import { realExec, realGuard, runIdeas, runMockups } from './run.mjs';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const log = (...a) => console.log(new Date().toISOString(), ...a);
const ORIGIN = 'https://davidani-studio.vercel.app';

export function makeApi(cfg, fetchImpl = fetch) {
  return async (action, body = {}) => {
    const r = await fetchImpl(cfg.endpoint, { method: 'POST', signal: AbortSignal.timeout(100_000), headers: { 'content-type': 'application/json', authorization: 'Bearer ' + cfg.token }, body: JSON.stringify({ action, ...body }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(d.error || 'Studio unavailable'), { status: r.status });
    return d;
  };
}

async function deliver(api, action, body) {
  for (let n = 0; ; n++) {
    try { return await api(action, body); }
    catch (e) { if (n >= 4 || e.status === 401 || e.status === 403 || e.status === 409 || e.status === 413) throw e; await sleep(2000 * (n + 1)); }
  }
}

export async function runOne(job, { api, deps }) {
  const lease = job.lease.token;
  let inFlight = Promise.resolve();
  const beat = setInterval(() => { inFlight = api('heartbeat', { id: job.id, lease }).catch(e => log('heartbeat failed', e.status || e.message)); }, 15_000);
  // Stop beating and let any heartbeat already sent land before a final write, so it cannot race the completion.
  const settle = async () => { clearInterval(beat); await inFlight; };
  try {
    if (job.status === 'ideas_running') {
      const ideas = await runIdeas(job, deps);
      await settle();
      await deliver(api, 'complete', { id: job.id, lease, ideas });
    } else if (job.status === 'mockups_running') {
      const mockups = [];
      await runMockups(job, deps, async (m, n) => {
        const { url } = await deliver(api, 'mockup', { id: job.id, lease, n, image_base64: m.image_base64 });
        mockups.push({ wording: m.wording, url });
      });
      await settle();
      await deliver(api, 'complete', { id: job.id, lease, mockups });
    } else throw new Error('Unknown job state ' + job.status);
  } catch (e) {
    await settle();
    const msg = /^Codex free allowance/.test(e.message) ? e.message : 'The studio computer could not finish this: ' + String(e.message).slice(0, 200);
    await api('fail', { id: job.id, lease, error: msg }).catch(() => {});
    throw e;
  } finally { clearInterval(beat); }
}

async function main() {
  const file = process.argv[2];
  if (!file) throw new Error('Pass the worker config file.');
  if ((statSync(file).mode & 0o077) !== 0) throw new Error('Config file must be chmod 600.');
  const cfg = JSON.parse(readFileSync(file, 'utf8'));
  if (new URL(cfg.endpoint).origin !== ORIGIN) throw new Error('Endpoint must be the production Studio.');
  const api = makeApi(cfg);
  const deps = { fetch, exec: realExec, guard: realGuard, evidence: () => gatherEvidence({ pgUrl: cfg.pgUrl, trackerDb: cfg.trackerDb }) };
  let stopped = false;
  for (const s of ['SIGTERM', 'SIGINT']) process.on(s, () => { stopped = true; });
  log('Wording Studio worker started');
  while (!stopped) {
    let job;
    try {
      ({ job } = await api('claim'));
      if (!job) { await sleep(15_000); continue; }
      log('started', job.id, job.status);
      await runOne(job, { api, deps });
      log('finished', job.id);
    } catch (e) {
      log('stopped', job?.id || '', e.status || '', String(e.message).slice(0, 300));
      await sleep(15_000);
    }
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch(e => { console.error(e.message); process.exitCode = 1; });
