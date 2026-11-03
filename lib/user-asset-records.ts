export type AssetRecord<T> =
  | { deleted: false; value: T }
  | { deleted: true };

export function mergeAssetRecords<T extends { id: string }>(
  legacy: T[],
  records: Array<{ id: string; record: AssetRecord<T> }>
): T[] {
  const merged = new Map(legacy.map((item) => [item.id, item] as const));
  for (const { id, record } of records) {
    if (record.deleted) merged.delete(id);
    else merged.set(id, record.value);
  }
  return Array.from(merged.values());
}

// Record files (2026-11-03). Overwriting one Blob file left reads stale for 4-60 s: the CDN keeps the old copy and
// ignores a ?query, and every edit reads the whole record before writing it back, so a second edit inside that
// window put the first one back. Each save now writes a new file, `<prefix><id>/<version>.json`; a file never
// served before cannot be stale. A set saved earlier still has one `<prefix><id>.json` until its next save.
export interface RecordFile {
  pathname: string;
  url: string;
  uploadedAt: Date | string;
}

/** The set id a record file belongs to, or null for anything else under the prefix. */
export function recordId(prefix: string, pathname: string): string | null {
  if (!pathname.startsWith(prefix) || !pathname.endsWith(".json")) return null;
  const parts = pathname.slice(prefix.length, -".json".length).split("/");
  if (parts.length > 2 || parts.some((part) => !part)) return null;
  return parts[0];
}

/** Newer first: the later upload, then the later name (version names start with the time). */
function newer(a: RecordFile, b: RecordFile): number {
  return new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime() || (a.pathname < b.pathname ? 1 : a.pathname > b.pathname ? -1 : 0);
}

/** The newest file of each set. */
export function latestRecordFiles<F extends RecordFile>(prefix: string, files: F[]): Map<string, F> {
  const latest = new Map<string, F>();
  for (const file of files) {
    const id = recordId(prefix, file.pathname);
    if (!id) continue;
    const seen = latest.get(id);
    if (!seen || newer(file, seen) < 0) latest.set(id, file);
  }
  return latest;
}

/** The files of one set older than the one just written, safe to delete: a newer save by someone else is kept. */
export function olderRecordFiles<F extends RecordFile>(files: F[], mine: RecordFile): F[] {
  return files.filter((file) => file.pathname !== mine.pathname && newer(file, mine) > 0);
}

/** A version file name that sorts by time. */
export function recordVersion(now = Date.now()): string {
  return `${now.toString(36).padStart(9, "0")}-${Math.random().toString(36).slice(2, 8).padEnd(6, "0")}`;
}
