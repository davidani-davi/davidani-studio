// @vitest-environment node
import { it, expect, vi } from 'vitest';
import { runOne } from './worker.mjs';

const JPEG = Buffer.concat([Buffer.from('ffd8ffe0', 'hex'), Buffer.alloc(64)]);
const deps = (over = {}) => ({
  fetch: vi.fn(async () => new Response(JPEG)), guard: vi.fn(async () => ({ ok: true })), evidence: vi.fn(async () => ({ ours: [], rivals: [] })),
  exec: vi.fn(async (cmd) => ({ code: 0, stdout: cmd === '/usr/bin/python3' ? '/tmp/m.png\n' : '', stderr: '' })), readFile: vi.fn(async () => JPEG), ...over,
});

it('uploads each mockup on its own call, then completes with their URLs', async () => {
  const api = vi.fn(async (action, body) => (action === 'mockup' ? { url: `https://blob/x/mockup-${body.n}-u.jpg` } : { ok: true }));
  await runOne({ id: 'j', status: 'mockups_running', lease: { token: 't' }, photoUrl: 'https://b/p.jpg', category: 'top', chosen: [['A'], ['B']] }, { api, deps: deps() });
  const actions = api.mock.calls.map(c => c[0]).filter(a => a !== 'heartbeat');
  expect(actions).toEqual(['mockup', 'mockup', 'complete']);
  expect(api.mock.calls.at(-1)[1].mockups).toEqual([{ wording: ['A'], url: 'https://blob/x/mockup-1-u.jpg' }, { wording: ['B'], url: 'https://blob/x/mockup-2-u.jpg' }]);
});

it('fails the job with the allowance message when Codex is used up', async () => {
  const api = vi.fn(async () => ({ ok: true }));
  await expect(runOne({ id: 'j', status: 'ideas_running', lease: { token: 't' }, photoUrl: 'https://b/p.jpg', category: 'top', chosen: [] }, { api, deps: deps({ guard: vi.fn(async () => ({ ok: false, resets: 'Mon' })) }) })).rejects.toThrow();
  expect(api).toHaveBeenCalledWith('fail', { id: 'j', lease: 't', error: 'Codex free allowance used up — resets Mon' });
});

it('waits for a heartbeat in flight and stops beating before it completes', async () => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
  const tick = () => new Promise(r => setTimeout(r, 50));
  try {
    const order = []; let release;
    const api = vi.fn(async (action) => {
      order.push(action);
      if (action === 'heartbeat') { await new Promise(r => { release = r; }); order.push('heartbeat-done'); }
      return { ok: true };
    });
    let finishIdeas;
    const d = deps({ evidence: vi.fn(() => new Promise(r => { finishIdeas = () => r({ ours: [], rivals: [] }); })), exec: vi.fn(async (cmd, args) => {
      if (cmd === 'codex') { const o = args[args.indexOf('-o') + 1]; await import('node:fs/promises').then(f => f.writeFile(o, '{"ideas":[{"main":["JOY"],"evidence":"untested","why":""}]}')); }
      return { code: 0, stdout: '', stderr: '' };
    }), readFile: undefined });
    const run = runOne({ id: 'j', status: 'ideas_running', lease: { token: 't' }, photoUrl: 'https://b/p.jpg', category: 'top', chosen: [] }, { api, deps: d });
    await tick(); vi.advanceTimersByTime(15_000);
    expect(order).toEqual(['heartbeat']);
    finishIdeas();
    await tick(); await tick();
    expect(order).not.toContain('complete');
    release();
    vi.advanceTimersByTime(30_000);
    await run;
    expect(order).toEqual(['heartbeat', 'heartbeat-done', 'complete']);
  } finally { vi.useRealTimers(); }
});
