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
