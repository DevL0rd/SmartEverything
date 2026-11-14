import { background } from '@smarteverything/logging';
import { memo, type ReactNode } from 'react';
import { View } from 'react-native';
import { Icon } from '../../../components/icon';
import { Interactive } from '../../../components/interactive';
import { SwipeRow, type SwipeAction } from '../../../components/swipe-row';
import { Text } from '../../../components/text';
import { notify } from '../../../components/toast-store';
import { cn } from '../../../design/cn';
import { selectionTick } from '../../../platform/haptics';
import { useMinuteOf } from '../../../store/clock';
import { useRow } from '../../../store/selectors';
import { usePlannerWrites } from '../data';
import { usePlannerFrame } from '../frame/frame-context';
import { useItemPress } from '../item/item-menu-host';
import { PRIORITY_RING, PriorityFlag, priorityOf } from './priority-flag';
import { dueLabelOf, isOverdue, stepsLabelOf, type RowEdge, type TaskEntry } from './task-grouping';

export interface TaskRowProps {
  readonly entry: TaskEntry;
  readonly edge: RowEdge;
  readonly today: string;
}

interface ShownTask {
  readonly entry: TaskEntry;
  readonly today: string;
  readonly overdue: boolean;
}

const FRAME: Readonly<Record<RowEdge, string>> = {
  only: 'rounded-lg',
  first: 'rounded-t-lg border-b-0',
  middle: 'border-y-0',
  last: 'rounded-b-lg border-t-0',
};

interface TaskActions {
  readonly done: (() => void) | null;
  readonly skip: (() => void) | null;
}

function useTaskActions(entry: TaskEntry): TaskActions {
  const { person, offline } = usePlannerFrame();
  const writes = usePlannerWrites(person);
  const key = entry.occurrenceKey;
  if (offline || !entry.open || key === null) return { done: null, skip: null };
  const run = (failure: string, work: () => Promise<unknown>) => (): void => {
    background(
      work().catch((error: unknown) => {
        notify({ message: failure, error, tone: 'critical' });
      }),
      'planner.task_row_failed',
    );
  };
  return {
    done: run('Couldn’t mark that done', () =>
      writes.completeItem(entry.item.id, { occurrence_key: key }),
    ),
    skip: run('Couldn’t skip that', () => writes.skipItem(entry.item.id, key)),
  };
}

function swipeOf(
  label: string,
  icon: SwipeAction['icon'],
  tone: SwipeAction['tone'],
  onCommit: (() => void) | null,
): SwipeAction | undefined {
  return onCommit === null ? undefined : { label, icon, tone, onCommit };
}

function TaskCheck({
  entry,
  onDone,
}: {
  readonly entry: TaskEntry;
  readonly onDone: (() => void) | null;
}): ReactNode {
  const priority = priorityOf(entry.item.priority);
  return (
    <Interactive
      role="checkbox"
      checked={entry.done}
      label={`Done: ${entry.item.title}`}
      disabled={onDone === null}
      hitSlop={8}
      onPress={() => {
        selectionTick();
        onDone?.();
      }}
      className={cn('size-7 items-center justify-center rounded-sm', entry.done && 'opacity-100')}
      layerClassName="rounded-sm"
      focusInset
    >
      <View
        className={cn(
          'size-5 items-center justify-center rounded-xs border-2',
          entry.done && 'border-primary bg-primary',
          !entry.done &&
            (priority === null ? 'border-on-surface-variant' : PRIORITY_RING[priority]),
        )}
      >
        {entry.done ? <Icon name="check" size={16} tone="onPrimary" /> : null}
      </View>
    </Interactive>
  );
}

function DeviceName({ entry }: { readonly entry: TaskEntry }): ReactNode {
  const attached = entry.item.attachments.find((attachment) => attachment.kind === 'device');
  const device = useRow('devices', attached?.kind === 'device' ? attached.deviceId : null);
  if (device === null) return null;
  return (
    <View className="min-w-0 shrink flex-row items-center gap-1">
      <Icon name="zap" size={12} tone="variant" />
      <Text variant="caption" tone="variant" numberOfLines={1} className="shrink">
        {device.label}
      </Text>
    </View>
  );
}

function TaskMeta({ entry, today, overdue }: ShownTask): ReactNode {
  const steps = stepsLabelOf(entry.steps);
  return (
    <View className="min-w-0 flex-row items-center gap-2">
      <Text variant="caption" tone={overdue ? 'critical' : 'variant'} className="tabular">
        {dueLabelOf(entry, today)}
      </Text>
      <DeviceName entry={entry} />
      {steps === null ? null : (
        <Text variant="caption" tone="variant" className="tabular">
          {steps}
        </Text>
      )}
      {entry.item.google?.state === 'sending' ? (
        <View accessible accessibilityLabel="Sending to Google">
          <Icon name="refresh" size={12} tone="faint" />
        </View>
      ) : null}
    </View>
  );
}

function TaskBody(props: ShownTask): ReactNode {
  const { entry } = props;
  const priority = priorityOf(entry.item.priority);
  const press = useItemPress(entry.item.id, entry.occurrenceKey);
  return (
    <Interactive
      {...press.open}
      onLongPress={press.onLongPress}
      onContextMenu={press.onContextMenu}
      label={entry.item.title}
      className="min-w-0 flex-1 gap-0.5 rounded-sm py-0.5"
      layerClassName="rounded-sm"
    >
      {press.menu}
      <View className="min-w-0 flex-row items-center gap-2">
        <Text
          variant="label"
          tone={entry.done ? 'variant' : 'default'}
          numberOfLines={1}
          className="shrink"
        >
          {entry.item.title}
        </Text>
        {priority === null || entry.done ? null : <PriorityFlag priority={priority} />}
      </View>
      <TaskMeta {...props} />
    </Interactive>
  );
}

function Row({ entry, edge, today }: TaskRowProps): ReactNode {
  const actions = useTaskActions(entry);
  const overdue = useMinuteOf((now) => isOverdue(entry, now, today));
  return (
    <SwipeRow
      leading={swipeOf('Done', 'check', 'primary', actions.done)}
      trailing={swipeOf('Skip', 'skipForward', 'neutral', actions.skip)}
    >
      <View className={cn('border-hairline border-outline-variant bg-surface-1', FRAME[edge])}>
        {edge === 'middle' || edge === 'last' ? (
          <View className="mx-3 h-hairline bg-outline-variant" />
        ) : null}
        <View className="min-h-12 flex-row items-center gap-3 px-3 py-1.5">
          <TaskCheck entry={entry} onDone={actions.done} />
          <TaskBody entry={entry} today={today} overdue={overdue} />
          {entry.item.rrule === null ? null : (
            <View accessible accessibilityLabel="Repeats">
              <Icon name="repeat" size={16} tone="faint" />
            </View>
          )}
        </View>
      </View>
    </SwipeRow>
  );
}

export const TaskRow = memo(Row);
