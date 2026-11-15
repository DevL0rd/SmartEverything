import {
  PLANNER_OCCURRENCE_SINGLE,
  PLANNER_SMART_LISTS,
  type PlannerCollectionRow,
  type PlannerDay,
  type PlannerItemRow,
  type PlannerOccurrenceRow,
  type PlannerStats,
} from '@smarteverything/domain';
import type { ChartPoint } from '../../../components/charts';
import type { IconName } from '../../../components/icon';
import {
  clock,
  daysBetween,
  localDayKey,
  shiftDay,
  shortDate,
  startOfDayKey,
  weekdayShort,
} from '../../../format/time';
import { compareText } from '../../../format/text';
import type { StepView } from '../item/item-steps';

export type SmartList = (typeof PLANNER_SMART_LISTS)[number];

export type SmartChoice = SmartList | 'all';

export type TaskFilter =
  | { readonly kind: 'smart'; readonly list: SmartChoice }
  | { readonly kind: 'list'; readonly id: string };

export const ALL_OPEN: TaskFilter = { kind: 'smart', list: 'all' };

export interface TaskSteps {
  readonly done: number;
  readonly total: number;
}

export type AssignedSide = 'to_me' | 'by_me';

export interface TaskEntry {
  readonly item: PlannerItemRow;
  readonly assigned: AssignedSide | null;
  readonly children: readonly StepView[];
  readonly occurrenceKey: string | null;
  readonly dueDay: string | null;
  readonly dueAt: string | null;
  readonly open: boolean;
  readonly done: boolean;
  readonly steps: TaskSteps | null;
}

export interface TaskInput {
  readonly items: readonly PlannerItemRow[];
  readonly occurrences: readonly PlannerOccurrenceRow[];
  readonly day: PlannerDay | undefined;
  readonly me?: string | null;
}

export interface SmartChip {
  readonly list: SmartChoice;
  readonly label: string;
  readonly icon?: IconName;
}

const SMART_CHIP: Readonly<Record<SmartChoice, SmartChip>> = {
  today: { list: 'today', label: 'Today' },
  upcoming: { list: 'upcoming', label: 'Upcoming' },
  overdue: { list: 'overdue', label: 'Overdue' },
  assigned: { list: 'assigned', label: 'Assigned', icon: 'users' },
  device_tasks: { list: 'device_tasks', label: 'Device tasks', icon: 'zap' },
  habits: { list: 'habits', label: 'Habits', icon: 'flame' },
  someday: { list: 'someday', label: 'Someday' },
  completed: { list: 'completed', label: 'Completed' },
  all: { list: 'all', label: 'All open' },
};

type Match = (entry: TaskEntry, today: string) => boolean;

const SMART_MATCH: Readonly<Record<SmartChoice, Match>> = {
  today: (entry, today) => entry.open && entry.dueDay === today,
  upcoming: (entry, today) => entry.open && entry.dueDay !== null && entry.dueDay > today,
  overdue: (entry, today) => entry.open && entry.dueDay !== null && entry.dueDay < today,
  assigned: (entry) => entry.open && entry.assigned !== null,
  device_tasks: (entry) => entry.open && entry.item.completion.kind === 'signal',
  habits: (entry) => entry.item.status === 'open' && entry.item.rrule !== null,
  someday: (entry) => entry.open && entry.dueDay === null && entry.item.rrule === null,
  completed: (entry) => entry.done,
  all: (entry) => entry.open,
};

function isTopTask(item: PlannerItemRow): boolean {
  return (
    item.kind === 'task' &&
    item.deleted_at === null &&
    item.parent_id === null &&
    (item.status === 'open' || item.status === 'done')
  );
}

function closedKeys(occurrences: readonly PlannerOccurrenceRow[]): ReadonlyMap<string, string> {
  return new Map(
    occurrences
      .filter((row) => row.status !== 'missed')
      .map((row) => [`${row.item_id}\n${row.occurrence_key}`, row.status]),
  );
}

export function todayKeysOf(day: PlannerDay | undefined): ReadonlyMap<string, string> {
  if (day === undefined) return new Map();
  const keys = new Map<string, string>();
  for (const view of [...day.missed, ...day.current, ...day.upcoming]) {
    if (view.kind !== 'task' || view.status !== 'open' || keys.has(view.item_id)) continue;
    keys.set(view.item_id, view.occurrence_key);
  }
  return keys;
}

function stepsByParent(
  items: readonly PlannerItemRow[],
  closed: ReadonlyMap<string, string>,
): ReadonlyMap<string, readonly StepView[]> {
  const steps = new Map<string, StepView[]>();
  for (const item of items) {
    if (item.parent_id === null || item.deleted_at !== null || item.kind !== 'task') continue;
    if (item.status === 'cancelled') continue;
    const done =
      item.status === 'done' || closed.get(`${item.id}\n${PLANNER_OCCURRENCE_SINGLE}`) === 'done';
    const list = steps.get(item.parent_id) ?? [];
    list.push({ item, done });
    steps.set(item.parent_id, list);
  }
  for (const list of steps.values()) {
    list.sort(
      (left, right) =>
        left.item.position - right.item.position ||
        compareText(left.item.created_at, right.item.created_at),
    );
  }
  return steps;
}

function countsOf(steps: readonly StepView[] | undefined): TaskSteps | null {
  if (steps === undefined || steps.length === 0) return null;
  return { done: steps.filter((step) => step.done).length, total: steps.length };
}

export function assignedSideOf(item: PlannerItemRow, me: string | null): AssignedSide | null {
  if (me === null || item.assignee_id === null || item.assignee_id === item.profile_id) return null;
  if (item.assignee_id === me) return 'to_me';
  return item.profile_id === me ? 'by_me' : null;
}

function momentKey(key: string): boolean {
  return key.includes('T');
}

type Timing = Pick<TaskEntry, 'occurrenceKey' | 'dueDay' | 'dueAt' | 'open' | 'done'>;

function recurringEntry(
  item: PlannerItemRow,
  key: string | undefined,
  closed: ReadonlyMap<string, string>,
): Timing {
  const open = item.status === 'open';
  if (key === undefined || closed.has(`${item.id}\n${key}`)) {
    return { occurrenceKey: null, dueDay: null, dueAt: null, open, done: false };
  }
  const at = momentKey(key) ? key : null;
  return {
    occurrenceKey: key,
    dueDay: at === null ? key : localDayKey(at),
    dueAt: at,
    open,
    done: false,
  };
}

function singleEntry(item: PlannerItemRow, closed: ReadonlyMap<string, string>): Timing {
  const status = closed.get(`${item.id}\n${PLANNER_OCCURRENCE_SINGLE}`);
  const done = item.status === 'done' || status === 'done';
  const dueDay = item.due_at === null ? item.due_date : localDayKey(item.due_at);
  return {
    occurrenceKey: PLANNER_OCCURRENCE_SINGLE,
    dueDay,
    dueAt: item.due_at,
    open: item.status === 'open' && status === undefined,
    done,
  };
}

const NO_STEPS: readonly StepView[] = [];

export function taskEntriesOf({
  items,
  occurrences,
  day,
  me = null,
}: TaskInput): readonly TaskEntry[] {
  const closed = closedKeys(occurrences);
  const steps = stepsByParent(items, closed);
  const todayKeys = todayKeysOf(day);
  return items.filter(isTopTask).map((item) => ({
    item,
    assigned: assignedSideOf(item, me),
    children: steps.get(item.id) ?? NO_STEPS,
    steps: countsOf(steps.get(item.id)),
    ...(item.rrule === null
      ? singleEntry(item, closed)
      : recurringEntry(item, todayKeys.get(item.id), closed)),
  }));
}

export function matchesFilter(entry: TaskEntry, filter: TaskFilter, today: string): boolean {
  if (filter.kind === 'smart') return SMART_MATCH[filter.list](entry, today);
  return entry.open && entry.item.collection_id === filter.id;
}

export function smartCountOf(
  entries: readonly TaskEntry[],
  list: SmartChoice,
  today: string,
): number {
  return entries.filter((entry) => SMART_MATCH[list](entry, today)).length;
}

export function listCountOf(entries: readonly TaskEntry[], collectionId: string): number {
  return entries.filter((entry) => entry.open && entry.item.collection_id === collectionId).length;
}

export function smartChipsOf(shown: readonly SmartList[]): readonly SmartChip[] {
  const chosen = new Set(shown);
  return [
    SMART_CHIP.all,
    ...PLANNER_SMART_LISTS.filter((list) => chosen.has(list)).map((list) => SMART_CHIP[list]),
  ];
}

export function userListsOf(
  collections: readonly PlannerCollectionRow[],
): readonly PlannerCollectionRow[] {
  return collections
    .filter((row) => row.kind === 'list')
    .sort((left, right) => left.position - right.position);
}

function byDue(left: TaskEntry, right: TaskEntry): number {
  const leftDue = left.dueAt ?? left.dueDay;
  const rightDue = right.dueAt ?? right.dueDay;
  if (leftDue === rightDue) return 0;
  if (leftDue === null) return 1;
  if (rightDue === null) return -1;
  const leftAt = left.dueAt === null ? startOfDayKey(leftDue) : Date.parse(leftDue);
  const rightAt = right.dueAt === null ? startOfDayKey(rightDue) : Date.parse(rightDue);
  return leftAt - rightAt;
}

const UNRANKED = 4;

function byPriority(left: TaskEntry, right: TaskEntry): number {
  return (left.item.priority ?? UNRANKED) - (right.item.priority ?? UNRANKED);
}

export function byTaskOrder(left: TaskEntry, right: TaskEntry): number {
  return byDue(left, right) || byPriority(left, right) || left.item.position - right.item.position;
}

const WEEK_AHEAD = 6;

function dayWordOf(day: string, today: string): string {
  if (day === today) return 'Today';
  if (day === shiftDay(today, 1)) return 'Tomorrow';
  if (day === shiftDay(today, -1)) return 'Yesterday';
  const ahead = -daysBetween(day, today);
  const start = startOfDayKey(day);
  return ahead > 0 && ahead <= WEEK_AHEAD ? weekdayShort(start) : shortDate(start);
}

export function dueLabelOf(
  entry: Pick<TaskEntry, 'dueDay' | 'dueAt' | 'item'>,
  today: string,
): string {
  if (entry.dueDay === null) return entry.item.rrule === null ? 'No date' : 'Not due today';
  const word = dayWordOf(entry.dueDay, today);
  return entry.dueAt === null ? word : `${word} ${clock(entry.dueAt)}`;
}

export function isOverdue(entry: TaskEntry, now: number, today: string): boolean {
  if (!entry.open || entry.dueDay === null) return false;
  return entry.dueAt === null ? entry.dueDay < today : Date.parse(entry.dueAt) < now;
}

export function stepsLabelOf(steps: TaskSteps | null): string | null {
  return steps === null ? null : `${String(steps.done)} of ${String(steps.total)}`;
}

export interface ListTrendModel {
  readonly points: readonly ChartPoint[];
  readonly weeks: number;
}

const WEEK_DAYS = 7;

export function listTrendOf(
  stats: PlannerStats | undefined,
  collectionId: string,
): ListTrendModel | null {
  const days = stats?.list_trends.find((trend) => trend.collection_id === collectionId)?.points;
  if (days === undefined) return null;
  const weeks: { done: number; due: number }[] = [];
  for (let end = days.length; end > 0; end -= WEEK_DAYS) {
    const week = days.slice(Math.max(0, end - WEEK_DAYS), end);
    weeks.unshift({
      done: week.reduce((sum, point) => sum + point.done, 0),
      due: week.reduce((sum, point) => sum + point.due, 0),
    });
  }
  const points = weeks.flatMap((week, index) =>
    week.due === 0 ? [] : [{ t: index, v: week.done / week.due }],
  );
  return points.length < 2 ? null : { points, weeks: weeks.length };
}
