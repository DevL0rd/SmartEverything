import { compareText } from '../format/text';
import type { NextTable, RowOf, Tables } from './state';
import type { TableRule } from './table-rules';

const ALL = Number.MAX_SAFE_INTEGER;

const SCOPE_RANK = { person: 0, home: 1 } as const;

type DriveTables = Pick<
  Tables,
  | 'drive_roots'
  | 'drive_albums'
  | 'drive_grants'
  | 'drive_placements'
  | 'drive_notifications'
  | 'drive_access_requests'
  | 'drive_file_requests'
  | 'drive_transfers'
  | 'drive_offline_items'
>;

export interface DriveTableRules {
  readonly drive_roots: TableRule<RowOf<'drive_roots'>>;
  readonly drive_albums: TableRule<RowOf<'drive_albums'>>;
  readonly drive_grants: TableRule<RowOf<'drive_grants'>>;
  readonly drive_placements: TableRule<RowOf<'drive_placements'>>;
  readonly drive_notifications: TableRule<RowOf<'drive_notifications'>>;
  readonly drive_access_requests: TableRule<RowOf<'drive_access_requests'>>;
  readonly drive_file_requests: TableRule<RowOf<'drive_file_requests'>>;
  readonly drive_transfers: TableRule<RowOf<'drive_transfers'>>;
  readonly drive_offline_items: TableRule<RowOf<'drive_offline_items'>>;
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
    order: (left, right) =>
      compareText(left.localPath ?? left.mountName ?? '', right.localPath ?? right.mountName ?? ''),
    keep: ALL,
  },
  drive_notifications: {
    idOf: (row) => row.id,
    order: (left, right) => compareText(right.updatedAt, left.updatedAt),
    keep: ALL,
  },
  drive_access_requests: {
    idOf: (row) => row.id,
    order: (left, right) => compareText(right.createdAt, left.createdAt),
    keep: ALL,
  },
  drive_file_requests: {
    idOf: (row) => row.id,
    order: (left, right) => compareText(right.createdAt, left.createdAt),
    keep: ALL,
  },
  drive_transfers: {
    idOf: (row) => row.id,
    order: (left, right) => compareText(right.createdAt, left.createdAt),
    keep: ALL,
  },
  drive_offline_items: {
    idOf: (row) => `${row.clientId}:${row.itemId}`,
    order: (left, right) =>
      compareText(left.clientId, right.clientId) || compareText(left.itemId, right.itemId),
    keep: ALL,
  },
};

type SnapshotDriveTables = {
  readonly [K in Exclude<keyof DriveTables, 'drive_placements'>]?: readonly RowOf<K>[] | undefined;
} & { readonly drive_placements: readonly RowOf<'drive_placements'>[] };

export function driveTablesOf(tables: SnapshotDriveTables, next: NextTable): DriveTables {
  return {
    drive_roots: next('drive_roots', tables.drive_roots ?? []),
    drive_albums: next('drive_albums', tables.drive_albums ?? []),
    drive_grants: next('drive_grants', tables.drive_grants ?? []),
    drive_placements: next('drive_placements', tables.drive_placements),
    drive_notifications: next('drive_notifications', tables.drive_notifications ?? []),
    drive_access_requests: next('drive_access_requests', tables.drive_access_requests ?? []),
    drive_file_requests: next('drive_file_requests', tables.drive_file_requests ?? []),
    drive_transfers: next('drive_transfers', tables.drive_transfers ?? []),
    drive_offline_items: next('drive_offline_items', tables.drive_offline_items ?? []),
  };
}
