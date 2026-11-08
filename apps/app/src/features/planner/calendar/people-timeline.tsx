import type { PlannerColourKey, PlannerRange } from '@smarteverything/domain';
import { useQueries, type UseQueryResult } from '@tanstack/react-query';
import { useRef, useState, type ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { Card } from '../../../components/card';
import { FilterChip } from '../../../components/filter-chip';
import { Icon } from '../../../components/icon';
import { Skeleton } from '../../../components/skeleton';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { useScreenPaused } from '../../../design/screen-pause';
import { useAreaWidth } from '../../../design/size-class';
import { clockOfMinutes, shiftDay, zonedStartOfDay } from '../../../format/time';
import { useRows, useSettings } from '../../../store/selectors';
import { useStoreSelector } from '../../../store/store-context';
import { ProfileAvatar } from '../../profiles';
import { rangeQuery, usePlannerCollections, usePlannerRange, type PlannerPerson } from '../data';
import { usePlannerFrame } from '../frame/frame-context';
import { frameLayoutOf } from '../frame/sections';
import { LIST_DOT } from '../item/composer-tokens';
import type { Prefs } from '../settings/preferences';
import { eventFill } from './event-block';
import type { MinuteSpan } from './grid-gestures';
import {
  FreeTimeWell,
  busyOf,
  dayWindowOf,
  freeGapsOf,
  openWindowOf,
  useNowMinute,
} from './calendar-stats';
import { timedSpansOn, type GridSpan } from './time-grid-layout';

export type TimelineMode = 'people' | 'calendars';

interface TimelineRow {
  readonly key: string;
  readonly name: string;
  readonly leading: ReactNode;
  readonly spans: readonly GridSpan[];
}

const HOUR_WIDTH_TOUCH = 64;

function share(minutes: number, window: MinuteSpan): `${number}%` {
  return `${(minutes / (window.to - window.from)) * 100}%`;
}

export function barOf(
  span: MinuteSpan,
  window: MinuteSpan,
): { readonly left: `${number}%`; readonly width: `${number}%` } | null {
  const from = Math.max(span.from, window.from);
  const to = Math.min(span.to, window.to);
  if (to <= from) return null;
  return { left: share(from - window.from, window), width: share(to - from, window) };
}

export function hourMarksOf(window: MinuteSpan): readonly number[] {
  const first = window.from / 60;
  return Array.from({ length: (window.to - window.from) / 60 }, (_, index) => first + index);
}

function useDayWindow(day: string): { readonly from: string; readonly to: string } {
  const timeZone = useSettings().time_zone;
  return {
    from: new Date(zonedStartOfDay(day, timeZone)).toISOString(),
    to: new Date(zonedStartOfDay(shiftDay(day, 1), timeZone)).toISOString(),
  };
}

function usePeopleRows(day: string): readonly TimelineRow[] | null {
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
    leading: <ProfileAvatar profile={profile} />,
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
  const shown = usePlannerCollections(person).filter(
    (collection) => collection.kind === 'calendar' && collection.visible,
  );
  if (query.data === undefined) return null;
  const spans = timedSpansOn(busyOf(query.data.occurrences), day, timeZone);
  return shown.map((collection) => ({
    key: collection.id,
    name: collection.name,
    leading: <View className={cn('size-2.5 rounded-full', LIST_DOT[collection.colour])} />,
    spans: spans.filter((span) => span.occurrence.collection_id === collection.id),
  }));
}

function useColours(): (collectionId: string) => PlannerColourKey | null {
  const collections = useRows('planner_collections');
  return (collectionId) =>
    collections.find((collection) => collection.id === collectionId)?.colour ?? null;
}

function rowLabelOf(row: TimelineRow): string {
  if (row.spans.length === 0) return `${row.name}: free all day`;
  const parts = row.spans.map(
    (span) => `${span.occurrence.title} ${clockOfMinutes(span.from)} to ${clockOfMinutes(span.to)}`,
  );
  return `${row.name}: ${parts.join(', ')}`;
}

type Place = NonNullable<ReturnType<typeof barOf>>;

function Bar({
  place,
  title,
  fill,
}: {
  readonly place: Place;
  readonly title: string;
  readonly fill: string | null;
}): ReactNode {
  return (
    <View
      style={place}
      className={cn(
        'absolute bottom-1.5 top-1.5 justify-center overflow-hidden rounded-sm px-1.5',
        fill ?? 'border border-outline bg-surface-2',
      )}
    >
      <Text variant="caption" tone={fill === null ? 'variant' : 'default'} numberOfLines={1}>
        {title}
      </Text>
    </View>
  );
}

function Bars({
  row,
  window,
}: {
  readonly row: TimelineRow;
  readonly window: MinuteSpan;
}): ReactNode {
  const colourOf = useColours();
  return row.spans.map((span) => {
    const place = barOf(span, window);
    const fill = eventFill(colourOf(span.occurrence.collection_id), false);
    return place === null ? null : (
      <Bar key={span.key} place={place} title={span.occurrence.title} fill={fill} />
    );
  });
}

function FreeBars({
  gaps,
  window,
}: {
  readonly gaps: readonly MinuteSpan[];
  readonly window: MinuteSpan;
}): ReactNode {
  return gaps.map((gap) => {
    const place = barOf(gap, window);
    return place === null ? null : (
      <Bar key={`${String(gap.from)}-${String(gap.to)}`} place={place} title="Free" fill={null} />
    );
  });
}

interface Layout {
  readonly compact: boolean;
  readonly window: MinuteSpan;
  readonly now: number | null;
}

function TrackLines({ window }: { readonly window: MinuteSpan }): ReactNode {
  return (
    <View aria-hidden pointerEvents="none" className="absolute inset-0 flex-row">
      {hourMarksOf(window).map((hour) => (
        <View key={hour} className="flex-1 border-l border-outline-variant" />
      ))}
    </View>
  );
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
          <Bars row={row} window={layout.window} />
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
    <View aria-hidden className={compact ? 'w-24' : 'w-40'}>
      <View className="h-7 border-b border-outline-variant" />
      {[
        ...rows,
        { key: 'free', name: 'Free', leading: <Icon name="users" size={16} tone="variant" /> },
      ].map((row) => (
        <View
          key={row.key}
          className={cn(
            'flex-row items-center gap-2 border-b border-outline-variant px-3',
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
  const width = { width: hourMarksOf(props.layout.window).length * HOUR_WIDTH_TOUCH };
  return (
    <ScrollView
      ref={scroll}
      horizontal
      showsHorizontalScrollIndicator={false}
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

function TimelineGrid(props: GridProps): ReactNode {
  return (
    <Card padding="none" className="overflow-hidden">
      <View className="flex-row">
        <Labels rows={props.rows} compact={props.layout.compact} />
        {props.layout.compact ? (
          <SwipeTracks {...props} />
        ) : (
          <View className="flex-1 border-l border-outline-variant">
            <Tracks {...props} />
          </View>
        )}
      </View>
    </Card>
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
  const compact = frameLayoutOf(useAreaWidth()) === 'compact';
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
      {compact ? (
        <Text variant="caption" tone="variant">
          Swipe sideways for the rest of the day.
        </Text>
      ) : null}
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
  return <TimelineBody {...props} mode="people" rows={usePeopleRows(props.day)} />;
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
