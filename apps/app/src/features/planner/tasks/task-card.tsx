import { background } from '@smarteverything/logging';
import { memo, type ReactNode } from 'react';
import { View } from 'react-native';
import { href } from '../../../app-shell/hrefs';
import { Badge } from '../../../components/badge';
import { Icon } from '../../../components/icon';
import { Interactive } from '../../../components/interactive';
import { Text } from '../../../components/text';
import { notify } from '../../../components/toast-store';
import { cn } from '../../../design/cn';
import { selectionTick } from '../../../platform/haptics';
import { useMinuteOf } from '../../../store/clock';
import { useRow } from '../../../store/selectors';
import { usePlannerWrites } from '../data';
import { usePlannerFrame } from '../frame/frame-context';
import { PRIORITY_RING, PriorityFlag, priorityOf } from './priority-flag';
import { dueLabelOf, isOverdue, stepsLabelOf, type TaskEntry } from './task-grouping';

export interface TaskActions {
  readonly done: (() => void) | null;
  readonly skip: (() => void) | null;
}

export function useTaskActions(entry: TaskEntry): TaskActions {
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

export function TaskCheck({
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

function DevicePill({ entry }: { readonly entry: TaskEntry }): ReactNode {
  const attached = entry.item.attachments.find((attachment) => attachment.kind === 'device');
  const device = useRow('devices', attached?.kind === 'device' ? attached.deviceId : null);
  if (device === null) return null;
  return <Badge label={device.label} icon="zap" />;
}

function CardMeta({
  entry,
  today,
}: {
  readonly entry: TaskEntry;
  readonly today: string;
}): ReactNode {
  const overdue = useMinuteOf((now) => isOverdue(entry, now, today));
  const steps = stepsLabelOf(entry.steps);
  return (
    <View className="flex-row flex-wrap items-center gap-1.5 pl-9">
      <Badge label={dueLabelOf(entry, today)} tone={overdue ? 'critical' : 'neutral'} />
      <DevicePill entry={entry} />
      {entry.item.rrule === null ? null : (
        <View accessible accessibilityLabel="Repeats">
          <Icon name="repeat" size={16} tone="faint" />
        </View>
      )}
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

function Card({ entry, today }: { readonly entry: TaskEntry; readonly today: string }): ReactNode {
  const actions = useTaskActions(entry);
  const priority = priorityOf(entry.item.priority);
  return (
    <View className="gap-1.5 px-2 py-2.5">
      <View className="flex-row items-start gap-2">
        <TaskCheck entry={entry} onDone={actions.done} />
        <Interactive
          href={href.planner.item(entry.item.id)}
          label={entry.item.title}
          className="min-h-7 min-w-0 flex-1 justify-center rounded-sm"
          layerClassName="rounded-sm"
        >
          <Text variant="label" tone={entry.done ? 'variant' : 'default'} numberOfLines={3}>
            {entry.item.title}
          </Text>
        </Interactive>
        {priority === null || entry.done ? null : (
          <View className="min-h-7 justify-center">
            <PriorityFlag priority={priority} />
          </View>
        )}
      </View>
      <CardMeta entry={entry} today={today} />
    </View>
  );
}

export const TaskCard = memo(Card);
