import { memo, type ReactNode } from 'react';
import { View, type ViewStyle } from 'react-native';
import type { PlannerItemRow } from '@smarteverything/domain';
import { Icon } from '../../../components/icon';
import { IconButton } from '../../../components/icon-button';
import { Interactive } from '../../../components/interactive';
import { SwipeRow, type SwipeAction } from '../../../components/swipe-row';
import { Text } from '../../../components/text';
import { useMinuteOf } from '../../../store/clock';
import { useRow } from '../../../store/selectors';
import { useItemPress } from '../item/item-menu-host';
import { PriorityFlag, priorityOf } from './priority-flag';
import { nestTargetOf } from '../item/steps-model';
import { AssigneeMark } from './assignee-mark';
import { TaskCheck, useTaskActions } from './task-check';
import { dueLabelOf, isOverdue, stepsLabelOf, type TaskEntry } from './task-grouping';
import type { RowEdge } from './task-rows';
import { useInstantClock } from '../../../store/clock-format';

export interface TaskRowProps {
  readonly entry: TaskEntry;
  readonly edge: RowEdge;
  readonly today: string;
  readonly above: PlannerItemRow | null;
  readonly expanded: boolean;
  readonly onExpand: (itemId: string) => void;
}

interface ShownTask {
  readonly entry: TaskEntry;
  readonly today: string;
  readonly overdue: boolean;
  readonly above: PlannerItemRow | null;
}

export interface TaskFrame {
  readonly className: string;
  readonly style: ViewStyle;
}

const FRAME_BASE = 'border-hairline border-outline-variant bg-surface-1';

export const TASK_FRAME: Readonly<Record<RowEdge, TaskFrame>> = {
  only: { className: `${FRAME_BASE} rounded-lg`, style: {} },
  first: { className: `${FRAME_BASE} rounded-t-lg`, style: { borderBottomWidth: 0 } },
  middle: { className: FRAME_BASE, style: { borderTopWidth: 0, borderBottomWidth: 0 } },
  last: { className: `${FRAME_BASE} rounded-b-lg`, style: { borderTopWidth: 0 } },
};

function swipeOf(
  label: string,
  icon: SwipeAction['icon'],
  tone: SwipeAction['tone'],
  onCommit: (() => void) | null,
): SwipeAction | undefined {
  return onCommit === null ? undefined : { label, icon, tone, onCommit };
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
  const instant = useInstantClock();
  return (
    <View className="min-w-0 flex-row items-center gap-2">
      <Text variant="caption" tone={overdue ? 'critical' : 'variant'} className="tabular">
        {dueLabelOf(entry, today, instant)}
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
  const press = useItemPress(
    entry.item.id,
    entry.occurrenceKey,
    nestTargetOf(entry.item, props.above, entry.steps !== null),
  );
  return (
    <Interactive
      {...press.open}
      onLongPress={press.onLongPress}
      onContextMenu={press.onContextMenu}
      label={entry.item.title}
      className="min-h-11 min-w-0 flex-1 justify-center gap-0.5 rounded-sm py-0.5"
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

function ExpandButton({
  entry,
  expanded,
  onExpand,
}: Pick<TaskRowProps, 'entry' | 'expanded' | 'onExpand'>): ReactNode {
  if (entry.steps === null) return null;
  return (
    <IconButton
      icon={expanded ? 'chevronUp' : 'chevronDown'}
      label={
        expanded ? `Hide the steps of ${entry.item.title}` : `Show the steps of ${entry.item.title}`
      }
      size="control"
      onPress={() => {
        onExpand(entry.item.id);
      }}
    />
  );
}

function Row({ entry, edge, today, above, expanded, onExpand }: TaskRowProps): ReactNode {
  const actions = useTaskActions(entry);
  const overdue = useMinuteOf((now) => isOverdue(entry, now, today));
  return (
    <SwipeRow
      leading={swipeOf('Done', 'check', 'primary', actions.done)}
      trailing={swipeOf('Skip', 'skipForward', 'neutral', actions.skip)}
    >
      <View className={TASK_FRAME[edge].className} style={TASK_FRAME[edge].style}>
        {edge === 'middle' || edge === 'last' ? (
          <View className="absolute inset-x-3 top-0 h-hairline bg-outline-variant" />
        ) : null}
        <View className="min-h-12 flex-row items-center gap-3 px-3 py-1.5">
          <TaskCheck entry={entry} actions={actions} />
          <TaskBody entry={entry} today={today} overdue={overdue} above={above} />
          {entry.item.rrule === null ? null : (
            <View accessible accessibilityLabel="Repeats">
              <Icon name="repeat" size={16} tone="faint" />
            </View>
          )}
          <AssigneeMark item={entry.item} side={entry.assigned} />
          <ExpandButton entry={entry} expanded={expanded} onExpand={onExpand} />
        </View>
      </View>
    </SwipeRow>
  );
}

export const TaskRow = memo(Row);
