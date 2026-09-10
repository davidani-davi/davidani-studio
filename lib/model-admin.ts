import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { list, put } from '@vercel/blob';

import type { CatalogChange } from "./model-admin-core";
export * from "./model-admin-core";
const PREFIX = 'model-admin/changes/';
const localDir = () => path.join(process.cwd(), '.data', 'model-admin');
export const VIEWS = ['front', 'side', 'back', 'full'] as const;
export const MAX_PHOTO_BYTES = 20 * 1024 * 1024;
export const ASSET_PREFIX = 'model-admin/photos/';

/** Immutable change records keep concurrent edits to different views independent.
 * Reads fail closed: an unavailable store must never resurrect deleted references. */
export async function readCatalogChanges(): Promise<CatalogChange[]> {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    let files: string[];
    try { files = await fs.readdir(localDir()); }
    catch (e: any) { if (e.code === 'ENOENT') return []; throw e; }
    return Promise.all(files.filter(f => f.endsWith('.json')).map(async f => JSON.parse(await fs.readFile(path.join(localDir(), f), 'utf8'))));
  }
  const blobs: Array<{url: string}> = [];
  let cursor: string | undefined;
  do {
    const page = await list({prefix: PREFIX, cursor, limit: 1000});
    blobs.push(...page.blobs); cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  return Promise.all(blobs.map(async blob => {
    const response = await fetch(blob.url, {cache: 'no-store'});
    if (!response.ok) throw Error('Reference library could not be loaded. Please retry.');
    return response.json();
  }));
}

export async function appendCatalogChange(change: Omit<CatalogChange, 'id' | 'at'>): Promise<CatalogChange> {
  const record = {...change, id: randomUUID(), at: new Date().toISOString()};
  const filename = `${record.at.replace(/[:.]/g, '-')}-${record.id}.json`;
  const body = JSON.stringify(record);
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    await put(PREFIX + filename, body, {access:'public', addRandomSuffix:false, contentType:'application/json'});
  } else {
    await fs.mkdir(localDir(), {recursive:true});
    const temporary = path.join(localDir(), filename + '.tmp');
    await fs.writeFile(temporary, body);
    await fs.rename(temporary, path.join(localDir(), filename));
  }
  return record;
}

