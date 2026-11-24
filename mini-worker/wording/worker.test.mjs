// @vitest-environment node
import { it, expect, vi } from 'vitest';
import { runOne } from './worker.mjs';

const JPEG = Buffer.concat([Buffer.from('ffd8ffe0', 'hex'), Buffer.alloc(64)]);
const deps = (over = {}) => ({
  fetch: vi.fn(async () => new Response(JPEG)), guard: vi.fn(async () => ({ ok: true })), evidence: vi.fn(async () => ({ ours: [], rivals: [] })),
  exec: vi.fn(async (cmd) => ({ code: 0, stdout: cmd === 'python3' ? '/tmp/m.png\n' : '', stderr: '' })), readFile: vi.fn(async () => JPEG), ...over,
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
