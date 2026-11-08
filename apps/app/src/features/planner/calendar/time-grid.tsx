import type {
  PlannerAlarmRow,
  PlannerCollectionRow,
  PlannerOccurrenceView,
} from '@smarteverything/domain';
import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { ScrollView, View } from 'react-native';
import { Card } from '../../../components/card';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { useIdiom } from '../../../design/platform';
import { localDayKey } from '../../../format/time';
import { useVisibleMinuteOf } from '../data';
import { AlarmPin, PILL_HEIGHT } from './alarm-pin';
import { AllDayChip, EventBlock } from './event-block';
import { NowLine } from './now-line';
import {
  DAY_MINUTES,
  HOUR_HEIGHT,
  MIN_BLOCK_HEIGHT,
  alarmPinsOf,
  bandStyle,
  gridDaysOf,
  minMinutesFor,
  samePins,
  topStyle,
  yOf,
  type AlarmPin as Pin,
  type GridDay,
  type WorkingHours,
} from './time-grid-layout';

export interface TimeGridProps {
  readonly days: readonly string[];
  readonly occurrences: readonly PlannerOccurrenceView[];
  readonly collections: readonly PlannerCollectionRow[];
  readonly alarms: readonly PlannerAlarmRow[];
  readonly workingHours: WorkingHours | null;
  readonly timeZone: string;
  readonly startMinute: number;
  readonly readOnlyOf: (occurrence: PlannerOccurrenceView) => boolean;
  readonly hourHeight?: number;
}

interface Live {
  readonly today: string;
  readonly pins: readonly Pin[];
}

function sameLive(left: Live, right: Live): boolean {
  return left.today === right.today && samePins(left.pins, right.pins);
}

interface Geometry {
  readonly compact: boolean;
  readonly hourHeight: number;
}

const LABEL_HALF = 8;

const START_ROOM = PILL_HEIGHT + 4;

interface HourLabel {
  readonly hour: number;
  readonly label: string;
}

function hourLabelsOf(compact: boolean): readonly HourLabel[] {
  return Array.from({ length: 23 }, (_, index) => {
    const hour = index + 1;
    const label = String(hour).padStart(2, '0');
    return { hour, label: compact ? label : `${label}:00` };
  });
}

const GUTTER = { compact: 'w-10', wide: 'w-13' } as const;

function gutterOf(compact: boolean): string {
  return compact ? GUTTER.compact : GUTTER.wide;
}

function DayHead({
  day,
  compact,
}: {
  readonly day: GridDay;
  readonly compact: boolean;
}): ReactNode {
  const tone = day.today ? 'primary' : 'default';
  return (
    <View
      className={cn(
        'flex-1 gap-1 border-l border-outline-variant',
        compact ? 'px-2 py-1.5' : 'px-2.5 pb-2 pt-2.5',
      )}
    >
      {compact ? (
        <Text variant="label" tone={tone} numberOfLines={1} className="tabular">
          {`${day.weekday} ${day.number}`}
        </Text>
      ) : (
        <View>
          <Text variant="caption" tone="variant">
            {day.weekday}
          </Text>
          <Text variant="title-2" tone={tone} className="tabular">
            {day.number}
          </Text>
        </View>
      )}
      <View className="min-h-5 gap-1">
        {day.allDay.map((entry) => (
          <AllDayChip key={entry.key} entry={entry} />
        ))}
      </View>
    </View>
  );
}

function DayHeads({
  days,
  compact,
}: {
  readonly days: readonly GridDay[];
  readonly compact: boolean;
}): ReactNode {
  return (
    <View className="flex-row border-b border-outline-variant">
      <View className={gutterOf(compact)} />
      {days.map((day) => (
        <DayHead key={day.date} day={day} compact={compact} />
      ))}
    </View>
  );
}

function HourColumn({ geometry }: { readonly geometry: Geometry }): ReactNode {
  return (
    <View aria-hidden className={cn('relative', gutterOf(geometry.compact))}>
      {hourLabelsOf(geometry.compact).map((hour) => (
        <View
          key={hour.hour}
          style={topStyle(yOf(hour.hour * 60, geometry.hourHeight) - LABEL_HALF)}
          className="absolute inset-x-0 h-4 items-end pr-1.5"
        >
          <Text variant="caption" tone="faint" className="font-mono tabular">
            {hour.label}
          </Text>
        </View>
      ))}
    </View>
  );
}

function HourLines({ hourHeight }: { readonly hourHeight: number }): ReactNode {
  return (
    <View aria-hidden pointerEvents="none" className="absolute inset-0">
      {hourLabelsOf(true).map((hour) => (
        <View
          key={hour.hour}
          style={topStyle(yOf(hour.hour * 60, hourHeight))}
          className="absolute inset-x-0 h-hairline bg-outline-variant"
        />
      ))}
    </View>
  );
}

function WorkingTint({
  day,
  hourHeight,
}: {
  readonly day: GridDay;
  readonly hourHeight: number;
}): ReactNode {
  if (day.working === null) return null;
  return (
    <View
      aria-hidden
      pointerEvents="none"
      style={bandStyle(day.working.from, day.working.to, hourHeight)}
      className="absolute inset-x-0 bg-primary/7"
    />
  );
}

function DayColumn({
  day,
  pins,
  geometry,
}: {
  readonly day: GridDay;
  readonly pins: readonly Pin[];
  readonly geometry: Geometry;
}): ReactNode {
  return (
    <View className="relative flex-1 border-l border-outline-variant">
      <WorkingTint day={day} hourHeight={geometry.hourHeight} />
      {day.blocks.map((block) => (
        <EventBlock
          key={block.key}
          block={block}
          hourHeight={geometry.hourHeight}
          minHeight={MIN_BLOCK_HEIGHT}
          compact={geometry.compact}
        />
      ))}
      {pins.map((pin) => (
        <AlarmPin
          key={pin.key}
          pin={pin}
          hourHeight={geometry.hourHeight}
          compact={geometry.compact}
        />
      ))}
    </View>
  );
}

interface StartScroll {
  readonly scroll: RefObject<ScrollView | null>;
  readonly onViewport: (height: number) => void;
}

function useStartScroll(startMinute: number, hourHeight: number): StartScroll {
  const scroll = useRef<ScrollView>(null);
  const [viewport, setViewport] = useState(0);
  useEffect(() => {
    if (viewport === 0) return;
    scroll.current?.scrollTo({
      y: Math.max(0, yOf(startMinute, hourHeight) - START_ROOM),
      animated: false,
    });
  }, [viewport, startMinute, hourHeight]);
  return { scroll, onViewport: setViewport };
}

function GridBody({
  days,
  pins,
  view,
  geometry,
}: {
  readonly days: readonly GridDay[];
  readonly pins: readonly Pin[];
  readonly view: Pick<TimeGridProps, 'days' | 'timeZone' | 'startMinute'>;
  readonly geometry: Geometry;
}): ReactNode {
  const { scroll, onViewport } = useStartScroll(view.startMinute, geometry.hourHeight);
  return (
    <ScrollView
      ref={scroll}
      nestedScrollEnabled
      onLayout={(event) => {
        onViewport(event.nativeEvent.layout.height);
      }}
      className="flex-1"
    >
      <View style={bandStyle(0, DAY_MINUTES, geometry.hourHeight)} className="flex-row">
        <HourColumn geometry={geometry} />
        <View className="relative flex-1 flex-row">
          <HourLines hourHeight={geometry.hourHeight} />
          {days.map((day) => (
            <DayColumn
              key={day.date}
              day={day}
              pins={pins.filter((pin) => pin.date === day.date)}
              geometry={geometry}
            />
          ))}
          <NowLine days={view.days} timeZone={view.timeZone} hourHeight={geometry.hourHeight} />
        </View>
      </View>
    </ScrollView>
  );
}

export function TimeGrid(props: TimeGridProps): ReactNode {
  const compact = useIdiom() === 'touch';
  const hourHeight = props.hourHeight ?? (compact ? HOUR_HEIGHT.touch : HOUR_HEIGHT.pointer);
  const ref = useRef<View>(null);
  const live = useVisibleMinuteOf(
    ref,
    (now): Live => ({
      today: localDayKey(now, props.timeZone),
      pins: alarmPinsOf(props.alarms, props.days, now, props.timeZone),
    }),
    sameLive,
  );
  const days = gridDaysOf({
    ...props,
    today: live.value.today,
    minMinutes: minMinutesFor(hourHeight),
  });
  return (
    <Card padding="none" className="flex-1 overflow-hidden">
      <View ref={ref} onLayout={live.onLayout} className="flex-1">
        <DayHeads days={days} compact={compact} />
        <GridBody
          days={days}
          pins={live.value.pins}
          view={props}
          geometry={{ compact, hourHeight }}
        />
      </View>
    </Card>
  );
}
