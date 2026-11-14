import { SNAPSHOT } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { replaceWith } from './live-reducers';
import { snapshotWire } from './snapshot-fixture';
import { emptyState } from './state';

const DRIVE_TABLES = ['drive_roots', 'drive_albums', 'drive_grants', 'drive_placements'] as const;

const SNAPSHOT_WIRE = SNAPSHOT.parse(snapshotWire());

function onlyIn(left: readonly string[], right: readonly string[]): readonly string[] {
  return left.filter((name) => !right.includes(name));
}

describe('store tables and snapshot tables', () => {
  it('keeps the drive tables in the store and in the snapshot builder', () => {
    const stored = Object.keys(emptyState().tables);
    for (const name of DRIVE_TABLES) {
      expect(stored, `${name} is missing from the store tables`).toContain(name);
    }
    const built = Object.keys(replaceWith(emptyState(), SNAPSHOT_WIRE).tables);
    for (const name of DRIVE_TABLES) {
      expect(built, `${name} is missing from the snapshot tables`).toContain(name);
    }
  });

  it('creates every store table that the snapshot builder also creates', () => {
    const stored = Object.keys(emptyState().tables).sort();
    const built = Object.keys(replaceWith(emptyState(), SNAPSHOT_WIRE).tables).sort();
    expect(onlyIn(stored, built), 'a store table is missing from the snapshot builder').toEqual([]);
    expect(onlyIn(built, stored), 'a snapshot table is missing from the store').toEqual([]);
  });

  it('holds a real empty table for every store table the store declares', () => {
    for (const [name, table] of Object.entries(emptyState().tables)) {
      expect(table, name).toEqual({ byId: {}, ids: [], rows: [], version: 0 });
    }
  });
});
