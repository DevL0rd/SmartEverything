import { describe, expect, it } from 'vitest';
import type { NextTable } from '../../../store/state';
import { DRIVE_TABLE_RULES, driveTablesOf } from '../../../store/drive-tables';
import { albumRow, personalRootRow, rootRow, OWNER_ID, ROOT_ID, OTHER_ROOT_ID } from './fixtures';

describe('drive table rules', () => {
  it('keys rows by id and orders personal drives before the Shared Drive', () => {
    const shared = rootRow(ROOT_ID, 'ready');
    const own = personalRootRow(OTHER_ROOT_ID, OWNER_ID);
    expect(DRIVE_TABLE_RULES.drive_roots.idOf(shared)).toBe(ROOT_ID);
    expect([shared, own].sort(DRIVE_TABLE_RULES.drive_roots.order).map((row) => row.scope)).toEqual(
      ['person', 'home'],
    );
    const album = albumRow(ROOT_ID);
    expect(DRIVE_TABLE_RULES.drive_albums.idOf(album)).toBe(album.id);
  });

  it('builds every drive table from the snapshot, empty when absent', () => {
    const calls: string[] = [];
    const next: NextTable = (name, rows) => {
      calls.push(`${name}:${String(rows.length)}`);
      return { byId: {}, ids: [], rows: [], version: 0 };
    };
    const root = rootRow(ROOT_ID, 'ready');
    driveTablesOf({ drive_roots: [root] }, next);
    expect(calls).toEqual([
      'drive_roots:1',
      'drive_albums:0',
      'drive_grants:0',
      'drive_placements:0',
    ]);
  });
});
