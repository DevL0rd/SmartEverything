import type { ProcessRow, ProcessSort, ProcessWindow } from '@smarteverything/domain';

type Direction = ProcessWindow['order'];

export interface ProcessOrdering {
  readonly sort: ProcessSort;
  readonly order: Direction;
}

export const DEFAULT_ORDERING: ProcessOrdering = { sort: 'cpu', order: 'descending' };

export const PROCESS_SORT_OPTIONS: readonly {
  readonly value: ProcessSort;
  readonly label: string;
}[] = [
  { value: 'name', label: 'Name' },
  { value: 'cpu', label: 'CPU' },
  { value: 'memory', label: 'Memory' },
  { value: 'gpu', label: 'GPU' },
  { value: 'disk', label: 'Disk' },
  { value: 'threads', label: 'Threads' },
  { value: 'user', label: 'User' },
  { value: 'pid', label: 'Process number' },
];

export type ProcessFilter = 'all' | 'mine' | 'gpu' | 'disk';

export const PROCESS_FILTERS: readonly {
  readonly value: ProcessFilter;
  readonly label: string;
}[] = [
  { value: 'all', label: 'All' },
  { value: 'mine', label: 'Mine' },
  { value: 'gpu', label: 'Using GPU' },
  { value: 'disk', label: 'Busy disk' },
];

export const EVERY_PROCESS = 100_000;

const GPU_BUSY_PERCENT = 0.5;

export function sortLabel(sort: ProcessSort): string {
  return PROCESS_SORT_OPTIONS.find((option) => option.value === sort)?.label ?? sort;
}

export function defaultOrder(sort: ProcessSort): Direction {
  return sort === 'name' || sort === 'user' || sort === 'pid' ? 'ascending' : 'descending';
}

export function orderingAfter(current: ProcessOrdering, sort: ProcessSort): ProcessOrdering {
  if (current.sort !== sort) return { sort, order: defaultOrder(sort) };
  return { sort, order: current.order === 'descending' ? 'ascending' : 'descending' };
}

export function windowOf(
  ordering: ProcessOrdering,
  search: string,
  tree: boolean,
  gpu: boolean,
): ProcessWindow {
  const text = search.trim();
  return {
    sort: ordering.sort,
    order: ordering.order,
    ...(text === '' ? {} : { search: text }),
    tree: tree && text === '',
    gpu,
    offset: 0,
    limit: EVERY_PROCESS,
  };
}

export function passesFilter(filter: ProcessFilter, row: ProcessRow): boolean {
  if (filter === 'mine') return row.own;
  if (filter === 'gpu') return (row.gpu ?? 0) > GPU_BUSY_PERCENT;
  if (filter === 'disk') return row.diskRate > 0;
  return true;
}

function shortName(name: string): string {
  return name.length > 28 ? `${name.slice(0, 26)}…` : name;
}

export function endTitle(name: string): string {
  return `End ${shortName(name)}?`;
}

export function forceTitle(name: string): string {
  return `Force quit ${shortName(name)}?`;
}
