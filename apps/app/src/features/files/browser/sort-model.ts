import { compareText, naturalCompare } from '../../../format/text';
import type { FileAbilities } from '../source/abilities';
import type { FileNode, FileSortOrder, SortDirection, SortField } from '../source/types';

export const DEFAULT_SORT: FileSortOrder = { field: 'name', direction: 'asc' };

export type ByName = (profileId: string | null) => string | null;

const SORT_LABEL: Readonly<Record<SortField, readonly [string, string]>> = {
  name: ['Name, A to Z', 'Name, Z to A'],
  by: ['By, A to Z', 'By, Z to A'],
  size: ['Size, smallest first', 'Size, largest first'],
  modifiedAt: ['Modified, oldest first', 'Modified, newest first'],
};

export const COLUMN_LABEL: Readonly<Record<SortField, string>> = {
  name: 'Name',
  by: 'By',
  size: 'Size',
  modifiedAt: 'Modified',
};

const FIRST_DIRECTION: Readonly<Record<SortField, SortDirection>> = {
  name: 'asc',
  by: 'asc',
  size: 'desc',
  modifiedAt: 'desc',
};

export interface SortOption {
  readonly value: string;
  readonly label: string;
}

export function sortValueOf(sort: FileSortOrder): string {
  return `${sort.field}:${sort.direction}`;
}

export function sortOptionsOf(fields: readonly SortField[]): readonly SortOption[] {
  return fields.flatMap((field) =>
    (['asc', 'desc'] as const).map((direction) => ({
      value: sortValueOf({ field, direction }),
      label: SORT_LABEL[field][direction === 'asc' ? 0 : 1],
    })),
  );
}

export function sortOfValue(value: string, fields: readonly SortField[]): FileSortOrder | null {
  const [field, direction] = value.split(':');
  const known = fields.find((candidate) => candidate === field);
  if (known === undefined || (direction !== 'asc' && direction !== 'desc')) return null;
  return { field: known, direction };
}

export function sortLabelOf(sort: FileSortOrder): string {
  return SORT_LABEL[sort.field][sort.direction === 'asc' ? 0 : 1];
}

export function columnSort(current: FileSortOrder, field: SortField): FileSortOrder {
  if (current.field !== field) return { field, direction: FIRST_DIRECTION[field] };
  return { field, direction: current.direction === 'asc' ? 'desc' : 'asc' };
}

export function sortWithin(sort: FileSortOrder, abilities: FileAbilities): FileSortOrder {
  return abilities.sort.includes(sort.field) ? sort : DEFAULT_SORT;
}

function timeOf(node: FileNode): number {
  return node.modifiedAt === null ? 0 : Date.parse(node.modifiedAt);
}

function fieldCompare(
  sort: FileSortOrder,
  byName: ByName,
  left: FileNode,
  right: FileNode,
): number {
  switch (sort.field) {
    case 'name':
      return naturalCompare(left.name, right.name);
    case 'by':
      return compareText(byName(left.byProfileId) ?? '', byName(right.byProfileId) ?? '');
    case 'size':
      return (left.size ?? 0) - (right.size ?? 0);
    case 'modifiedAt':
      return timeOf(left) - timeOf(right);
  }
}

export function sortNodes<O>(
  nodes: readonly FileNode<O>[],
  sort: FileSortOrder,
  byName: ByName,
): readonly FileNode<O>[] {
  const sign = sort.direction === 'asc' ? 1 : -1;
  return [...nodes].sort((left, right) => {
    const folders = Number(right.kind === 'folder') - Number(left.kind === 'folder');
    if (folders !== 0) return folders;
    const field = sign * fieldCompare(sort, byName, left, right);
    if (field !== 0) return field;
    return naturalCompare(left.name, right.name) || compareText(left.key, right.key);
  });
}
