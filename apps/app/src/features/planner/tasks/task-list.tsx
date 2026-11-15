import { memo, useState, type ReactElement, type ReactNode } from 'react';
import { View } from 'react-native';
import { Badge } from '../../../components/badge';
import { DoneMark } from '../../../components/done-mark';
import { EmptyState } from '../../../components/empty-state';
import { Text } from '../../../components/text';
import { VirtualList } from '../../../components/virtual-list';
import { cn } from '../../../design/cn';
import { usePlannerCollections } from '../data';
import { usePlannerFrame } from '../frame/frame-context';
import { LIST_DOT } from '../item/composer-tokens';
import { ListTrend } from './list-trend';
import { smartCountOf, type SmartChoice, type TaskEntry, type TaskFilter } from './task-grouping';
import { TaskRow } from './task-row';
import { taskGroupsOf, taskListRowsOf, type TaskGroup, type TaskListRow } from './task-rows';
import { TaskStepRow } from './task-step-row';

function ListDot({ group }: { readonly group: TaskGroup }): ReactNode {
  return (
    <View
      className={cn(
        'size-2 rounded-full',
        group.collection === null ? 'bg-on-surface-faint' : LIST_DOT[group.collection.colour],
      )}
    />
  );
}

const GroupHead = memo(function GroupHead({ group }: { readonly group: TaskGroup }): ReactNode {
  const name = group.title;
  return (
    <View className="flex-row items-center gap-2 pb-1 pt-4">
      <ListDot group={group} />
      <Text variant="label" accessibilityRole="header" numberOfLines={1} className="min-w-0 flex-1">
        {name}
      </Text>
      {group.collection?.source === 'google' ? <Badge label="Google" /> : null}
      {group.collection === null ? null : (
        <ListTrend collectionId={group.collection.id} name={name} />
      )}
      <Text variant="caption" tone="variant" className="tabular">
        {String(group.entries.length)}
      </Text>
    </View>
  );
});

function sameSteps(left: TaskEntry, right: TaskEntry): boolean {
  return (
    left.children.length === right.children.length &&
    left.children.every((step, index) => {
      const other = right.children[index];
      return step.item === other?.item && step.done === other.done;
    })
  );
}

function sameEntry(left: TaskEntry, right: TaskEntry): boolean {
  return (
    left.item === right.item &&
    left.occurrenceKey === right.occurrenceKey &&
    left.dueDay === right.dueDay &&
    left.dueAt === right.dueAt &&
    left.open === right.open &&
    left.done === right.done &&
    left.assigned === right.assigned &&
    sameSteps(left, right)
  );
}

type RowOf<K extends TaskListRow['kind']> = Extract<TaskListRow, { kind: K }>;

function sameHead(left: RowOf<'head'>, right: RowOf<'head'>): boolean {
  return (
    left.group.collection === right.group.collection &&
    left.group.title === right.group.title &&
    left.group.entries.length === right.group.entries.length
  );
}

function sameTask(left: RowOf<'task'>, right: RowOf<'task'>): boolean {
  return (
    left.edge === right.edge &&
    left.above === right.above &&
    left.expanded === right.expanded &&
    sameEntry(left.entry, right.entry)
  );
}

function sameStep(left: RowOf<'step'>, right: RowOf<'step'>): boolean {
  return (
    left.edge === right.edge &&
    left.step.item === right.step.item &&
    left.step.done === right.step.done
  );
}

export function sameTaskListRow(left: TaskListRow, right: TaskListRow): boolean {
  if (left.kind === 'head' && right.kind === 'head') return sameHead(left, right);
  if (left.kind === 'task' && right.kind === 'task') return sameTask(left, right);
  if (left.kind === 'step' && right.kind === 'step') return sameStep(left, right);
  return false;
}

const EMPTY_COPY: Readonly<Record<SmartChoice, { readonly title: string; readonly body: string }>> =
  {
    today: { title: 'Nothing due today', body: 'Tasks due today show up here.' },
    upcoming: { title: 'Nothing coming up', body: 'Tasks with a later due date show up here.' },
    overdue: { title: 'Nothing overdue', body: 'Tasks past their due date show up here.' },
    device_tasks: {
      title: 'No device tasks',
      body: 'Tasks a device checks off, like a toothbrush or the treadmill, show up here.',
    },
    habits: { title: 'No habits yet', body: 'Tasks that repeat show up here with their streak.' },
    someday: { title: 'Nothing for someday', body: 'Tasks without a date show up here.' },
    assigned: {
      title: 'Nothing assigned',
      body: 'Tasks you give to someone in the home, and tasks they give you, show up here.',
    },
    completed: { title: 'Nothing done yet', body: 'Tasks you finish show up here.' },
    all: {
      title: 'No open tasks',
      body: 'Tasks you add here, from chat or from Google show up here.',
    },
  };

function AllDone(): ReactNode {
  return (
    <View className="items-center gap-3 px-gutter py-10">
      <DoneMark />
      <Text variant="title-3">All done</Text>
      <Text variant="callout" tone="variant" align="center">
        Every open task is finished. New ones show up here.
      </Text>
    </View>
  );
}

function TaskListEmpty({ entries, today, filter }: TaskListProps): ReactElement {
  if (filter.kind === 'list') {
    return (
      <EmptyState
        icon="listCheck"
        title="Nothing open in this list"
        body="Add a task to it from the bar below."
      />
    );
  }
  const anyDone = smartCountOf(entries, 'completed', today) > 0;
  if (anyDone && smartCountOf(entries, 'all', today) === 0 && filter.list !== 'completed') {
    return <AllDone />;
  }
  const copy = EMPTY_COPY[filter.list];
  return <EmptyState icon="circleCheck" title={copy.title} body={copy.body} />;
}

export interface TaskListProps {
  readonly entries: readonly TaskEntry[];
  readonly today: string;
  readonly filter: TaskFilter;
  readonly header?: ReactElement;
}

export function toggledKey(keys: ReadonlySet<string>, key: string): ReadonlySet<string> {
  const next = new Set(keys);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  return next;
}

function keyOf(row: TaskListRow): string {
  return row.key;
}

function typeOf(row: TaskListRow): string {
  return row.kind;
}

export function TaskList(props: TaskListProps): ReactNode {
  const { entries, today, filter, header } = props;
  const { person } = usePlannerFrame();
  const collections = usePlannerCollections(person);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const toggle = (itemId: string): void => {
    setExpanded((current) => toggledKey(current, itemId));
  };
  const rows = taskListRowsOf(taskGroupsOf({ entries, filter, collections, today }), expanded);
  const renderItem = (row: TaskListRow): ReactElement => {
    if (row.kind === 'head') return <GroupHead group={row.group} />;
    if (row.kind === 'step') return <TaskStepRow step={row.step} edge={row.edge} />;
    return (
      <TaskRow
        entry={row.entry}
        edge={row.edge}
        today={today}
        above={row.above}
        expanded={row.expanded}
        onExpand={toggle}
      />
    );
  };
  return (
    <View className="-mx-gutter min-h-0 flex-1">
      <VirtualList
        sections={rows.length === 0 ? [] : [{ key: 'tasks', title: null, data: rows }]}
        keyOf={keyOf}
        typeOf={typeOf}
        renderItem={renderItem}
        sameItem={sameTaskListRow}
        {...(header === undefined ? {} : { header })}
        empty={<TaskListEmpty {...props} />}
        probe="planner-task-list"
      />
    </View>
  );
}
