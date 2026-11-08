import { background } from '@smarteverything/logging';
import { memo, type ReactElement, type ReactNode } from 'react';
import { View, type ViewStyle } from 'react-native';
import { Badge } from '../../../components/badge';
import { Button } from '../../../components/button';
import { Icon, type IconName } from '../../../components/icon';
import { ReorderableList } from '../../../components/reorderable-list';
import { Text } from '../../../components/text';
import { notify } from '../../../components/toast-store';
import type { Tone } from '../../../components/tone';
import { cn } from '../../../design/cn';
import { usePlannerWrites } from '../data';
import { usePlannerFrame } from '../frame/frame-context';
import { LIST_DOT } from '../item/composer-tokens';
import { ListTrend } from './list-trend';
import { boardMovesOf, type BoardColumnModel, type BoardStatus } from './matrix-model';
import { TaskCard } from './task-card';
import type { TaskEntry } from './task-grouping';

const STATUS_MARK: Readonly<Record<BoardStatus, { readonly icon: IconName; readonly tone: Tone }>> =
  {
    overdue: { icon: 'alert', tone: 'critical' },
    today: { icon: 'sun', tone: 'primary' },
    upcoming: { icon: 'calendar', tone: 'variant' },
    undated: { icon: 'circle', tone: 'faint' },
    done: { icon: 'circleCheck', tone: 'positive' },
  };

const EMPTY_COPY: Readonly<Record<BoardStatus | 'list', string>> = {
  list: 'Nothing open in this list',
  overdue: 'Nothing overdue',
  today: 'Nothing due today',
  upcoming: 'Nothing coming up',
  undated: 'Nothing without a date',
  done: 'Nothing done yet',
};

function ColumnMark({ column }: { readonly column: BoardColumnModel }): ReactNode {
  if (column.status !== null) {
    const mark = STATUS_MARK[column.status];
    return <Icon name={mark.icon} size={16} tone={mark.tone} />;
  }
  return (
    <View
      className={cn(
        'size-2 rounded-full',
        column.collection === null ? 'bg-on-surface-faint' : LIST_DOT[column.collection.colour],
      )}
    />
  );
}

function ColumnHead({ column }: { readonly column: BoardColumnModel }): ReactNode {
  return (
    <View className="min-h-7 flex-row items-center gap-2 px-1">
      <ColumnMark column={column} />
      <Text variant="label" accessibilityRole="header" numberOfLines={1} className="min-w-0 flex-1">
        {column.title}
      </Text>
      {column.collection?.source === 'google' ? <Badge label="Google" /> : null}
      {column.collection === null ? null : (
        <ListTrend collectionId={column.collection.id} name={column.title} />
      )}
      <Text variant="caption" tone="variant" className="tabular">
        {String(column.entries.length)}
      </Text>
    </View>
  );
}

function useReorder(entries: readonly TaskEntry[]): (keys: readonly string[]) => void {
  const { person } = usePlannerFrame();
  const writes = usePlannerWrites(person);
  return (keys) => {
    for (const move of boardMovesOf(entries, keys)) {
      background(
        writes
          .updateItem(move.item, { changes: { position: move.position } })
          .catch((error: unknown) => {
            notify({ message: 'Couldn’t move that task', error, tone: 'critical' });
          }),
        'planner.board_reorder_failed',
      );
    }
  };
}

function keyOf(entry: TaskEntry): string {
  return entry.item.id;
}

function labelOf(entry: TaskEntry): string {
  return entry.item.title;
}

function StaticCards({
  entries,
  renderItem,
}: {
  readonly entries: readonly TaskEntry[];
  readonly renderItem: (entry: TaskEntry) => ReactElement;
}): ReactNode {
  return (
    <View className="overflow-hidden rounded-lg border-hairline border-outline-variant bg-surface-1 elevation-1">
      {entries.map((entry, index) => (
        <View key={keyOf(entry)}>
          {index === 0 ? null : <View className="ml-11 h-hairline bg-outline-variant" />}
          {renderItem(entry)}
        </View>
      ))}
    </View>
  );
}

function ColumnCards({
  column,
  today,
}: {
  readonly column: BoardColumnModel;
  readonly today: string;
}): ReactNode {
  const { offline } = usePlannerFrame();
  const onReorder = useReorder(column.entries);
  const renderItem = (entry: TaskEntry): ReactElement => <TaskCard entry={entry} today={today} />;
  if (column.entries.length === 0) {
    return (
      <View className="items-center rounded-lg border border-dashed border-outline-variant px-3 py-5">
        <Text variant="caption" tone="variant" align="center">
          {EMPTY_COPY[column.status ?? 'list']}
        </Text>
      </View>
    );
  }
  if (offline || column.entries.length === 1) {
    return <StaticCards entries={column.entries} renderItem={renderItem} />;
  }
  return (
    <ReorderableList
      items={column.entries}
      keyOf={keyOf}
      labelOf={labelOf}
      renderItem={renderItem}
      onReorder={onReorder}
    />
  );
}

function widthOf(width: number): ViewStyle {
  return { width };
}

export interface BoardColumnProps {
  readonly column: BoardColumnModel;
  readonly today: string;
  readonly width: number;
}

export const BoardColumn = memo(function BoardColumn({
  column,
  today,
  width,
}: BoardColumnProps): ReactNode {
  const { offline, focusQuickAdd } = usePlannerFrame();
  return (
    <View
      style={widthOf(width)}
      className="gap-2 rounded-xl border-hairline border-outline-variant bg-surface-1/55 p-2.5"
    >
      <ColumnHead column={column} />
      <ColumnCards column={column} today={today} />
      {column.status === 'done' ? null : (
        <View className="flex-row">
          <Button
            label="Add task"
            icon="plus"
            variant="text"
            disabled={offline}
            onPress={focusQuickAdd}
          />
        </View>
      )}
    </View>
  );
});
