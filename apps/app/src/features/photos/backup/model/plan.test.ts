import { describe, expect, it } from 'vitest';
import { Ledger } from './ledger';
import {
  freshRows,
  identityOf,
  isKnown,
  lastModified,
  removedIds,
  takenAtOf,
  unknownIds,
} from './plan';
import type { MediaRow } from './types';

const HASH = 'ab'.repeat(32);

function row(id: string, modificationTime: number, creationTime: number | null = null): MediaRow {
  return { id, filename: `${id}.jpg`, kind: 'photo', creationTime, modificationTime };
}

function ledgerWith(uploadedAt: string | null): Ledger {
  const ledger = new Ledger();
  ledger.put({
    localId: 'a',
    sha256: HASH,
    bytes: 10,
    modificationTime: 100,
    uploadedAt,
    itemId: null,
  });
  return ledger;
}

describe('backup plan', () => {
  it('knows an item only when it was uploaded with the same modification time', () => {
    expect(isKnown(row('a', 100), ledgerWith('2026-11-07T10:00:00.000Z'))).toBe(true);
    expect(isKnown(row('a', 101), ledgerWith('2026-11-07T10:00:00.000Z'))).toBe(false);
    expect(isKnown(row('a', 100), ledgerWith(null))).toBe(false);
    expect(isKnown(row('b', 100), ledgerWith('2026-11-07T10:00:00.000Z'))).toBe(false);
  });

  it('keeps only the rows that still need work', () => {
    const ledger = ledgerWith('2026-11-07T10:00:00.000Z');
    expect(freshRows([row('a', 100), row('b', 5)], ledger).map((entry) => entry.id)).toEqual(['b']);
  });

  it('finds the ledger entries whose item left the library', () => {
    const ledger = ledgerWith('2026-11-07T10:00:00.000Z');
    expect(removedIds(new Set(['b']), ledger)).toEqual(['a']);
    expect(removedIds(new Set(['a']), ledger)).toEqual([]);
  });

  it('finds library items the ledger has never seen, ignoring the ones already unresolved', () => {
    const ledger = ledgerWith(null);
    expect(unknownIds(new Set(['a', 'b', 'c']), ledger, new Set(['c']))).toEqual(['b']);
  });

  it('dates an item by its capture time, or its modification time when that is missing', () => {
    expect(takenAtOf(row('a', 2000, 1000))).toBe('1970-01-01T00:00:01.000Z');
    expect(takenAtOf(row('a', 2000, 0))).toBe('1970-01-01T00:00:02.000Z');
    expect(takenAtOf(row('a', 2000, null))).toBe('1970-01-01T00:00:02.000Z');
  });

  it('names an upload by item and modification time so an edit is a new upload', () => {
    expect(identityOf(row('content://media/1', 7))).toBe('content://media/1|7');
    expect(lastModified([row('a', 3), row('b', 9), row('c', 4)])).toBe(9);
  });
});
