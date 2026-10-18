interface Sliceable<T> {
  readonly length: number;
  slice(start: number, end: number): T;
}

export function chunk<T extends Sliceable<T>>(items: T, size: number): T[] {
  const chunks: T[] = [];
  for (let start = 0; start < items.length; start += size) {
    chunks.push(items.slice(start, start + size));
  }
  return chunks;
}

export function appendTo<K, T>(groups: Map<K, T[]>, key: K, item: T): void {
  const group = groups.get(key);
  if (group === undefined) {
    groups.set(key, [item]);
  } else {
    group.push(item);
  }
}
