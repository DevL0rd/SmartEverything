import type { Ledger } from './ledger';
import type { MediaRow } from './types';

export function isKnown(row: MediaRow, ledger: Ledger): boolean {
  const entry = ledger.find(row.id);
  return entry?.modificationTime === row.modificationTime && entry.uploadedAt !== null;
}

export function freshRows(rows: readonly MediaRow[], ledger: Ledger): readonly MediaRow[] {
  return rows.filter((row) => !isKnown(row, ledger));
}

export function removedIds(present: ReadonlySet<string>, ledger: Ledger): readonly string[] {
  return [...ledger.localIds()].filter((localId) => !present.has(localId));
}

export function unknownIds(
  present: ReadonlySet<string>,
  ledger: Ledger,
  unresolved: ReadonlySet<string>,
): readonly string[] {
  return [...present].filter((localId) => !ledger.has(localId) && !unresolved.has(localId));
}

export function takenAtOf(row: MediaRow): string {
  const taken = row.creationTime !== null && row.creationTime > 0 ? row.creationTime : null;
  return new Date(taken ?? row.modificationTime).toISOString();
}

export function identityOf(row: MediaRow): string {
  return `${row.id}|${String(row.modificationTime)}`;
}

export function lastModified(rows: readonly MediaRow[]): number {
  return rows.reduce((latest, row) => Math.max(latest, row.modificationTime), 0);
}
