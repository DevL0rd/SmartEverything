export function trimOldest<K, V>(entries: Map<K, V>, keep: number): void {
  for (const key of entries.keys()) {
    if (entries.size <= keep) return;
    entries.delete(key);
  }
}
