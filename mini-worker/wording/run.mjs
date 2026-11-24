// Runs one Wording Studio job on the Mac mini: ideas through one Codex text turn, mockups through
// davidani-flatlay (Codex image tool). Codex only, guard before every call, never --allow-credits.
import { execFile, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile as fsRead, writeFile, rm } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { evidenceLines } from './evidence.mjs';
import { ideasPrompt } from './prompt.mjs';

const SKILL = join(homedir(), '.claude/skills/davidani-flatlay/scripts');
export const FLATLAY = join(SKILL, 'flatlay.py');
export const GUARD = join(SKILL, 'codex_guard.py');
const ORD = ['first', 'second', 'third'];

/** execFile with stdin and no shell: every argument is its own argv item. */
export function realExec(cmd, args, { input, cwd, timeout = 15 * 60_000 } = {}) {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { cwd, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    const t = setTimeout(() => p.kill('SIGTERM'), timeout);
    p.stdout.on('data', d => (stdout += d)); p.stderr.on('data', d => (stderr += d));
    p.on('close', code => { clearTimeout(t); resolve({ code, stdout, stderr }); });
    p.on('error', e => { clearTimeout(t); resolve({ code: -1, stdout, stderr: String(e) }); });
    p.stdin.end(input ?? '');
  });
}

export async function realGuard() {
  const r = await realExec('python3', [GUARD], { timeout: 30_000 });
  if (r.code === 3) return { ok: false, resets: (r.stdout + r.stderr).match(/resets ([^.]+)\./)?.[1] || 'next week' };
  return { ok: true };
}

async function guarded(deps) {
  const g = await deps.guard();
  if (!g.ok) throw new Error(`Codex free allowance used up — resets ${g.resets}`);
}

const ascii = (s) => !/[^\x20-\x7E]/.test(s);
const straighten = (s) => String(s ?? '').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, ' ').trim();

export function sanitizeIdeas(raw, allowed) {
  const list = Array.isArray(raw?.ideas) ? raw.ideas : Array.isArray(raw) ? raw : [];
  const out = [];
  for (const r of list) {
    const main = (Array.isArray(r?.main) ? r.main : [r?.main]).map(straighten).filter(Boolean);
    if (!main.length || main.length > 3 || main.some(l => l.length > 24 || !ascii(l))) continue;
    const small = (v) => { const s = straighten(v); return s && ascii(s) && s.length <= 40 ? s : undefined; };
    const evidence = straighten(r?.evidence);
    out.push({ id: randomUUID().slice(0, 8), main, small_top: small(r?.small_top), small_bottom: small(r?.small_bottom),
      evidence: allowed.has(evidence) ? evidence : 'untested', why: ascii(straighten(r?.why)) ? straighten(r?.why).slice(0, 200) : '' });
    if (out.length === 8) break;
  }
  return out;
}

export function parseLastJson(text) {
  const end = text.lastIndexOf('}');
  for (let i = text.indexOf('{'); i !== -1 && i < end; i = text.indexOf('{', i + 1)) {
    try { const v = JSON.parse(text.slice(i, end + 1)); if (v && (v.ideas || Array.isArray(v))) return v; } catch { /* keep looking */ }
  }
  throw new Error('Codex did not return ideas as JSON');
}

export function changeSentence(lines, note) {
  const where = lines.length === 1 ? `the words ${lines[0]} on one line`
    : lines.map((l, i) => `${l} on the ${ORD[i]} line`).join(lines.length === 2 ? ' and ' : ', ').replace(/, ([^,]+)$/, ', and $1');
  return `Replace the existing wording with ${where}, in the same lettering technique and craft effect (same colour, texture, raised or embroidered look), same size and same placement; keep any small secondary lines as blank tonal texture with no readable words. Change nothing else about the garment.` + (note ? ` ${note}` : '');
}

async function photo(job, deps, dir) {
  const r = await deps.fetch(job.photoUrl, { signal: AbortSignal.timeout(60_000) });
  if (!r.ok) throw new Error('Could not download the photo');
  const bytes = Buffer.from(await r.arrayBuffer());
  const heic = /^ftyp(heic|heix|mif1|msf1|hevc)/.test(bytes.subarray(4, 12).toString('latin1'));
  const ext = heic ? 'heic' : bytes.subarray(0, 8).toString('hex') === '89504e470d0a1a0a' ? 'png' : 'jpg';
  const src = join(dir, 'photo.' + ext);
  await writeFile(src, bytes);
  if (!heic) return src;
  const jpg = join(dir, 'photo.jpg');
  const c = await deps.exec('sips', ['-s', 'format', 'jpeg', src, '--out', jpg], { timeout: 60_000 });
  if (c.code !== 0) throw new Error('Could not read the HEIC photo');
  return jpg;
}

export async function runIdeas(job, deps) {
  await guarded(deps);
  const read = deps.readFile || fsRead;
  const dir = await mkdtemp(join(tmpdir(), 'ws-ideas-'));
  try {
    const ev = await deps.evidence();
    const src = await photo(job, deps, dir);
    const out = join(dir, 'reply.txt');
    const r = await deps.exec('codex', ['exec', '--skip-git-repo-check', '--sandbox', 'read-only', '--ephemeral', '-C', dir, '-i', src, '-o', out, '-'], { input: ideasPrompt(ev, job), cwd: dir, timeout: 10 * 60_000 });
    if (r.code !== 0) throw new Error('Codex could not write ideas: ' + (r.stderr || r.stdout).slice(-300));
    const ideas = sanitizeIdeas(parseLastJson(String(await read(out))), evidenceLines(ev));
    if (!ideas.length) throw new Error('Codex returned no usable English ideas');
    return ideas;
  } finally { await rm(dir, { recursive: true, force: true }).catch(() => {}); }
}

export async function runMockups(job, deps, onEach = async () => {}) {
  const read = deps.readFile || fsRead;
  const dir = await mkdtemp(join(tmpdir(), 'ws-mock-'));
  try {
    await guarded(deps);
    const src = await photo(job, deps, dir);
    const out = [];
    for (const [i, wording] of job.chosen.slice(0, 3).entries()) {
      if (i) await guarded(deps);
      const title = `${job.style ? job.style + ' ' : ''}${job.category === 'top' ? 'graphic top' : job.category}`;
      const r = await deps.exec('python3', [FLATLAY, src, '--category', job.category, '--title', title, '--change', changeSentence(wording, job.note), '--variants', '1', '--out', dir, '--name', 'm' + (i + 1)], { cwd: dir, timeout: 15 * 60_000 });
      if (r.code === 3) throw new Error('Codex free allowance used up — resets next week');
      const png = r.stdout.trim().split('\n').filter(Boolean).pop();
      if (r.code !== 0 || !png || png === 'FAILED') throw new Error(`Mockup ${i + 1} failed: ` + (r.stderr || r.stdout).slice(-300));
      const jpg = join(dir, `m${i + 1}.jpg`);
      const c = await deps.exec('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '90', png, '--out', jpg], { timeout: 60_000 });
      if (c.code !== 0) throw new Error('Could not convert the mockup');
      const item = { wording, image_base64: Buffer.from(await read(jpg)).toString('base64') };
      out.push(item); await onEach(item, i + 1);
    }
    return out;
  } finally { await rm(dir, { recursive: true, force: true }).catch(() => {}); }
}
