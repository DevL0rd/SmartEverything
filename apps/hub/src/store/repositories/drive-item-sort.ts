import type { DriveSort } from '@smarteverything/domain';
import { z } from 'zod';
import { found, type StoreContext } from '../context';
import type { SqlParameters } from '../sql';
import type { DriveItemEntry } from './drive-items';
import { openedAtBy } from './drive-opens';

export interface DriveChildrenMark {
  readonly key: string | number;
  readonly name: string;
  readonly id: string;
}

export interface DriveSortedChildrenQuery {
  readonly rootId: string;
  readonly parentId: string | null;
  readonly sort: DriveSort;
  readonly after: DriveChildrenMark | null;
  readonly limit: number;
  readonly viewer: string | null;
}

export interface DriveSortedWindow {
  readonly entries: readonly DriveItemEntry[];
  readonly next: DriveChildrenMark | null;
}

const SORT_KEY: Readonly<Record<DriveSort['field'], string>> = {
  name: 'i.name',
  bytes: 'i.bytes',
  modifiedAt: 'i.modified_at',
  addedAt: 'i.added_at',
  takenAt: "coalesce(i.taken_at, '')",
  openedAt: `coalesce(${openedAtBy('$viewer')}, '')`,
};

const SORT_KEY_ROW = z.strictObject({ k: z.union([z.string(), z.number()]) });

export interface DriveSortOrder {
  readonly where: string;
  readonly orderBy: string;
  readonly parameters: SqlParameters;
}

export function sortOrderOf(sort: DriveSort, after: DriveChildrenMark | null): DriveSortOrder {
  const key = SORT_KEY[sort.field];
  const order = sort.direction === 'asc' ? 'asc' : 'desc';
  const past = sort.direction === 'asc' ? '>' : '<';
  return {
    where: after === null ? '' : `and (${key}, i.name, i.id) ${past} ($key, $name, $id)`,
    orderBy: `order by ${key} ${order}, i.name ${order}, i.id ${order}`,
    parameters: after === null ? {} : { key: after.key, name: after.name, id: after.id },
  };
}

export function nextMarkOf(
  context: StoreContext,
  query: DriveSortedChildrenQuery,
  entries: readonly DriveItemEntry[],
): DriveChildrenMark | null {
  const last = entries.at(-1)?.item;
  if (entries.length < query.limit || last === undefined) {
    return null;
  }
  const { sort, viewer } = query;
  const row = context.sql.get(
    SORT_KEY_ROW,
    `select ${SORT_KEY[sort.field]} as k from drive_items i where i.id = $id`,
    sort.field === 'openedAt' ? { id: last.id, viewer } : { id: last.id },
  );
  return { key: found(row, 'drive item', last.id).k, name: last.name, id: last.id };
}
