import { describe, expect, it } from 'vitest';
import type { NextTable } from '../../../store/state';
import { DRIVE_TABLE_RULES, driveTablesOf } from '../../../store/drive-tables';
import { albumRow, rootRow, ROOT_ID, OTHER_ROOT_ID } from './fixtures';

describe('drive table rules', () => {
  it('keys rows by id and orders roots and albums by name', () => {
    const photos = rootRow(ROOT_ID, 'ready');
    const other = { ...rootRow(OTHER_ROOT_ID, 'ready'), label: 'Archive' };
    expect(DRIVE_TABLE_RULES.drive_roots.idOf(photos)).toBe(ROOT_ID);
    expect(
      [photos, other].sort(DRIVE_TABLE_RULES.drive_roots.order).map((row) => row.label),
    ).toEqual(['Archive', 'Photos']);
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
      'drive_sync_clients:0',
      'drive_placements:0',
    ]);
  });
});
