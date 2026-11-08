import type { PlannerCollectionRow, PlannerItemRow } from '@smarteverything/domain';
import { compareText } from '../../../format/text';
import {
  byTaskOrder,
  matchesFilter,
  userListsOf,
  type TaskEntry,
  type TaskFilter,
} from './task-grouping';

export type BoardGrouping = 'list' | 'status';

export type BoardStatus = 'overdue' | 'today' | 'upcoming' | 'undated' | 'done';

export interface BoardColumnModel {
  readonly key: string;
  readonly title: string;
  readonly collection: PlannerCollectionRow | null;
  readonly status: BoardStatus | null;
  readonly entries: readonly TaskEntry[];
}

export interface BoardInput {
  readonly entries: readonly TaskEntry[];
  readonly filter: TaskFilter;
  readonly collections: readonly PlannerCollectionRow[];
  readonly today: string;
  readonly grouping: BoardGrouping;
}

export const BOARD_GROUPING_LABEL: Readonly<Record<BoardGrouping, string>> = {
  list: 'By list',
  status: 'By status',
};

export const BOARD_STATUS_TITLE: Readonly<Record<BoardStatus, string>> = {
  overdue: 'Overdue',
  today: 'Today',
  upcoming: 'Upcoming',
  undated: 'No date',
  done: 'Done',
};

const OPEN_STATUSES: readonly BoardStatus[] = ['overdue', 'today', 'upcoming', 'undated'];

export function boardStatusOf(entry: TaskEntry, today: string): BoardStatus {
  if (entry.done) return 'done';
  if (entry.dueDay === null) return 'undated';
  if (entry.dueDay < today) return 'overdue';
  return entry.dueDay === today ? 'today' : 'upcoming';
}

export function byBoardOrder(left: TaskEntry, right: TaskEntry): number {
  return left.item.position - right.item.position || compareText(left.item.id, right.item.id);
}

function groupedBy(
  entries: readonly TaskEntry[],
  keyOf: (entry: TaskEntry) => string,
): ReadonlyMap<string, readonly TaskEntry[]> {
  const grouped = new Map<string, TaskEntry[]>();
  for (const entry of entries) {
    const key = keyOf(entry);
    const members = grouped.get(key) ?? [];
    members.push(entry);
    grouped.set(key, members);
  }
  return grouped;
}

function sortedEntries(entries: readonly TaskEntry[] | undefined): readonly TaskEntry[] {
  return [...(entries ?? [])].sort(byBoardOrder);
}

function listIdsOf(
  filter: TaskFilter,
  collections: readonly PlannerCollectionRow[],
  filled: ReadonlyMap<string, readonly TaskEntry[]>,
): readonly string[] {
  const ids = new Set(filled.keys());
  const keepEmpty = filter.kind === 'list' || filter.list === 'all';
  if (!keepEmpty) return [...ids];
  for (const row of userListsOf(collections)) {
    if (filter.kind === 'smart' || row.id === filter.id) ids.add(row.id);
  }
  return [...ids];
}

function rankOf(column: BoardColumnModel): number {
  return column.collection === null ? Number.POSITIVE_INFINITY : column.collection.position;
}

function byColumnOrder(left: BoardColumnModel, right: BoardColumnModel): number {
  return rankOf(left) - rankOf(right) || compareText(left.key, right.key);
}

function listColumnsOf(
  shown: readonly TaskEntry[],
  input: BoardInput,
): readonly BoardColumnModel[] {
  const filled = groupedBy(shown, (entry) => entry.item.collection_id);
  const byId = new Map(input.collections.map((row) => [row.id, row]));
  return listIdsOf(input.filter, input.collections, filled)
    .map((id) => {
      const collection = byId.get(id) ?? null;
      return {
        key: `list:${id}`,
        title: collection?.name ?? 'No list',
        collection,
        status: null,
        entries: sortedEntries(filled.get(id)),
      };
    })
    .sort(byColumnOrder);
}

function statusColumnsOf(shown: readonly TaskEntry[], today: string): readonly BoardColumnModel[] {
  const filled = groupedBy(shown, (entry) => boardStatusOf(entry, today));
  const statuses = filled.has('done') ? [...OPEN_STATUSES, 'done' as const] : OPEN_STATUSES;
  return statuses.map((status) => ({
    key: `status:${status}`,
    title: BOARD_STATUS_TITLE[status],
    collection: null,
    status,
    entries: sortedEntries(filled.get(status)),
  }));
}

export function boardColumnsOf(input: BoardInput): readonly BoardColumnModel[] {
  const shown = input.entries.filter((entry) => matchesFilter(entry, input.filter, input.today));
  return input.grouping === 'list'
    ? listColumnsOf(shown, input)
    : statusColumnsOf(shown, input.today);
}

export interface BoardMove {
  readonly item: PlannerItemRow;
  readonly position: number;
}

function movedKeyOf(before: readonly string[], after: readonly string[]): string | null {
  for (const [index, key] of after.entries()) {
    if (before[index] === key) continue;
    const rest = after.filter((other) => other !== key).join('\n');
    if (before.filter((other) => other !== key).join('\n') === rest) return key;
  }
  return null;
}

function renumbered(ordered: readonly TaskEntry[]): readonly BoardMove[] {
  return ordered.flatMap((entry, index) =>
    entry.item.position === index ? [] : [{ item: entry.item, position: index }],
  );
}

function between(previous: TaskEntry | undefined, following: TaskEntry | undefined): number | null {
  if (previous === undefined) return following === undefined ? null : following.item.position - 1;
  if (following === undefined) return previous.item.position + 1;
  if (previous.item.position >= following.item.position) return null;
  return (previous.item.position + following.item.position) / 2;
}

export function boardMovesOf(
  entries: readonly TaskEntry[],
  keys: readonly string[],
): readonly BoardMove[] {
  const byId = new Map(entries.map((entry) => [entry.item.id, entry]));
  const ordered = keys.flatMap((key) => {
    const entry = byId.get(key);
    return entry === undefined ? [] : [entry];
  });
  const before = entries.map((entry) => entry.item.id);
  const after = ordered.map((entry) => entry.item.id);
  if (before.join('\n') === after.join('\n')) return [];
  const moved = movedKeyOf(before, after);
  if (moved === null) return renumbered(ordered);
  const at = ordered.findIndex((entry) => entry.item.id === moved);
  const entry = ordered[at];
  const position = between(ordered[at - 1], ordered[at + 1]);
  if (entry === undefined || position === null) return renumbered(ordered);
  return [{ item: entry.item, position }];
}

export type QuadrantKey = 'now' | 'plan' | 'fast' | 'later';

export interface QuadrantModel {
  readonly key: QuadrantKey;
  readonly title: string;
  readonly hint: string;
  readonly entries: readonly TaskEntry[];
}

const QUADRANTS: readonly Omit<QuadrantModel, 'entries'>[] = [
  { key: 'now', title: 'Do now', hint: 'Urgent and important' },
  { key: 'plan', title: 'Plan', hint: 'Important, not urgent' },
  { key: 'fast', title: 'Do fast', hint: 'Urgent, not important' },
  { key: 'later', title: 'Later', hint: 'Not urgent, not important' },
];

export function isUrgent(entry: TaskEntry, today: string): boolean {
  return entry.dueDay !== null && entry.dueDay <= today;
}

export function isImportant(entry: TaskEntry): boolean {
  return entry.item.priority !== null;
}

export function quadrantOf(entry: TaskEntry, today: string): QuadrantKey {
  const urgent = isUrgent(entry, today);
  if (isImportant(entry)) return urgent ? 'now' : 'plan';
  return urgent ? 'fast' : 'later';
}

export interface MatrixInput {
  readonly entries: readonly TaskEntry[];
  readonly filter: TaskFilter;
  readonly today: string;
}

export function matrixOf({ entries, filter, today }: MatrixInput): readonly QuadrantModel[] {
  const shown = entries.filter((entry) => entry.open && matchesFilter(entry, filter, today));
  const filled = groupedBy(shown, (entry) => quadrantOf(entry, today));
  return QUADRANTS.map((quadrant) => ({
    ...quadrant,
    entries: [...(filled.get(quadrant.key) ?? [])].sort(byTaskOrder),
  }));
}
