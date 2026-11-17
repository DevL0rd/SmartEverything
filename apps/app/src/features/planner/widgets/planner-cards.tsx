import type { PlannerDay, PlannerItemRow, PlannerOccurrenceView } from '@smarteverything/domain';
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
import { TYPE_SCALE } from '../../../design/tokens';
import { dayBoundsOf, localDayKey } from '../../../format/time';
import { useDayKey, useMinute, useMinuteOf } from '../../../store/clock';
import { useSettings } from '../../../store/selectors';
import { dateTextOf } from '../clock/alarm-text';
import { usePlannerDay, usePlannerItems, usePlannerOccurrences, usePlannerRange } from '../data';
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
import { useDayLines, useStripModel } from './day-lines';
import { DayBadge, DayRows, WidgetOffline } from './home-cards';
import { useInstantClock, type InstantClock } from '../../clock/format/clock-format';
import { LINE_GAP, SECTION_GAP, STRIP_HEIGHT, leadWhenOf, linesFit, rowLineOf } from './home-fit';

const OPEN = { label: 'Open Planner', href: href.planner.index() } as const;

const GONE_BODY = 'It was deleted, or it belongs to someone else.';

const TIGHT_GAP = 2;

interface Window {
  readonly from: string;
  readonly to: string;
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
    <WidgetFrame {...frame} badge={offline ? <WidgetOffline /> : <DayBadge day={query.data} />}>
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
  const instant = useInstantClock();
  const steps = stepsLabelOf(entry.steps);
  if (entry.done) return <Badge label="Done" tone="positive" />;
  return (
    <View className="flex-row items-center gap-1.5">
      <Badge label={dueLabelOf(entry, today, instant)} tone={overdue ? 'critical' : 'neutral'} />
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

function useNotesFit(occurrence: boolean): boolean {
  const { frame } = useWidgetFace();
  const type = TYPE_SCALE[frame.idiom];
  const caption = occurrence ? type.caption[1] + TIGHT_GAP : 0;
  return type.body[1] + caption + TIGHT_GAP + type.footnote[1] <= widgetBodyHeight(frame);
}

function captionOf(
  occurrence: PlannerOccurrenceView,
  timeZone: string,
  now: number,
  instant: InstantClock,
): string {
  const when = leadWhenOf(occurrence, timeZone, now, instant);
  return occurrence.location === null ? when : `${when} · ${occurrence.location}`;
}

function PlainFace({
  item,
  occurrence,
}: {
  readonly item: PlannerItemRow;
  readonly occurrence: PlannerOccurrenceView | null;
}): ReactNode {
  const timeZone = useSettings().time_zone;
  const now = useMinute();
  const instant = useInstantClock();
  const fits = useNotesFit(occurrence !== null);
  const notes = item.notes !== '' && fits;
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
        {occurrence === null ? null : (
          <Text variant="caption" tone="variant" numberOfLines={1} className="tabular-nums">
            {captionOf(occurrence, timeZone, now, instant)}
          </Text>
        )}
        {!notes ? null : (
          <Text variant="footnote" tone="variant" numberOfLines={1}>
            {item.notes}
          </Text>
        )}
      </View>
    </View>
  );
}

function endOf(view: PlannerOccurrenceView): number | null {
  const at = view.end ?? view.start ?? view.due_at;
  return at === null ? null : Date.parse(at);
}

function windowOf(
  item: PlannerItemRow,
  today: string,
  timeZone: string,
  now: number,
): Window | null {
  const day = dayBoundsOf(today, timeZone);
  if (item.rrule !== null)
    return { from: new Date(day.start).toISOString(), to: new Date(day.end).toISOString() };
  const start = item.start;
  const end = item.end ?? start;
  if (start === null || end === null || Date.parse(end) <= now) return null;
  const first = Math.max(day.start, dayBoundsOf(localDayKey(start, timeZone), timeZone).start);
  const last = dayBoundsOf(localDayKey(end, timeZone), timeZone).end;
  return { from: new Date(first).toISOString(), to: new Date(last).toISOString() };
}

function nextOf(
  views: readonly PlannerOccurrenceView[] | undefined,
  itemId: string,
  now: number,
): PlannerOccurrenceView | null {
  const ahead = views?.find((view) => {
    if (view.item_id !== itemId || view.status === 'cancelled') return false;
    const end = endOf(view);
    return end === null || end > now;
  });
  return ahead ?? null;
}

function EventRange({
  item,
  window,
}: {
  readonly item: PlannerItemRow;
  readonly window: Window;
}): ReactNode {
  const now = useMinute();
  const views = usePlannerRange(null, window.from, window.to, null).data?.occurrences;
  return <PlainFace item={item} occurrence={nextOf(views, item.id, now)} />;
}

function EventFace({
  item,
  today,
}: {
  readonly item: PlannerItemRow;
  readonly today: string;
}): ReactNode {
  const timeZone = useSettings().time_zone;
  const window = windowOf(item, today, timeZone, useMinute());
  return window === null ? (
    <PlainFace item={item} occurrence={null} />
  ) : (
    <EventRange item={item} window={window} />
  );
}

export function PlannerItemWidget({ id }: { readonly id: string }): ReactNode {
  const items = usePlannerItems(null);
  const occurrences = usePlannerOccurrences(null);
  const today = useDayKey();
  const query = usePlannerDay(null, today);
  const { offline } = usePlannerFrame();
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
      badge={offline ? <WidgetOffline /> : null}
    >
      {entry !== undefined ? (
        <TaskFace entry={entry} today={today} />
      ) : event ? (
        <EventFace item={item} today={today} />
      ) : (
        <PlainFace item={item} occurrence={null} />
      )}
    </WidgetFrame>
  );
}
