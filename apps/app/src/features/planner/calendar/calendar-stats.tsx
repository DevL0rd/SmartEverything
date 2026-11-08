import type {
  PlannerCollectionRow,
  PlannerOccurrenceView,
  PlannerRange,
} from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { SegmentBar, type BarSegment } from '../../../components/charts/segment-bar';
import { Button } from '../../../components/button';
import { Checkbox } from '../../../components/checkbox';
import { FilterChip } from '../../../components/filter-chip';
import { Icon } from '../../../components/icon';
import { notify } from '../../../components/toast-store';
import { Text } from '../../../components/text';
import { CALENDAR_COLOUR } from '../../../design/data-colours';
import { rounded } from '../../../format/number';
import { useIdiom } from '../../../design/platform';
import { useAreaWidth } from '../../../design/size-class';
import { clock, clockOfMinutes, localDayKey, zonedStartOfDay } from '../../../format/time';
import { useMinuteOf } from '../../../store/clock';
import { useSettings } from '../../../store/selectors';
import {
  usePlannerAlarms,
  usePlannerCollections,
  usePlannerRange,
  usePlannerWrites,
} from '../data';
import { usePlannerFrame } from '../frame/frame-context';
import { frameLayoutOf } from '../frame/sections';
import { LIST_DOT } from '../item/composer-tokens';
import type { CalendarShowKey } from '../settings/options';
import type { Prefs } from '../settings/preferences';
import type { MinuteSpan } from './grid-gestures';
import { ShowChips, useCollectionEdit } from './calendars-sheet';
import { addDays, dayLabelOf } from './month-model';
import { TimeGrid } from './time-grid';
import { timedSpansOn, wallMinuteOf } from './time-grid-layout';

export interface Booked {
  readonly collection: PlannerCollectionRow;
  readonly minutes: number;
}

export interface BookedInput {
  readonly occurrences: readonly PlannerOccurrenceView[];
  readonly collections: readonly PlannerCollectionRow[];
  readonly days: readonly string[];
  readonly timeZone: string;
}

export function minutesByCollectionOf(
  input: Omit<BookedInput, 'collections'>,
): Map<string, number> {
  const minutes = new Map<string, number>();
  const events = busyOf(input.occurrences);
  for (const day of input.days) {
    for (const span of timedSpansOn(events, day, input.timeZone)) {
      const id = span.occurrence.collection_id;
      minutes.set(id, (minutes.get(id) ?? 0) + span.to - span.from);
    }
  }
  return minutes;
}

export function bookedOf(input: BookedInput): readonly Booked[] {
  const minutes = minutesByCollectionOf(input);
  return input.collections
    .filter((collection) => collection.kind === 'calendar')
    .map((collection) => ({ collection, minutes: minutes.get(collection.id) ?? 0 }));
}

export function totalOf(booked: readonly Booked[]): number {
  return booked.reduce((sum, entry) => sum + entry.minutes, 0);
}

export function clockMinutesOf(text: string): number {
  const [hour = '0', minute = '0'] = text.split(':');
  return Number(hour) * 60 + Number(minute);
}

export function dayWindowOf(general: Prefs['general']): MinuteSpan {
  const from = clockMinutesOf(general.day_start);
  const end = clockMinutesOf(general.day_end);
  return {
    from: Math.floor(from / 60) * 60,
    to: Math.min(1440, Math.ceil((end <= from ? 1440 : end) / 60) * 60),
  };
}

export function freeGapsOf(busy: readonly MinuteSpan[], window: MinuteSpan): readonly MinuteSpan[] {
  const gaps: MinuteSpan[] = [];
  let cursor = window.from;
  for (const span of [...busy].sort((left, right) => left.from - right.from)) {
    if (span.from >= window.to) break;
    if (span.from > cursor) gaps.push({ from: cursor, to: span.from });
    cursor = Math.max(cursor, span.to);
  }
  if (cursor < window.to) gaps.push({ from: cursor, to: window.to });
  return gaps;
}

export function openWindowOf(window: MinuteSpan, now: number | null): MinuteSpan {
  return { from: now === null ? window.from : Math.max(window.from, now), to: window.to };
}

export function busyOf(occurrences: readonly PlannerOccurrenceView[]): PlannerOccurrenceView[] {
  return occurrences.filter((view) => view.kind === 'event' && view.status !== 'proposed');
}

export function dueOn(
  occurrences: readonly PlannerOccurrenceView[],
  day: string,
  timeZone: string,
): readonly PlannerOccurrenceView[] {
  return occurrences.filter(
    (view) =>
      view.kind === 'task' &&
      view.status !== 'cancelled' &&
      view.status !== 'proposed' &&
      (view.due_date === day ||
        (view.due_at !== null && localDayKey(Date.parse(view.due_at), timeZone) === day)),
  );
}

export function useNowMinute(day: string): number | null {
  const timeZone = useSettings().time_zone;
  return useMinuteOf((now) =>
    localDayKey(now, timeZone) === day ? wallMinuteOf(now, timeZone) : null,
  );
}

export function eventTextOf(day: string, gap: MinuteSpan): string {
  return `${dayLabelOf(day, true)} ${clockOfMinutes(gap.from)} to ${clockOfMinutes(gap.to)}`;
}

export function hoursText(minutes: number): string {
  return `${rounded(minutes / 60, 1)} h`;
}

export function loadLineOf(now: number, before: number | null, previous: string): string {
  const booked = `Booked ${hoursText(now)}`;
  if (before === null) return booked;
  if (now === before) return `${booked} · same as ${previous}`;
  const change = now > before ? 'up' : 'down';
  return `${booked} · ${change} ${hoursText(Math.abs(now - before))} on ${previous}`;
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

function chipValue(entry: Booked): string {
  return entry.minutes > 0 && entry.collection.visible
    ? `${entry.collection.name} ${hoursText(entry.minutes)}`
    : entry.collection.name;
}

function CalendarChips({ booked }: { readonly booked: readonly Booked[] }): ReactNode {
  const edit = useCollectionEdit();
  return booked.map((entry) => (
    <FilterChip
      key={entry.collection.id}
      label="Calendar"
      value={chipValue(entry)}
      swatchClassName={LIST_DOT[entry.collection.colour]}
      active={entry.collection.visible}
      onPress={() => {
        edit(entry.collection, { visible: !entry.collection.visible });
      }}
    />
  ));
}

const STATS_OVERLAYS: readonly CalendarShowKey[] = ['show_tasks', 'show_sleep'];

export interface TimeStatsProps {
  readonly days: readonly string[];
  readonly occurrences: readonly PlannerOccurrenceView[];
  readonly calendars: readonly string[] | null;
  readonly previous: string;
  readonly prefs: Prefs;
}

function usePreviousMinutes(props: TimeStatsProps): number | null {
  const { person } = usePlannerFrame();
  const timeZone = useSettings().time_zone;
  const days = props.days.map((day) => addDays(day, -props.days.length));
  const first = days[0] ?? '';
  const from = new Date(zonedStartOfDay(first, timeZone)).toISOString();
  const to = new Date(zonedStartOfDay(props.days[0] ?? first, timeZone)).toISOString();
  const range = usePlannerRange(person, from, to, props.calendars).data;
  if (range === undefined) return null;
  const minutes = minutesByCollectionOf({ occurrences: range.occurrences, days, timeZone });
  return [...minutes.values()].reduce((sum, value) => sum + value, 0);
}

export function TimeStats(props: TimeStatsProps): ReactNode {
  const { person } = usePlannerFrame();
  const timeZone = useSettings().time_zone;
  const collections = usePlannerCollections(person);
  const booked = bookedOf({ ...props, collections, timeZone });
  const before = usePreviousMinutes(props);
  return (
    <View className="flex-row flex-wrap items-center gap-x-4 gap-y-2">
      <View className="min-w-64 flex-1 gap-1.5">
        <View className="flex-row flex-wrap justify-between gap-x-3">
          <Text variant="caption" tone="variant">
            Hours booked by calendar
          </Text>
          <Text variant="caption" tone="variant" className="tabular">
            {loadLineOf(totalOf(booked), before, props.previous)}
          </Text>
        </View>
        <SegmentBar segments={segmentsOf(booked)} label="Hours booked by calendar" />
      </View>
      <View className="flex-row flex-wrap items-center gap-1">
        <CalendarChips booked={booked} />
        <ShowChips prefs={props.prefs} keys={STATS_OVERLAYS} />
      </View>
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
  return (
    <View className="flex-row flex-wrap items-center gap-3 rounded-md bg-surface-2 px-3 py-2.5">
      <Icon name="users" size={20} tone="variant" />
      <Text variant="callout" className="min-w-0 flex-1 tabular">
        {gap === null
          ? 'No shared free time left on this day'
          : `${who} free ${clockOfMinutes(gap.from)} to ${clockOfMinutes(gap.to)}`}
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
      caption={task.due_at === null ? 'Any time' : clock(task.due_at, timeZone)}
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
  const busy = timedSpansOn(busyOf(occurrences), day, timeZone);
  const gaps = freeGapsOf(busy, openWindowOf(dayWindowOf(prefs.general), now));
  return (
    <View className="w-72 gap-2">
      <Text variant="label">Due on this day</Text>
      <DueRows tasks={dueOn(occurrences, day, timeZone)} />
      <View className="my-1 h-hairline bg-outline-variant" />
      <Text variant="label">Free</Text>
      <View className="flex-row flex-wrap gap-1">
        {gaps.map((gap) => (
          <FilterChip
            key={`${String(gap.from)}-${String(gap.to)}`}
            label="Free"
            value={`${clockOfMinutes(gap.from)} to ${clockOfMinutes(gap.to)}`}
            active={false}
            onPress={() => {
              onCompose(day, gap);
            }}
          />
        ))}
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

export function bookedLineOf(
  range: PlannerRange | undefined,
  input: Omit<BookedInput, 'occurrences'>,
): string | null {
  if (range === undefined) return null;
  return `${hoursText(totalOf(bookedOf({ ...input, occurrences: range.occurrences })))} booked`;
}

function editableAlways(): boolean {
  return false;
}

export interface TimeInput {
  readonly days: readonly string[];
  readonly range: PlannerRange;
  readonly prefs: Prefs;
  readonly calendars: readonly string[] | null;
  readonly onCompose: (day: string, gap: MinuteSpan) => void;
}

export function shownOf(range: PlannerRange, prefs: Prefs): readonly PlannerOccurrenceView[] {
  return prefs.calendar.show_tasks
    ? range.occurrences
    : range.occurrences.filter((view) => view.kind !== 'task');
}

function TimeGridOf({ input }: { readonly input: TimeInput }): ReactNode {
  const { person } = usePlannerFrame();
  const alarms = usePlannerAlarms(person);
  const { prefs } = input;
  return (
    <TimeGrid
      days={input.days}
      occurrences={shownOf(input.range, prefs)}
      collections={usePlannerCollections(person)}
      alarms={prefs.calendar.show_alarms ? alarms : []}
      workingHours={prefs.calendar.show_free_time ? prefs.general.working_hours : null}
      timeZone={useSettings().time_zone}
      startMinute={clockMinutesOf(prefs.general.day_start)}
      readOnlyOf={editableAlways}
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
  const wide = frameLayoutOf(useAreaWidth()) !== 'compact';
  if (!wide) return <TimeGridOf input={input} />;
  return (
    <View className="min-h-0 flex-1 gap-3">
      <TimeStats
        days={input.days}
        occurrences={input.range.occurrences}
        calendars={input.calendars}
        previous={previous}
        prefs={input.prefs}
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
