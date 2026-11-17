import { memo, type ReactNode } from 'react';
import { View } from 'react-native';
import { Badge } from '../../../components/badge';
import { Icon } from '../../../components/icon';
import { Interactive } from '../../../components/interactive';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { useIdiom } from '../../../design/platform';
import { useMinuteOf } from '../../../store/clock';
import { useRow } from '../../../store/selectors';
import { useItemPress } from '../item/item-menu-host';
import { AssigneeMark } from './assignee-mark';
import { PriorityFlag, priorityOf } from './priority-flag';
import { TaskCheck, useTaskActions } from './task-check';
import { dueLabelOf, isOverdue, stepsLabelOf, type TaskEntry } from './task-grouping';
import { useInstantClock } from '../../clock/format/clock-format';

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
  const instant = useInstantClock();
  const steps = stepsLabelOf(entry.steps);
  return (
    <View className="flex-row flex-wrap items-center gap-1.5 pl-9">
      <Badge label={dueLabelOf(entry, today, instant)} tone={overdue ? 'critical' : 'neutral'} />
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
      <AssigneeMark item={entry.item} side={entry.assigned} />
    </View>
  );
}

function Card({ entry, today }: { readonly entry: TaskEntry; readonly today: string }): ReactNode {
  const actions = useTaskActions(entry);
  const priority = priorityOf(entry.item.priority);
  const press = useItemPress(entry.item.id, entry.occurrenceKey);
  const tall = useIdiom() === 'touch' ? 'min-h-11' : 'min-h-8';
  return (
    <View className="gap-1.5 px-2 py-2.5">
      <View className="flex-row items-start gap-2">
        <TaskCheck entry={entry} actions={actions} />
        <Interactive
          {...press.open}
          onLongPress={press.onLongPress}
          onContextMenu={press.onContextMenu}
          label={entry.item.title}
          className={cn(tall, 'min-w-0 flex-1 justify-center rounded-sm')}
          layerClassName="rounded-sm"
        >
          <Text variant="label" tone={entry.done ? 'variant' : 'default'} numberOfLines={3}>
            {entry.item.title}
          </Text>
          {press.menu}
        </Interactive>
        {priority === null || entry.done ? null : (
          <View className={cn(tall, 'justify-center')}>
            <PriorityFlag priority={priority} />
          </View>
        )}
      </View>
      <CardMeta entry={entry} today={today} />
    </View>
  );
}

export const TaskCard = memo(Card);
