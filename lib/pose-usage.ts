import fs from 'node:fs/promises';
import path from 'node:path';
import { list, put } from '@vercel/blob';
import { emptyPoseUsage, GARMENT_READ_KEYS, type GarmentRead, type PoseSlot, type PoseUsage } from './user-poses';

/**
 * How often each pose of a recast set was used and which pose each style got (lib/user-poses.ts pickPose), plus the
 * cached garment read per style. One record per set AND view: the side, back and full views render at the same time,
 * and one shared record would lose their writes (Blob has no transactions). Same Blob/local pattern as lib/shot-tasks.ts.
 */
const PREFIX = 'pose-usage/';
const LOCAL_DIR = process.env.VERCEL ? path.join('/tmp', 'pose-usage') : path.join(process.cwd(), '.data', 'pose-usage');

const canUseBlob = () => Boolean(process.env.BLOB_READ_WRITE_TOKEN);
const safe = (s: string) => s.replace(/[^a-zA-Z0-9-]+/g, '_').slice(0, 120) || '_';
const usageKey = (setId: string, slot: PoseSlot) => `sets/${safe(setId)}/${slot}.json`;
const garmentKey = (key: string) => `garments/${safe(key.toUpperCase())}.json`;

async function readJson<T>(key: string): Promise<T | null> {
  if (!canUseBlob()) {
    try {
      return JSON.parse(await fs.readFile(path.join(LOCAL_DIR, key), 'utf8')) as T;
    } catch {
      return null;
    }
  }
  const found = await list({ prefix: PREFIX + key, limit: 1 });
  const blob = found.blobs.find((b) => b.pathname === PREFIX + key);
  if (!blob) return null;
  // A unique query param per read: Blob's CDN can serve a stale overwrite for a while.
  const res = await fetch(`${blob.url}${blob.url.includes('?') ? '&' : '?'}nocache=${Date.now().toString(36)}`, { cache: 'no-store' });
  return res.ok ? ((await res.json()) as T) : null;
}

async function writeJson(key: string, value: unknown): Promise<void> {
  const body = JSON.stringify(value);
  if (!canUseBlob()) {
    const file = path.join(LOCAL_DIR, key);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, body);
    return;
  }
  await put(PREFIX + key, body, { access: 'public', addRandomSuffix: false, contentType: 'application/json', allowOverwrite: true, cacheControlMaxAge: 60 });
}

export async function readPoseUsage(setId: string, slot: PoseSlot): Promise<PoseUsage> {
  const raw = await readJson<Partial<PoseUsage>>(usageKey(setId, slot));
  return { ...emptyPoseUsage(), ...(raw && typeof raw === 'object' ? { uses: raw.uses || {}, choices: raw.choices || {} } : {}) };
}

/** One use of a pose for a view; with a style code it also becomes that style's choice for the view. */
export async function recordPoseUse(setId: string, slot: PoseSlot, poseId: string, styleCode?: string, at = new Date()): Promise<void> {
  const usage = await readPoseUsage(setId, slot);
  const prev = usage.uses[poseId];
  usage.uses[poseId] = { count: (prev?.count || 0) + 1, lastUsed: at.toISOString() };
  const style = String(styleCode || '').trim().toUpperCase();
  if (style) usage.choices[style] = poseId;
  await writeJson(usageKey(setId, slot), usage);
}

/** The vision part of a style's garment read (the title part is recomputed every time, it is free). */
export async function readCachedGarmentRead(key: string): Promise<GarmentRead | null> {
  if (!key) return null;
  const raw = await readJson<Record<string, unknown>>(garmentKey(key)).catch(() => null);
  return raw && GARMENT_READ_KEYS.every((k) => typeof raw[k] === 'boolean') ? (raw as unknown as GarmentRead) : null;
}

export async function writeCachedGarmentRead(key: string, read: GarmentRead): Promise<void> {
  if (key) await writeJson(garmentKey(key), { ...read, readAt: new Date().toISOString() });
}
