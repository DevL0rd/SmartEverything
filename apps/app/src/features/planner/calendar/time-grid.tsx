import type {
  PlannerAlarmRow,
  PlannerCollectionRow,
  PlannerOccurrenceView,
} from '@smarteverything/domain';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, type AnimatedRef } from 'react-native-reanimated';
import { Card } from '../../../components/card';
import { notify } from '../../../components/toast-store';
import { useIdiom } from '../../../design/platform';
import { localDayKey } from '../../../format/time';
import { useHour24, useInstantClock, type InstantClock } from '../../../store/clock-format';
import { useVisibleMinuteOf } from '../data';
import { PILL_HEIGHT } from './alarm-clusters';
import type { EventLook } from './calendars-model';
import { DayColumn, type Drafting } from './day-column';
import type { SlotRange } from './drag-create';
import { DayHeads, HourColumn, HourLines, gutterWidthOf, type HeadShape } from './grid-frame';
import { touchActionOf, useHourZoom, type BlockChange, type MinuteSpan } from './grid-gestures';
import { NowLine } from './now-line';
import {
  DAY_MINUTES,
  HOUR_HEIGHT,
  alarmPinsOf,
  anyAllDay,
  gridDaysOf,
  minMinutesFor,
  samePins,
  yOf,
  type AlarmPin as Pin,
  type GridDay,
  type SleepNight,
  type WorkingHours,
} from './time-grid-layout';

export interface TimeGridProps {
  readonly days: readonly string[];
  readonly occurrences: readonly PlannerOccurrenceView[];
  readonly collections: readonly PlannerCollectionRow[];
  readonly alarms: readonly PlannerAlarmRow[];
  readonly workingHours: WorkingHours | null;
  readonly sleep: readonly SleepNight[];
  readonly timeZone: string;
  readonly startMinute: number;
  readonly readOnlyOf: (occurrence: PlannerOccurrenceView) => boolean;
  readonly lookOf: (occurrence: PlannerOccurrenceView) => EventLook;
  readonly held: SlotRange | null;
  readonly onCreate: (day: string, span: MinuteSpan) => void;
  readonly onMove: (change: BlockChange) => Promise<unknown>;
}

interface Live {
  readonly today: string;
  readonly pins: readonly Pin[];
}

function sameLive(left: Live, right: Live): boolean {
  return left.today === right.today && samePins(left.pins, right.pins);
}

const START_ROOM = PILL_HEIGHT + 4;

const TAPPED_SLOT_MINUTES = 60;

export function firstShownMinuteOf(startMinute: number, pins: readonly Pin[]): number {
  return pins.reduce((first, pin) => Math.min(first, pin.minute), startMinute);
}

function useStartScroll(
  scroll: AnimatedRef<Animated.ScrollView>,
  firstMinute: number,
  hourHeight: number,
): (height: number) => void {
  const [viewport, setViewport] = useState(0);
  useEffect(() => {
    if (viewport === 0) return;
    scroll.current?.scrollTo({
      y: Math.max(0, yOf(firstMinute, hourHeight) - START_ROOM),
      animated: false,
    });
  }, [scroll, viewport, firstMinute, hourHeight]);
  return setViewport;
}

function slotSpanOf(minute: number): MinuteSpan {
  return { from: minute, to: Math.min(DAY_MINUTES, minute + TAPPED_SLOT_MINUTES) };
}

function useDrafting(
  onCreate: (day: string, span: MinuteSpan) => void,
  held: SlotRange | null,
): Drafting {
  const [draft, setDraft] = useState<SlotRange | null>(null);
  return {
    draft: draft ?? held,
    onDraft: setDraft,
    onCreate: (made): void => {
      setDraft(null);
      onCreate(made.date, made);
    },
    onSlot: (slot): void => {
      onCreate(slot.date, slotSpanOf(slot.minute));
    },
  };
}

function useMoves(onMove: (change: BlockChange) => Promise<unknown>): {
  readonly revision: number;
  readonly move: (change: BlockChange) => void;
} {
  const [revision, setRevision] = useState(0);
  return {
    revision,
    move: (change): void => {
      onMove(change).catch((error: unknown) => {
        setRevision((current) => current + 1);
        notify({
          message: `${change.block.occurrence.title} was not moved`,
          error,
          tone: 'critical',
        });
      });
    },
  };
}

interface BodyProps {
  readonly pins: readonly Pin[];
  readonly view: TimeGridProps;
  readonly today: string;
  readonly compact: boolean;
  readonly initialHeight: number;
}

function daysAt(
  view: TimeGridProps,
  today: string,
  hourHeight: number,
  instant: InstantClock,
): readonly GridDay[] {
  return gridDaysOf({ ...view, today, minMinutes: minMinutesFor(hourHeight), instant });
}

function GridBody({ pins, view, today, compact, initialHeight }: BodyProps): ReactNode {
  const { hourHeight, settled, scroll, gesture, onViewport } = useHourZoom(initialHeight);
  const onStart = useStartScroll(scroll, firstShownMinuteOf(view.startMinute, pins), initialHeight);
  const drafting = useDrafting(view.onCreate, view.held);
  const moves = useMoves(view.onMove);
  const tall = useAnimatedStyle(() => ({ height: (DAY_MINUTES / 60) * hourHeight.get() }));
  const instantClock = useInstantClock();
  const days = daysAt(view, today, settled, instantClock);
  const geometry = { compact, hourHeight: settled };
  return (
    <GestureDetector gesture={gesture} touchAction={touchActionOf(compact)}>
      <Animated.ScrollView
        ref={scroll}
        nestedScrollEnabled
        scrollEventThrottle={16}
        onLayout={(event) => {
          const { height } = event.nativeEvent.layout;
          onStart(height);
          onViewport(height);
        }}
        className="flex-1"
      >
        <Animated.View style={tall} className="flex-row">
          <HourColumn geometry={geometry} />
          <View className="relative flex-1 flex-row">
            <HourLines hourHeight={settled} />
            {days.map((day, index) => (
              <DayColumn
                key={day.date}
                day={day}
                index={index}
                count={days.length}
                pins={pins.filter((pin) => pin.date === day.date)}
                geometry={geometry}
                height={hourHeight}
                drafting={drafting}
                revision={moves.revision}
                onMove={moves.move}
              />
            ))}
            <NowLine days={view.days} timeZone={view.timeZone} hourHeight={settled} />
          </View>
        </Animated.View>
      </Animated.ScrollView>
    </GestureDetector>
  );
}

export function TimeGrid(props: TimeGridProps): ReactNode {
  const compact = useIdiom() === 'touch';
  const initialHeight = compact ? HOUR_HEIGHT.touch : HOUR_HEIGHT.pointer;
  const ref = useRef<View>(null);
  const live = useVisibleMinuteOf(
    ref,
    (now): Live => ({
      today: localDayKey(now, props.timeZone),
      pins: alarmPinsOf(props.alarms, props.days, now, props.timeZone),
    }),
    sameLive,
  );
  const [width, setWidth] = useState(0);
  const instantClock = useInstantClock();
  const hour24 = useHour24();
  const heads = daysAt(props, live.value.today, initialHeight, instantClock);
  const shape: HeadShape = {
    compact,
    columns: heads.length,
    columnWidth: (width - gutterWidthOf(compact, hour24)) / heads.length,
    allDay: anyAllDay(heads),
  };
  return (
    <Card padding="none" className="flex-1 overflow-hidden">
      <View
        ref={ref}
        onLayout={(event) => {
          live.onLayout?.();
          setWidth(event.nativeEvent.layout.width);
        }}
        className="flex-1"
      >
        <DayHeads days={heads} shape={shape} />
        <GridBody
          pins={live.value.pins}
          view={props}
          today={live.value.today}
          compact={compact}
          initialHeight={initialHeight}
        />
      </View>
    </Card>
  );
}
