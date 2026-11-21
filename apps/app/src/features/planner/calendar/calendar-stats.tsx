import type { PlannerOccurrenceView, PlannerRange, PlannerSleep } from '@smarteverything/domain';
import type { UseQueryResult } from '@tanstack/react-query';
import { useEffect, type ReactNode } from 'react';
import { View } from 'react-native';
import { readPlannerSleep } from '../../../api/planner';
import { SegmentBar, type BarSegment } from '../../../components/charts/segment-bar';
import { Button } from '../../../components/button';
import { Checkbox } from '../../../components/checkbox';
import { Icon } from '../../../components/icon';
import { notify } from '../../../components/toast-store';
import { Text } from '../../../components/text';
import { CALENDAR_COLOUR } from '../../../design/data-colours';
import { useIdiom } from '../../../design/platform';
import { localDayKey, zonedStartOfDay } from '../../../format/time';
import { useClockFormat } from '../../../store/clock-format';
import { PLANNER_PREFIX } from '../../../queries/keys';
import { useScreenQuery } from '../../../queries/use-screen-query';
import { useMinuteOf } from '../../../store/clock';
import { useSettings } from '../../../store/selectors';
import {
  apiPerson,
  usePlannerAlarms,
  usePlannerRange,
  usePlannerWrites,
  type PlannerPerson,
} from '../data';
import { usePlannerFrame } from '../frame/frame-context';
import type { Prefs } from '../settings/preferences';
import type { SlotRange } from './drag-create';
import { changedTimes, type BlockChange, type MinuteSpan } from './grid-gestures';
import { useCalendarLooks } from './calendar-looks';
import {
  bookedOf,
  busyOf,
  clockMinutesOf,
  dayWindowOf,
  dueOn,
  freeGapsOf,
  hoursText,
  openWindowOf,
  loadLineOf,
  minutesByCollectionOf,
  totalOf,
  type Booked,
} from './booked-model';
import { addDays } from './month-model';
import { useCalendarWide } from './pane-width';
import { TimeGrid } from './time-grid';
import { timedSpansOn, wallMinuteOf, type SleepNight } from './time-grid-layout';

export function useNowMinute(day: string): number | null {
  const timeZone = useSettings().time_zone;
  return useMinuteOf((now) =>
    localDayKey(now, timeZone) === day ? wallMinuteOf(now, timeZone) : null,
  );
}

function segmentsOf(booked: readonly Booked[]): readonly BarSegment[] {
  return booked
    .filter((entry) => entry.minutes > 0 && entry.collection.visible)
    .map((entry) => ({
      label: entry.collection.name,
      value: entry.minutes,
      colour: CALENDAR_COLOUR[entry.collection.colour],
    }));
}

export interface TimeStatsProps {
  readonly days: readonly string[];
  readonly occurrences: readonly PlannerOccurrenceView[];
  readonly calendars: readonly string[] | null;
  readonly previous: string;
}

function usePreviousMinutes(props: TimeStatsProps): number | null {
  const { person } = usePlannerFrame();
  const timeZone = useSettings().time_zone;
  const days = props.days.map((day) => addDays(day, -props.days.length));
  const first = days[0] ?? '';
  const from = new Date(zonedStartOfDay(first, timeZone)).toISOString();
  const to = new Date(zonedStartOfDay(props.days[0] ?? first, timeZone)).toISOString();
  const range = usePlannerRange(person, from, to, props.calendars).data;
  const looks = useCalendarLooks(person);
  if (range === undefined) return null;
  const minutes = minutesByCollectionOf({
    occurrences: looks.shown(range.occurrences),
    days,
    timeZone,
  });
  return [...minutes.values()].reduce((sum, value) => sum + value, 0);
}

export function TimeStats(props: TimeStatsProps): ReactNode {
  const { person } = usePlannerFrame();
  const timeZone = useSettings().time_zone;
  const looks = useCalendarLooks(person);
  const booked = bookedOf({
    ...props,
    occurrences: looks.shown(props.occurrences),
    collections: looks.collections,
    timeZone,
  });
  const total = totalOf(booked);
  const change = loadLineOf(total, usePreviousMinutes(props), props.previous);
  if (total === 0) {
    return (
      <View className="flex-row flex-wrap justify-between gap-x-3">
        <Text variant="caption" tone="variant">
          Nothing booked
        </Text>
        {change === null ? null : (
          <Text variant="caption" tone="variant" className="tabular">
            {change}
          </Text>
        )}
      </View>
    );
  }
  return (
    <View className="gap-1.5">
      <View className="flex-row flex-wrap justify-between gap-x-3">
        <Text variant="caption" tone="variant">
          Hours booked by calendar
        </Text>
        {change === null ? null : (
          <Text variant="caption" tone="variant" className="tabular">
            {change}
          </Text>
        )}
      </View>
      <SegmentBar
        segments={segmentsOf(booked)}
        label="Hours booked by calendar"
        legend
        format={hoursText}
      />
    </View>
  );
}

export function FreeTimeWell({
  gap,
  who,
  onCreate,
}: {
  readonly gap: MinuteSpan | null;
  readonly who: string;
  readonly onCreate: (gap: MinuteSpan) => void;
}): ReactNode {
  const format = useClockFormat();
  return (
    <View className="flex-row flex-wrap items-center gap-3 rounded-md bg-surface-2 px-3 py-2.5">
      <Icon name="users" size={20} tone="variant" />
      <Text variant="callout" className="min-w-0 grow basis-48 tabular">
        {gap === null
          ? 'No shared free time left on this day'
          : `${who} free ${format.minutes(gap.from)} to ${format.minutes(gap.to)}`}
      </Text>
      {gap === null ? null : (
        <Button
          label="Create event"
          icon="plus"
          variant="tonal"
          onPress={() => {
            onCreate(gap);
          }}
        />
      )}
    </View>
  );
}

export interface DaySideProps {
  readonly day: string;
  readonly occurrences: readonly PlannerOccurrenceView[];
  readonly prefs: Prefs;
  readonly onCompose: (day: string, gap: MinuteSpan) => void;
}

function DueRows({ tasks }: { readonly tasks: readonly PlannerOccurrenceView[] }): ReactNode {
  const writes = usePlannerWrites(usePlannerFrame().person);
  const timeZone = useSettings().time_zone;
  const format = useClockFormat();
  if (tasks.length === 0) {
    return (
      <Text variant="footnote" tone="variant">
        Nothing due on this day
      </Text>
    );
  }
  return tasks.map((task) => (
    <Checkbox
      key={`${task.item_id}:${task.occurrence_key}`}
      checked={task.status === 'done'}
      disabled={task.status === 'done'}
      label={task.title}
      caption={task.due_at === null ? 'Any time' : format.instant(task.due_at, timeZone)}
      onChange={() => {
        writes
          .completeItem(task.item_id, { occurrence_key: task.occurrence_key })
          .catch((error: unknown) => {
            notify({ message: `${task.title} was not marked done`, error, tone: 'critical' });
          });
      }}
    />
  ));
}

export function DaySide({ day, occurrences, prefs, onCompose }: DaySideProps): ReactNode {
  const timeZone = useSettings().time_zone;
  const now = useNowMinute(day);
  const verb = useIdiom() === 'pointer' ? 'Click' : 'Tap';
  const format = useClockFormat();
  const busy = timedSpansOn(busyOf(occurrences), day, timeZone);
  const gaps = freeGapsOf(busy, openWindowOf(dayWindowOf(prefs.general), now));
  return (
    <View className="w-72 gap-2">
      <Text variant="label">Due on this day</Text>
      <DueRows tasks={dueOn(occurrences, day, timeZone)} />
      <View className="my-1 h-hairline bg-outline-variant" />
      <Text variant="label">Free</Text>
      <View className="flex-row flex-wrap gap-2">
        {gaps.map((gap) => {
          const range = `${format.minutes(gap.from)} to ${format.minutes(gap.to)}`;
          return (
            <Button
              key={`${String(gap.from)}-${String(gap.to)}`}
              label={range}
              spoken={`Add an event in the free time ${range}`}
              icon="plus"
              variant="tonal"
              onPress={() => {
                onCompose(day, gap);
              }}
            />
          );
        })}
      </View>
      <Text variant="caption" tone="variant">
        {gaps.length === 0
          ? 'No free time left on this day.'
          : `${verb} a free slot to add an event then.`}
      </Text>
    </View>
  );
}

export const PREVIOUS = {
  day: 'yesterday',
  three_days: 'the 3 days before',
  week: 'last week',
} as const;

export interface TimeInput {
  readonly days: readonly string[];
  readonly range: PlannerRange;
  readonly prefs: Prefs;
  readonly calendars: readonly string[] | null;
  readonly held: SlotRange | null;
  readonly onCompose: (day: string, gap: MinuteSpan) => void;
}

export function shownOf(range: PlannerRange, prefs: Prefs): readonly PlannerOccurrenceView[] {
  return prefs.calendar.show_tasks
    ? range.occurrences
    : range.occurrences.filter((view) => view.kind !== 'task');
}

function useGridSleep(
  person: PlannerPerson,
  days: readonly string[],
  shown: boolean,
): UseQueryResult<PlannerSleep> {
  const timeZone = useSettings().time_zone;
  const first = days[0];
  const last = days.at(-1);
  if (first === undefined || last === undefined) throw new Error('The time grid has no days');
  const from = new Date(zonedStartOfDay(addDays(first, -1), timeZone)).toISOString();
  const to = new Date(zonedStartOfDay(addDays(last, 1), timeZone)).toISOString();
  const query = useScreenQuery({
    queryKey: [...PLANNER_PREFIX, 'sleep', person, from, to],
    queryFn: ({ signal }) => readPlannerSleep(apiPerson(person), from, to, signal),
    enabled: shown,
  });
  const { error } = query;
  useEffect(() => {
    if (error !== null) notify({ message: 'Sleep could not be read', error, tone: 'critical' });
  }, [error]);
  return query;
}

function nightsOf(query: UseQueryResult<PlannerSleep>, shown: boolean): readonly SleepNight[] {
  if (!shown || query.data === undefined) return [];
  return query.data.nights;
}

function useMove(person: PlannerPerson): (change: BlockChange) => Promise<unknown> {
  const writes = usePlannerWrites(person);
  const timeZone = useSettings().time_zone;
  return (change) => {
    const { occurrence } = change.block;
    const times = changedTimes(occurrence, change, timeZone);
    return writes.moveItem(occurrence.item_id, {
      occurrence_key: occurrence.occurrence_key,
      start: times.at,
      end: times.end,
    });
  };
}

function TimeGridOf({ input }: { readonly input: TimeInput }): ReactNode {
  const { person } = usePlannerFrame();
  const alarms = usePlannerAlarms(person);
  const { prefs } = input;
  const looks = useCalendarLooks(person);
  const showSleep = prefs.calendar.show_sleep;
  const sleep = useGridSleep(person, input.days, showSleep);
  const move = useMove(person);
  return (
    <TimeGrid
      days={input.days}
      occurrences={shownOf(input.range, prefs)}
      collections={looks.collections}
      alarms={prefs.calendar.show_alarms ? alarms : []}
      workingHours={prefs.calendar.show_free_time ? prefs.general.working_hours : null}
      sleep={nightsOf(sleep, showSleep)}
      timeZone={useSettings().time_zone}
      startMinute={clockMinutesOf(prefs.general.day_start)}
      readOnlyOf={looks.readOnlyOf}
      lookOf={looks.lookOf}
      held={input.held}
      onCreate={input.onCompose}
      onMove={move}
    />
  );
}

export function TimeContent({
  input,
  previous,
  side,
}: {
  readonly input: TimeInput;
  readonly previous: string;
  readonly side: boolean;
}): ReactNode {
  const wide = useCalendarWide();
  if (!wide) return <TimeGridOf input={input} />;
  return (
    <View className="min-h-0 flex-1 gap-3">
      <TimeStats
        days={input.days}
        occurrences={input.range.occurrences}
        calendars={input.calendars}
        previous={previous}
      />
      <View className="min-h-0 flex-1 flex-row gap-4">
        <TimeGridOf input={input} />
        {side ? (
          <DaySide
            day={input.days[0] ?? ''}
            occurrences={shownOf(input.range, input.prefs)}
            prefs={input.prefs}
            onCompose={input.onCompose}
          />
        ) : null}
      </View>
    </View>
  );
}
