import { compareText } from '../format/text';
import type { NextTable, RowOf, Tables } from './state';
import type { TableRule } from './table-rules';

const ALL = Number.MAX_SAFE_INTEGER;

const SCOPE_RANK = { person: 0, home: 1 } as const;

type DriveTables = Pick<
  Tables,
  'drive_roots' | 'drive_albums' | 'drive_grants' | 'drive_placements'
>;

export interface DriveTableRules {
  readonly drive_roots: TableRule<RowOf<'drive_roots'>>;
  readonly drive_albums: TableRule<RowOf<'drive_albums'>>;
  readonly drive_grants: TableRule<RowOf<'drive_grants'>>;
  readonly drive_placements: TableRule<RowOf<'drive_placements'>>;
}

export const DRIVE_TABLE_RULES: DriveTableRules = {
  drive_roots: {
    idOf: (row) => row.id,
    order: (left, right) =>
      SCOPE_RANK[left.scope] - SCOPE_RANK[right.scope] ||
      compareText(left.ownerProfileId ?? '', right.ownerProfileId ?? ''),
    keep: ALL,
  },
  drive_albums: {
    idOf: (row) => row.id,
    order: (left, right) => compareText(left.title, right.title),
    keep: ALL,
  },
  drive_grants: {
    idOf: (row) => row.id,
    order: (left, right) => compareText(right.createdAt, left.createdAt),
    keep: ALL,
  },
  drive_placements: {
    idOf: (row) => row.id,
    order: (left, right) => compareText(left.localPath, right.localPath),
    keep: ALL,
  },
};

export function driveTablesOf(
  tables: { readonly [K in keyof DriveTables]?: readonly RowOf<K>[] | undefined },
  next: NextTable,
): DriveTables {
  return {
    drive_roots: next('drive_roots', tables.drive_roots ?? []),
    drive_albums: next('drive_albums', tables.drive_albums ?? []),
    drive_grants: next('drive_grants', tables.drive_grants ?? []),
    drive_placements: next('drive_placements', tables.drive_placements ?? []),
  };
}
