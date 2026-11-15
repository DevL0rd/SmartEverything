import type { PlannerDay, PlannerItemRow } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { href } from '../../../app-shell/hrefs';
import { Badge } from '../../../components/badge';
import { IconWell } from '../../../components/icon-well';
import { Skeleton } from '../../../components/skeleton';
import { Text } from '../../../components/text';
import {
  WidgetEmpty,
  WidgetFrame,
  WidgetGone,
  widgetBodyHeight,
} from '../../../components/widget-board';
import { useWidgetFace } from '../../../components/widget-board/use-widget-face';
import type { WidgetFrameProps } from '../../../components/widget-board/widget-frame';
import { useDayKey, useMinuteOf } from '../../../store/clock';
import { dateTextOf } from '../clock/alarm-text';
import { usePlannerDay, usePlannerItems, usePlannerOccurrences } from '../data';
import { usePlannerFrame } from '../frame/frame-context';
import { itemIn } from '../item';
import { PriorityFlag, priorityOf } from '../tasks/priority-flag';
import { TaskCheck, useTaskActions } from '../tasks/task-check';
import {
  dueLabelOf,
  isOverdue,
  stepsLabelOf,
  taskEntriesOf,
  type TaskEntry,
} from '../tasks/task-grouping';
import { DayStrip } from '../today/day-strip';
import { isOpenDay } from '../today/today-states';
import { DayBadge, DayRows, useDayLines, useStripModel } from './home-cards';
import { LINE_GAP, SECTION_GAP, STRIP_HEIGHT, linesFit, rowLineOf } from './home-fit';

const OPEN = { label: 'Open Planner', href: href.planner.index() } as const;

const GONE_BODY = 'It was deleted, or it belongs to someone else.';

function Offline(): ReactNode {
  return (
    <Text variant="caption" tone="warning" numberOfLines={1}>
      Hub offline
    </Text>
  );
}

function dayFrameOf(day: string, today: string): Omit<WidgetFrameProps, 'children'> {
  return {
    title: day === today ? 'Today' : dateTextOf(day),
    icon: 'calendar',
    accent: 'primary',
    href: href.planner.index(),
  };
}

function DayFace({ day }: { readonly day: PlannerDay }): ReactNode {
  const { frame } = useWidgetFace();
  const strip = useStripModel(day);
  const lines = useDayLines(day, null);
  const room = widgetBodyHeight(frame) - STRIP_HEIGHT - SECTION_GAP;
  const fit = linesFit(room, rowLineOf(frame.idiom), LINE_GAP);
  if (isOpenDay(day))
    return (
      <WidgetEmpty
        icon="calendar"
        colour="primary"
        title="An open day"
        body="There are no tasks or events for this day."
        action={OPEN}
      />
    );
  return (
    <View className="flex-1 gap-3">
      <DayStrip model={strip} compact />
      {lines.length === 0 ? (
        <Text variant="footnote" tone="variant" numberOfLines={1}>
          Everything on this day is done.
        </Text>
      ) : (
        <DayRows lines={lines} fit={fit} />
      )}
    </View>
  );
}

export function PlannerDayWidget({ day }: { readonly day?: string }): ReactNode {
  const today = useDayKey();
  const key = day ?? today;
  const query = usePlannerDay(null, key);
  const { offline } = usePlannerFrame();
  const frame = dayFrameOf(key, today);
  if (query.data === undefined)
    return (
      <WidgetFrame {...frame}>
        {query.isError ? (
          <WidgetEmpty
            icon="warning"
            colour="critical"
            title="Couldn’t load this day"
            body="Open Planner to try again."
            action={OPEN}
          />
        ) : (
          <Skeleton shape="block" className="flex-1" />
        )}
      </WidgetFrame>
    );
  return (
    <WidgetFrame {...frame} badge={offline ? <Offline /> : <DayBadge day={query.data} />}>
      <DayFace day={query.data} />
    </WidgetFrame>
  );
}

function TaskMeta({
  entry,
  today,
}: {
  readonly entry: TaskEntry;
  readonly today: string;
}): ReactNode {
  const overdue = useMinuteOf((now) => isOverdue(entry, now, today));
  const steps = stepsLabelOf(entry.steps);
  return (
    <View className="flex-row items-center gap-1.5">
      <Badge label={dueLabelOf(entry, today)} tone={overdue ? 'critical' : 'neutral'} />
      {steps === null ? null : (
        <Text variant="caption" tone="variant" numberOfLines={1} className="tabular">
          {steps}
        </Text>
      )}
    </View>
  );
}

function TaskFace({
  entry,
  today,
}: {
  readonly entry: TaskEntry;
  readonly today: string;
}): ReactNode {
  const actions = useTaskActions(entry);
  const priority = priorityOf(entry.item.priority);
  return (
    <View className="flex-1 flex-row items-center gap-3">
      <TaskCheck entry={entry} actions={actions} />
      <View className="min-w-0 flex-1 gap-1">
        <Text variant="body-strong" tone={entry.done ? 'variant' : 'default'} numberOfLines={1}>
          {entry.item.title}
        </Text>
        <TaskMeta entry={entry} today={today} />
      </View>
      {priority === null || entry.done ? null : <PriorityFlag priority={priority} />}
    </View>
  );
}

function PlainFace({ item }: { readonly item: PlannerItemRow }): ReactNode {
  return (
    <View className="flex-1 flex-row items-center gap-3">
      <IconWell
        icon={item.kind === 'event' ? 'calendar' : 'circleCheck'}
        colour="primary"
        size="m"
      />
      <View className="min-w-0 flex-1 gap-0.5">
        <Text variant="body-strong" numberOfLines={1}>
          {item.title}
        </Text>
        {item.notes === '' ? null : (
          <Text variant="footnote" tone="variant" numberOfLines={1}>
            {item.notes}
          </Text>
        )}
      </View>
    </View>
  );
}

export function PlannerItemWidget({ id }: { readonly id: string }): ReactNode {
  const items = usePlannerItems(null);
  const occurrences = usePlannerOccurrences(null);
  const today = useDayKey();
  const query = usePlannerDay(null, today);
  const item = itemIn(items, id);
  if (item === null)
    return <WidgetGone icon="calendar" title="This item is gone" body={GONE_BODY} />;
  const entry = taskEntriesOf({ items, occurrences, day: query.data }).find(
    (value) => value.item.id === id,
  );
  const event = item.kind === 'event';
  return (
    <WidgetFrame
      title={event ? 'Event' : 'Task'}
      icon={event ? 'calendar' : 'circleCheck'}
      accent="primary"
      href={href.planner.item(id, entry === undefined ? null : entry.occurrenceKey)}
    >
      {entry === undefined ? <PlainFace item={item} /> : <TaskFace entry={entry} today={today} />}
    </WidgetFrame>
  );
}
