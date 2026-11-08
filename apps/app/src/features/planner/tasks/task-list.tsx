import { memo, type ReactElement, type ReactNode } from 'react';
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
import {
  smartCountOf,
  taskGroupsOf,
  taskListRowsOf,
  type SmartChoice,
  type TaskEntry,
  type TaskFilter,
  type TaskGroup,
  type TaskListRow,
} from './task-grouping';
import { TaskRow } from './task-row';

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
  const name = group.collection?.name ?? 'No list';
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
  return left.steps?.done === right.steps?.done && left.steps?.total === right.steps?.total;
}

function sameEntry(left: TaskEntry, right: TaskEntry): boolean {
  return (
    left.item === right.item &&
    left.occurrenceKey === right.occurrenceKey &&
    left.dueDay === right.dueDay &&
    left.dueAt === right.dueAt &&
    left.open === right.open &&
    left.done === right.done &&
    sameSteps(left, right)
  );
}

export function sameTaskListRow(left: TaskListRow, right: TaskListRow): boolean {
  if (left.kind === 'head' && right.kind === 'head') {
    return (
      left.group.collection === right.group.collection &&
      left.group.entries.length === right.group.entries.length
    );
  }
  if (left.kind === 'task' && right.kind === 'task') {
    return left.edge === right.edge && sameEntry(left.entry, right.entry);
  }
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
  const rows = taskListRowsOf(taskGroupsOf({ entries, filter, collections, today }));
  const renderItem = (row: TaskListRow): ReactElement =>
    row.kind === 'head' ? (
      <GroupHead group={row.group} />
    ) : (
      <TaskRow entry={row.entry} edge={row.edge} today={today} />
    );
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
