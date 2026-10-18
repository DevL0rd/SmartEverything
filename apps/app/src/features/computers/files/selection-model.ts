import type { FileEntry } from '@smarteverything/domain';
import { plural } from '../../../format/text';

export type Picked = ReadonlyMap<string, FileEntry>;

export const NOTHING_PICKED: Picked = new Map();

export function toggled(picked: Picked, entry: FileEntry): Picked {
  const next = new Map(picked);
  if (!next.delete(entry.path)) next.set(entry.path, entry);
  return next;
}

export function selectionLabel(count: number): string {
  return `${plural(count, 'item')} selected`;
}

export function pickedAll(entries: readonly FileEntry[]): Picked {
  return new Map(entries.map((entry) => [entry.path, entry] as const));
}
