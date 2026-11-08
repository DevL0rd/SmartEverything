import type { FileEntry } from '@smarteverything/domain';

export type Picked = ReadonlyMap<string, FileEntry>;

export const NOTHING_PICKED: Picked = new Map();

export function toggled(picked: Picked, entry: FileEntry): Picked {
  const next = new Map(picked);
  if (!next.delete(entry.path)) next.set(entry.path, entry);
  return next;
}

export function pickedAll(entries: readonly FileEntry[]): Picked {
  return new Map(entries.map((entry) => [entry.path, entry] as const));
}
