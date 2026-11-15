import type { PlannerRange } from '@smarteverything/domain';
import { useQueries, type UseQueryResult } from '@tanstack/react-query';
import { useRef, useState, type ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { Card } from '../../../components/card';
import { FilterChip } from '../../../components/filter-chip';
import { Icon } from '../../../components/icon';
import { Skeleton } from '../../../components/skeleton';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { useIdiom } from '../../../design/platform';
import { useScreenPaused } from '../../../design/screen-pause';
import { clockOfMinutes, shiftDay, zonedStartOfDay } from '../../../format/time';
import { useRows, useSettings } from '../../../store/selectors';
import { useStoreSelector } from '../../../store/store-context';
import { ProfileAvatar } from '../../profiles';
import { rangeQuery, usePlannerRange, type PlannerPerson } from '../data';
import { usePlannerFrame } from '../frame/frame-context';
import { LIST_DOT } from '../item/composer-tokens';
import type { Prefs } from '../settings/preferences';
import { useCalendarLooks } from './calendar-looks';
import type { MinuteSpan } from './grid-gestures';
import { busyOf, dayWindowOf, freeGapsOf, openWindowOf } from './booked-model';
import { FreeTimeWell, useNowMinute } from './calendar-stats';
import { useCalendarWide } from './pane-width';
import { Bars, FreeBars, TrackLines, barOf, hourMarksOf } from './timeline-bars';
import { timedSpansOn, type GridSpan } from './time-grid-layout';

export type TimelineMode = 'people' | 'calendars';

interface TimelineRow {
  readonly key: string;
  readonly name: string;
  readonly leading: ReactNode;
  readonly spans: readonly GridSpan[];
}

const HOUR_WIDTH_TOUCH = 64;

function useDayWindow(day: string): { readonly from: string; readonly to: string } {
  const timeZone = useSettings().time_zone;
  return {
    from: new Date(zonedStartOfDay(day, timeZone)).toISOString(),
    to: new Date(zonedStartOfDay(shiftDay(day, 1), timeZone)).toISOString(),
  };
}

function usePeopleRows(day: string, compact: boolean): readonly TimelineRow[] | null {
  const timeZone = useSettings().time_zone;
  const profiles = useRows('profiles');
  const me = useStoreSelector((state) => state.session?.client.profile_id ?? null);
  const { from, to } = useDayWindow(day);
  const paused = useScreenPaused();
  const people = profiles.map((profile) => ({
    profile,
    person: (profile.id === me ? null : profile.id) satisfies PlannerPerson,
  }));
  const ranges = useQueries({
    queries: people.map(({ person }) => ({
      ...rangeQuery(person, from, to, null),
      subscribed: !paused,
    })),
    combine: (results: readonly UseQueryResult<PlannerRange>[]) =>
      results.every((result) => result.data !== undefined)
        ? results.map((result) => result.data)
        : null,
  });
  if (ranges === null) return null;
  return people.map(({ profile }, index) => ({
    key: profile.id,
    name: profile.id === me ? 'You' : profile.name,
    leading: <ProfileAvatar profile={profile} size={compact ? 's' : 'm'} />,
    spans: timedSpansOn(busyOf(ranges[index]?.occurrences ?? []), day, timeZone),
  }));
}

function useCalendarRows(
  day: string,
  calendars: readonly string[] | null,
): readonly TimelineRow[] | null {
  const timeZone = useSettings().time_zone;
  const { person } = usePlannerFrame();
  const { from, to } = useDayWindow(day);
  const query = usePlannerRange(person, from, to, calendars);
  const looks = useCalendarLooks(person);
  const shown = looks.collections.filter((collection) => collection.visible);
  if (query.data === undefined) return null;
  const spans = timedSpansOn(busyOf(looks.shown(query.data.occurrences)), day, timeZone);
  return shown.map((collection) => ({
    key: collection.id,
    name: collection.name,
    leading: <View className={cn('size-2.5 rounded-full', LIST_DOT[collection.colour])} />,
    spans: spans.filter((span) => span.occurrence.collection_id === collection.id),
  }));
}

function rowLabelOf(row: TimelineRow): string {
  if (row.spans.length === 0) return `${row.name}: free all day`;
  const parts = row.spans.map(
    (span) => `${span.occurrence.title} ${clockOfMinutes(span.from)} to ${clockOfMinutes(span.to)}`,
  );
  return `${row.name}: ${parts.join(', ')}`;
}

interface Layout {
  readonly compact: boolean;
  readonly window: MinuteSpan;
  readonly now: number | null;
}

function HourHead({ layout }: { readonly layout: Layout }): ReactNode {
  return (
    <View aria-hidden className="h-7 flex-row border-b border-outline-variant">
      {hourMarksOf(layout.window).map((hour) => (
        <View key={hour} className="flex-1 justify-center border-l border-outline-variant pl-1">
          <Text variant="caption" tone="faint" className="font-mono tabular">
            {String(hour).padStart(2, '0')}
          </Text>
        </View>
      ))}
    </View>
  );
}

function NowMark({ layout }: { readonly layout: Layout }): ReactNode {
  if (layout.now === null) return null;
  const place = barOf({ from: layout.now, to: layout.now + 1 }, layout.window);
  if (place === null) return null;
  const at = { left: place.left };
  return (
    <View
      aria-hidden
      pointerEvents="none"
      style={at}
      className="absolute bottom-0 top-0 w-0.5 bg-primary"
    />
  );
}

interface GridProps {
  readonly rows: readonly TimelineRow[];
  readonly gaps: readonly MinuteSpan[];
  readonly layout: Layout;
}

function Tracks({ rows, gaps, layout }: GridProps): ReactNode {
  const rowHeight = layout.compact ? 'h-10' : 'h-11';
  return (
    <View className="relative">
      <HourHead layout={layout} />
      {rows.map((row) => (
        <View
          key={row.key}
          accessible
          accessibilityLabel={rowLabelOf(row)}
          className={cn('relative border-b border-outline-variant', rowHeight)}
        >
          <TrackLines window={layout.window} />
          <Bars spans={row.spans} window={layout.window} />
        </View>
      ))}
      <View className={cn('relative', rowHeight)}>
        <TrackLines window={layout.window} />
        <FreeBars gaps={gaps} window={layout.window} />
      </View>
      <NowMark layout={layout} />
    </View>
  );
}

function Labels({
  rows,
  compact,
}: {
  readonly rows: readonly TimelineRow[];
  readonly compact: boolean;
}): ReactNode {
  const rowHeight = compact ? 'h-10' : 'h-11';
  return (
    <View aria-hidden className={compact ? 'w-28' : 'w-40'}>
      <View className="h-7 border-b border-outline-variant" />
      {[
        ...rows,
        { key: 'free', name: 'Free', leading: <Icon name="users" size={16} tone="variant" /> },
      ].map((row) => (
        <View
          key={row.key}
          className={cn(
            'flex-row items-center border-b border-outline-variant',
            compact ? 'gap-1.5 px-2' : 'gap-2 px-3',
            rowHeight,
          )}
        >
          {row.leading}
          <Text variant="footnote" numberOfLines={1} className="min-w-0 flex-1">
            {row.name}
          </Text>
        </View>
      ))}
    </View>
  );
}

export function swipeStartOf(layout: Pick<Layout, 'window' | 'now'>): number {
  if (layout.now === null) return 0;
  return Math.max(0, ((layout.now - layout.window.from) / 60 - 1) * HOUR_WIDTH_TOUCH);
}

function SwipeTracks(props: GridProps): ReactNode {
  const scroll = useRef<ScrollView>(null);
  const pointer = useIdiom() === 'pointer';
  const width = { width: hourMarksOf(props.layout.window).length * HOUR_WIDTH_TOUCH };
  return (
    <ScrollView
      ref={scroll}
      horizontal
      showsHorizontalScrollIndicator={pointer}
      onLayout={() => {
        scroll.current?.scrollTo({ x: swipeStartOf(props.layout), animated: false });
      }}
      className="flex-1"
    >
      <View style={width}>
        <Tracks {...props} />
      </View>
    </ScrollView>
  );
}

export function swipesAt(width: number, window: MinuteSpan): boolean {
  return width > 0 && width / hourMarksOf(window).length < HOUR_WIDTH_TOUCH;
}

function TimelineGrid(props: GridProps): ReactNode {
  const [width, setWidth] = useState(0);
  const pointer = useIdiom() === 'pointer';
  const swipe = swipesAt(width, props.layout.window);
  return (
    <>
      <Card padding="none" className="overflow-hidden">
        <View className="flex-row">
          <Labels rows={props.rows} compact={props.layout.compact} />
          <View
            onLayout={(event) => {
              setWidth(event.nativeEvent.layout.width);
            }}
            className="flex-1 border-l border-outline-variant"
          >
            {swipe ? <SwipeTracks {...props} /> : <Tracks {...props} />}
          </View>
        </View>
      </Card>
      {swipe ? (
        <Text variant="caption" tone="variant">
          {pointer
            ? 'Scroll sideways for the rest of the day.'
            : 'Swipe sideways for the rest of the day.'}
        </Text>
      ) : null}
    </>
  );
}

export interface PeopleTimelineProps {
  readonly day: string;
  readonly calendars: readonly string[] | null;
  readonly prefs: Prefs;
  readonly onCreate: (day: string, gap: MinuteSpan) => void;
}

interface BodyProps extends PeopleTimelineProps {
  readonly mode: TimelineMode;
  readonly rows: readonly TimelineRow[] | null;
}

function TimelineBody({ day, prefs, onCreate, mode, rows }: BodyProps): ReactNode {
  const compact = !useCalendarWide();
  const now = useNowMinute(day);
  if (rows === null) return <Skeleton shape="block" />;
  const window = dayWindowOf(prefs.general);
  const gaps = freeGapsOf(
    rows.flatMap((row) => row.spans),
    openWindowOf(window, now),
  );
  return (
    <>
      <TimelineGrid rows={rows} gaps={gaps} layout={{ compact, window, now }} />
      <FreeTimeWell
        gap={gaps[0] ?? null}
        who={mode === 'people' ? 'Everyone is' : 'Every calendar is'}
        onCreate={(gap) => {
          onCreate(day, gap);
        }}
      />
    </>
  );
}

function PeopleRows(props: PeopleTimelineProps): ReactNode {
  const compact = !useCalendarWide();
  return <TimelineBody {...props} mode="people" rows={usePeopleRows(props.day, compact)} />;
}

function CalendarRows(props: PeopleTimelineProps): ReactNode {
  return (
    <TimelineBody {...props} mode="calendars" rows={useCalendarRows(props.day, props.calendars)} />
  );
}

const MODES = [
  { mode: 'people', label: 'People', icon: 'users' },
  { mode: 'calendars', label: 'Calendars', icon: 'calendar' },
] as const;

function ModeChips({
  mode,
  onMode,
}: {
  readonly mode: TimelineMode;
  readonly onMode: (mode: TimelineMode) => void;
}): ReactNode {
  return (
    <View className="flex-row flex-wrap items-center gap-1">
      {MODES.map((entry) => (
        <FilterChip
          key={entry.mode}
          label="Rows"
          value={entry.label}
          icon={entry.icon}
          singleChoice
          active={mode === entry.mode}
          onPress={() => {
            onMode(entry.mode);
          }}
        />
      ))}
    </View>
  );
}

export function PeopleTimeline(props: PeopleTimelineProps): ReactNode {
  const [mode, setMode] = useState<TimelineMode>('people');
  return (
    <View className="gap-3">
      <ModeChips mode={mode} onMode={setMode} />
      {mode === 'people' ? <PeopleRows {...props} /> : <CalendarRows {...props} />}
    </View>
  );
}
