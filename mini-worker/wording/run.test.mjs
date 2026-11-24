// @vitest-environment node
import { it, expect, vi } from 'vitest';
import { runIdeas, runMockups, sanitizeIdeas, changeSentence, guardResult } from './run.mjs';
import { ideasPrompt } from './prompt.mjs';

const JPEG = Buffer.concat([Buffer.from('ffd8ffe0', 'hex'), Buffer.alloc(64)]);
const job = (over = {}) => ({ id: 'j1', photoUrl: 'https://b.public.blob.vercel-storage.com/wording-studio-uploads/a.jpg', category: 'top', chosen: [], ...over });
const ev = { ours: [{ style: 'DT62115', name: 'Mineral-Wash Dream Free Graphic Top', faire_units: 780, faire_stores: 103 }], rivals: [{ brand: 'Rival Shop', title: 'Walk By Faith Tee', bestseller: true, days_seen: 9 }] };
const fetchOk = vi.fn(async () => new Response(JPEG, { headers: { 'content-type': 'image/jpeg' } }));

function deps(over = {}) {
  return {
    fetch: fetchOk,
    guard: vi.fn(async () => ({ ok: true })),
    evidence: vi.fn(async () => ev),
    exec: vi.fn(async () => ({ code: 0, stdout: '', stderr: '' })),
    readFile: vi.fn(async () => JPEG),
    ...over,
  };
}

it('guard exit 3 → throws "Codex free allowance used up — resets …" and exec never called', async () => {
  const d = deps({ guard: vi.fn(async () => ({ ok: false, resets: 'Mon Nov 30, 4:49 PM PT' })) });
  await expect(runIdeas(job(), d)).rejects.toThrow('Codex free allowance used up — resets Mon Nov 30, 4:49 PM PT');
  await expect(runMockups(job({ chosen: [['DREAM', 'FREE']] }), d)).rejects.toThrow('Codex free allowance used up');
  expect(d.exec).not.toHaveBeenCalled();
});

it('sanitizeIdeas replaces invented evidence with untested', () => {
  const allowed = new Set(['780 units · 103 stores (DT62115)']);
  const out = sanitizeIdeas({ ideas: [
    { main: ['DREAM', 'FREE'], evidence: '780 units · 103 stores (DT62115)', why: 'our winner' },
    { main: ['GROW IN GRACE'], evidence: '900 units · 200 stores (DT99999)', why: 'made up' },
  ] }, allowed);
  expect(out.map(i => i.evidence)).toEqual(['780 units · 103 stores (DT62115)', 'untested']);
  expect(out.every(i => i.id)).toBe(true);
});

it('sanitizeIdeas drops non-English lines', () => {
  const out = sanitizeIdeas({ ideas: [
    { main: ['사랑'], evidence: 'untested', why: '' },
    { main: ['AMOUR', 'TOUJOURS'], small_top: 'est. 2027', evidence: 'untested', why: '' },
    { main: ['MERCI BEAUCOUP ÇA VA'], evidence: 'untested', why: '' },
    { main: ['THIS LINE IS FAR TOO LONG FOR A TEE'], evidence: 'untested', why: '' },
    { main: ['DON’T WORRY'], evidence: 'untested', why: '' },
  ] }, new Set());
  expect(out.map(i => i.main)).toEqual([['AMOUR', 'TOUJOURS'], ["DON'T WORRY"]]);
});

it('custom wording with quotes, & and $ reaches flatlay as one argv item', async () => {
  const d = deps({ exec: vi.fn(async () => ({ code: 0, stdout: '/tmp/x/m1.png\n', stderr: '' })) });
  await runMockups(job({ chosen: [['WALK BY "FAITH" & $LOVE']] }), d);
  const flat = d.exec.mock.calls.find(c => c[0] === '/usr/bin/python3');
  const args = flat[1];
  const change = args[args.indexOf('--change') + 1];
  expect(change).toContain('WALK BY "FAITH" & $LOVE');
  expect(d.exec.mock.calls.every(c => typeof c[1] === 'object' && Array.isArray(c[1]))).toBe(true);
});

it('runMockups renders sequentially', async () => {
  let live = 0, peak = 0;
  const exec = vi.fn(async (cmd) => {
    if (cmd !== '/usr/bin/python3') return { code: 0, stdout: '', stderr: '' };
    live++; peak = Math.max(peak, live);
    await new Promise(r => setTimeout(r, 20));
    live--; return { code: 0, stdout: '/tmp/x/m.png\n', stderr: '' };
  });
  const out = await runMockups(job({ chosen: [['A'], ['B'], ['C']] }), deps({ exec }));
  expect(peak).toBe(1);
  expect(out.map(o => o.wording)).toEqual([['A'], ['B'], ['C']]);
  expect(out[0].image_base64).toBeTruthy();
});

it('changeSentence names each line and carries the note', () => {
  const s = changeSentence(['DREAM', 'FREE'], 'remove the charm');
  expect(s).toContain('DREAM on the first line and FREE on the second line');
  expect(s).toContain('remove the charm');
});

it('runIdeas sends the photo and evidence to codex and keeps only allowed evidence', async () => {
  const reply = JSON.stringify({ ideas: [{ main: ['DREAM', 'FREE'], evidence: '780 units · 103 stores (DT62115)', why: 'w' }, { main: ['BLESSED'], evidence: 'Competitor Bestseller (Rival Shop)', why: 'w' }, { main: ['JOY'], evidence: '50 units', why: 'w' }] });
  const exec = vi.fn(async (cmd, args, opts) => {
    if (cmd === 'codex') { const o = args[args.indexOf('-o') + 1]; await import('node:fs/promises').then(f => f.writeFile(o, 'Here you go:\n' + reply)); }
    return { code: 0, stdout: '', stderr: '' };
  });
  const out = await runIdeas(job(), deps({ exec, readFile: undefined }));
  const call = exec.mock.calls.find(c => c[0] === 'codex');
  expect(call[1]).toContain('-i');
  expect(call[2].input).toContain('780 units · 103 stores (DT62115)');
  expect(out.map(i => i.evidence)).toEqual(['780 units · 103 stores (DT62115)', 'Competitor Bestseller (Rival Shop)', 'untested']);
});

it('ideasPrompt keeps the avatar and the anti-goals', () => {
  const p = ideasPrompt(ev, job({ note: 'remove charm', style: 'DT78036' }));
  expect(p).toMatch(/40s-50s women/);
  expect(p).toMatch(/English only/i);
  expect(p).toMatch(/Return JSON only/);
  expect(p).toContain('Competitor Bestseller (Rival Shop)');
});

it('sanitizeIdeas drops a why that makes a sales claim', () => {
  const out = sanitizeIdeas({ ideas: [
    { main: ['JOY'], evidence: 'untested', why: 'Sold 900 units on Faire last month' },
    { main: ['HOPE'], evidence: 'untested', why: 'A top bestseller for rivals' },
    { main: ['LOVE'], evidence: 'untested', why: 'Short, warm and easy to read' },
  ] }, new Set());
  expect(out.map(i => i.why)).toEqual(['', '', 'Short, warm and easy to read']);
});

it('guard counts only exit 0 as OK', () => {
  expect(guardResult({ code: 0, stdout: '', stderr: '' }).ok).toBe(true);
  expect(guardResult({ code: 3, stdout: 'used up; it resets Mon Nov 30, 4:49 PM PT.', stderr: '' })).toEqual({ ok: false, resets: 'Mon Nov 30, 4:49 PM PT' });
  expect(guardResult({ code: 1, stdout: '', stderr: 'Traceback' }).ok).toBe(false);
});

it('sanitizeIdeas keeps the first of two ideas with the same main wording', () => {
  const out = sanitizeIdeas({ ideas: [
    { main: ['LOVE'], evidence: 'untested', why: 'a' },
    { main: ['Love'], evidence: 'untested', why: 'b' },
    { main: ['JOY'], evidence: 'untested', why: 'c' },
  ] }, new Set());
  expect(out.map(i => i.why)).toEqual(['a', 'c']);
});

it('runs flatlay with the system python that has numpy, not whatever python3 is on PATH', async () => {
  const d = deps({ exec: vi.fn(async () => ({ code: 0, stdout: '/tmp/x/m1.png\n', stderr: '' })) });
  await runMockups(job({ chosen: [['JOY']] }), d);
  expect(d.exec.mock.calls.some(c => c[0] === '/usr/bin/python3' && String(c[1][0]).endsWith('flatlay.py'))).toBe(true);
});
