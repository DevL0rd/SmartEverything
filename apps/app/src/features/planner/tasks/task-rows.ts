import type { PlannerCollectionRow, PlannerItemRow } from '@smarteverything/domain';
import { compareText } from '../../../format/text';
import type { StepView } from '../item/item-steps';
import {
  byTaskOrder,
  matchesFilter,
  type AssignedSide,
  type TaskEntry,
  type TaskFilter,
} from './task-grouping';

function byLatest(left: TaskEntry, right: TaskEntry): number {
  return Date.parse(right.item.updated_at) - Date.parse(left.item.updated_at);
}

export interface TaskGroup {
  readonly key: string;
  readonly collection: PlannerCollectionRow | null;
  readonly title: string;
  readonly entries: readonly TaskEntry[];
}

export interface GroupInput {
  readonly entries: readonly TaskEntry[];
  readonly filter: TaskFilter;
  readonly collections: readonly PlannerCollectionRow[];
  readonly today: string;
}

export const ASSIGNED_TITLE: Readonly<Record<AssignedSide, string>> = {
  to_me: 'Assigned to me',
  by_me: 'Assigned by me',
};

const SIDES: readonly AssignedSide[] = ['to_me', 'by_me'];

function groupOrder(collections: readonly PlannerCollectionRow[]): ReadonlyMap<string, number> {
  return new Map(
    [...collections]
      .sort((left, right) => left.position - right.position)
      .map((row, index) => [row.id, index]),
  );
}

function assignedGroupsOf(shown: readonly TaskEntry[]): readonly TaskGroup[] {
  return SIDES.flatMap((side) => {
    const members = shown.filter((entry) => entry.assigned === side);
    if (members.length === 0) return [];
    return [
      {
        key: `assigned:${side}`,
        collection: null,
        title: ASSIGNED_TITLE[side],
        entries: [...members].sort(byTaskOrder),
      },
    ];
  });
}

function groupKeyOf(entry: TaskEntry, known: ReadonlyMap<string, unknown>): string {
  if (!known.has(entry.item.collection_id) && entry.assigned === 'to_me') return 'assigned:to_me';
  return entry.item.collection_id;
}

function titleOf(key: string, collection: PlannerCollectionRow | undefined): string {
  if (collection !== undefined) return collection.name;
  return key === 'assigned:to_me' ? ASSIGNED_TITLE.to_me : 'No list';
}

export function taskGroupsOf({
  entries,
  filter,
  collections,
  today,
}: GroupInput): readonly TaskGroup[] {
  const shown = entries.filter((entry) => matchesFilter(entry, filter, today));
  if (filter.kind === 'smart' && filter.list === 'assigned') return assignedGroupsOf(shown);
  const order = groupOrder(collections);
  const byId = new Map(collections.map((row) => [row.id, row]));
  const grouped = new Map<string, TaskEntry[]>();
  for (const entry of shown) {
    const key = groupKeyOf(entry, byId);
    const members = grouped.get(key) ?? [];
    members.push(entry);
    grouped.set(key, members);
  }
  const sorter = filter.kind === 'smart' && filter.list === 'completed' ? byLatest : byTaskOrder;
  return [...grouped]
    .sort(
      ([left], [right]) =>
        (order.get(left) ?? order.size) - (order.get(right) ?? order.size) ||
        compareText(left, right),
    )
    .map(([key, members]) => ({
      key,
      collection: byId.get(key) ?? null,
      title: titleOf(key, byId.get(key)),
      entries: members.sort(sorter),
    }));
}

export type RowEdge = 'only' | 'first' | 'middle' | 'last';

export type TaskListRow =
  | { readonly kind: 'head'; readonly key: string; readonly group: TaskGroup }
  | {
      readonly kind: 'task';
      readonly key: string;
      readonly entry: TaskEntry;
      readonly above: PlannerItemRow | null;
      readonly expanded: boolean;
      readonly edge: RowEdge;
    }
  | {
      readonly kind: 'step';
      readonly key: string;
      readonly parent: TaskEntry;
      readonly step: StepView;
      readonly edge: RowEdge;
    };

function edgeOf(index: number, length: number): RowEdge {
  if (length === 1) return 'only';
  if (index === 0) return 'first';
  return index === length - 1 ? 'last' : 'middle';
}

type Unplaced =
  | Omit<Extract<TaskListRow, { kind: 'task' }>, 'edge'>
  | Omit<Extract<TaskListRow, { kind: 'step' }>, 'edge'>;

function groupRowsOf(group: TaskGroup, expanded: ReadonlySet<string>): readonly Unplaced[] {
  return group.entries.flatMap((entry, index): Unplaced[] => {
    const open = expanded.has(entry.item.id) && entry.children.length > 0;
    const task: Unplaced = {
      kind: 'task',
      key: `task:${entry.item.id}`,
      entry,
      above: index === 0 ? null : (group.entries[index - 1]?.item ?? null),
      expanded: open,
    };
    if (!open) return [task];
    return [
      task,
      ...entry.children.map((step) => ({
        kind: 'step' as const,
        key: `step:${step.item.id}`,
        parent: entry,
        step,
      })),
    ];
  });
}

export function taskListRowsOf(
  groups: readonly TaskGroup[],
  expanded: ReadonlySet<string> = new Set(),
): readonly TaskListRow[] {
  return groups.flatMap((group): TaskListRow[] => {
    const rows = groupRowsOf(group, expanded);
    return [
      { kind: 'head', key: `head:${group.key}`, group },
      ...rows.map((row, index): TaskListRow => ({ ...row, edge: edgeOf(index, rows.length) })),
    ];
  });
}
