import type { GeoPoint, PlannerDay } from '@smarteverything/domain';
import { useRef, type ReactNode } from 'react';
import { View } from 'react-native';
import { Card } from '../../../components/card';
import { StateTimeline } from '../../../components/charts';
import { Text } from '../../../components/text';
import { useMeasuredWidth } from '../../../components/use-measured-width';
import { cn } from '../../../design/cn';
import { useColour } from '../../../design/colour';
import { hoursMinutes } from '../../../format/time';
import { useHour24 } from '../../../store/clock-format';
import { useSettings } from '../../../store/selectors';
import { usePlannerCollections, usePlannerPreferences, useVisibleMinute } from '../data';
import { useClockFormat, useInstantClock } from '../../clock/format/clock-format';
import { usePlannerFrame } from '../frame/frame-context';
import {
  STRIP_COLOURS,
  dayStripOf,
  nowIn,
  type DayStripModel,
  type StripMarkTone,
  type StripState,
} from './day-strip-model';
import { alarmPinsOf } from './day-strip-pins';

const TRACK = { compact: 20, wide: 26 } as const;

const MARK: Readonly<Record<StripMarkTone, string>> = {
  done: 'bg-positive',
  missed: 'bg-critical',
  open: 'bg-on-surface-faint',
};

interface Placed {
  readonly model: DayStripModel;
  readonly width: number;
}

function xOf({ model, width }: Placed, at: number): number {
  return ((at - model.from) / Math.max(1, model.to - model.from)) * width;
}

function leftOf(placed: Placed, at: number, half: number): { readonly left: number } {
  return { left: xOf(placed, at) - half };
}

const PIN_SLOT = 12;

function AlarmPins({ placed }: { readonly placed: Placed }): ReactNode {
  const instant = useInstantClock();
  return (
    <View className="relative h-2.5">
      {alarmPinsOf(placed.model, placed.width, PIN_SLOT, instant).map((pin) => (
        <View
          key={pin.at}
          accessible
          accessibilityRole="image"
          accessibilityLabel={pin.label}
          style={leftOf(placed, pin.at, PIN_SLOT / 2)}
          className="absolute top-0 w-3 items-center"
        >
          {pin.count === 1 ? null : (
            <Text variant="caption" tone="primary" className="absolute bottom-full tabular-nums">
              {String(pin.count)}
            </Text>
          )}
          <View className="size-1.5 rounded-full bg-primary" />
          <View className="h-1 w-px bg-primary" />
        </View>
      ))}
    </View>
  );
}

function TaskMarks({ placed }: { readonly placed: Placed }): ReactNode {
  return (
    <View className="relative h-3">
      {placed.model.marks.map((mark, index) => (
        <View
          key={`${String(mark.at)}-${String(index)}`}
          style={leftOf(placed, mark.at, 3)}
          className={cn('absolute top-1.5 size-1.5 rounded-full', MARK[mark.tone])}
        />
      ))}
    </View>
  );
}

const HOUR_LABEL = {
  hour24: { width: 'w-8', half: 16 },
  hour12: { width: 'w-12', half: 24 },
} as const;

function HourLabels({ placed }: { readonly placed: Placed }): ReactNode {
  const last = placed.model.hours.length - 1;
  const box = useHour24() ? HOUR_LABEL.hour24 : HOUR_LABEL.hour12;
  return (
    <View className="relative h-4">
      {placed.model.hours.map((hour, index) => (
        <View
          key={hour.at}
          style={index === 0 || index === last ? undefined : leftOf(placed, hour.at, box.half)}
          className={cn(
            'absolute top-0',
            box.width,
            index === 0 && 'left-0 items-start',
            index === last && 'right-0 items-end',
            index !== 0 && index !== last && 'items-center',
          )}
        >
          <Text variant="caption" tone="faint" className="tabular" numberOfLines={1}>
            {hour.label}
          </Text>
        </View>
      ))}
    </View>
  );
}

function NowMarker({ placed, now }: { readonly placed: Placed; readonly now: number }): ReactNode {
  return (
    <View
      pointerEvents="none"
      style={leftOf(placed, now, 1)}
      className="absolute bottom-4 top-0 w-0.5 items-center"
    >
      <View className="size-1.5 rounded-full bg-on-surface" />
      <View className="w-0.5 flex-1 rounded-full bg-on-surface" />
    </View>
  );
}

function EmptyTrack({ height }: { readonly height: number }): ReactNode {
  const box = { height };
  return (
    <View aria-hidden style={box} className="w-full justify-center">
      <View className="border-t border-dashed border-outline" />
    </View>
  );
}

function NothingBooked(): ReactNode {
  return (
    <View className="items-center">
      <Text variant="caption" tone="variant">
        Nothing booked today
      </Text>
    </View>
  );
}

export function DayStrip({
  model,
  compact,
}: {
  readonly model: DayStripModel;
  readonly compact: boolean;
}): ReactNode {
  const ref = useRef<View>(null);
  const minute = useVisibleMinute(ref);
  const { width, onLayout } = useMeasuredWidth();
  const placed = { model, width };
  const now = nowIn(model, minute.value);
  const empty = model.segments.length === 0;
  const height = compact ? TRACK.compact : TRACK.wide;
  return (
    <View className="gap-1">
      <View
        ref={ref}
        onLayout={(event) => {
          onLayout(event);
          minute.onLayout?.();
        }}
        className="relative"
      >
        <AlarmPins placed={placed} />
        {empty ? (
          <EmptyTrack height={height} />
        ) : (
          <StateTimeline
            segments={model.segments}
            colours={STRIP_COLOURS}
            label={model.label}
            height={height}
            from={model.from}
            to={model.to}
          />
        )}
        <TaskMarks placed={placed} />
        <HourLabels placed={placed} />
        {now === null || width === 0 ? null : <NowMarker placed={placed} now={now} />}
      </View>
      {empty ? <NothingBooked /> : null}
    </View>
  );
}

function LegendDot({ dot, label }: { readonly dot: string; readonly label: string }): ReactNode {
  return (
    <View className="flex-row items-center gap-1.5">
      <View className={cn('size-2 rounded-full', dot)} />
      <Text variant="caption" tone="variant" numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

function EventLegendDot({
  state,
  label,
}: {
  readonly state: StripState;
  readonly label: string;
}): ReactNode {
  const fill = { backgroundColor: useColour(STRIP_COLOURS[state]) };
  return (
    <View className="flex-row items-center gap-1.5">
      <View style={fill} className="size-2 rounded-full" />
      <Text variant="caption" tone="variant" numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

function StripHeader({
  model,
  timeZone,
}: {
  readonly model: DayStripModel;
  readonly timeZone: string;
}): ReactNode {
  const instant = useInstantClock();
  const sun =
    model.sun === null
      ? null
      : `Sunrise ${instant(model.sun.rise, timeZone)} · Sunset ${instant(model.sun.set, timeZone)}`;
  return (
    <View className="flex-row flex-wrap items-center justify-between gap-x-4 gap-y-1">
      <View className="flex-row items-baseline gap-3">
        <Text variant="label">Your day</Text>
        {sun === null ? null : (
          <Text variant="caption" tone="variant" className="tabular">
            {sun}
          </Text>
        )}
      </View>
      <View className="flex-row flex-wrap items-center gap-x-4 gap-y-1">
        {model.sleepMinutes > 0 ? (
          <LegendDot dot="bg-sleep-band" label={`Slept ${hoursMinutes(model.sleepMinutes)}`} />
        ) : null}
        {model.eventLegend.map((entry) => (
          <EventLegendDot key={entry.key} state={entry.state} label={entry.label} />
        ))}
        {model.alarms.length > 0 ? <LegendDot dot="bg-primary" label="Alarms" /> : null}
        {model.marks.some((mark) => mark.tone === 'missed') ? (
          <LegendDot dot="bg-critical" label="Missed" />
        ) : null}
      </View>
    </View>
  );
}

function placeOf(latitude: number | null, longitude: number | null): GeoPoint | null {
  return latitude === null || longitude === null ? null : { latitude, longitude };
}

export function useDayStrip(day: PlannerDay): DayStripModel {
  const { person } = usePlannerFrame();
  const collections = usePlannerCollections(person);
  const preferences = usePlannerPreferences(person).data;
  const { latitude, longitude } = useSettings();
  return dayStripOf({
    day,
    collections,
    place: placeOf(latitude, longitude),
    showSleep: preferences?.day_planner.show_sleep === true,
    format: useClockFormat(),
  });
}

export function DayStripCard({
  day,
  compact,
  children,
}: {
  readonly day: PlannerDay;
  readonly compact: boolean;
  readonly children?: ReactNode;
}): ReactNode {
  const model = useDayStrip(day);
  return (
    <Card>
      {compact ? null : <StripHeader model={model} timeZone={day.time_zone} />}
      <DayStrip model={model} compact={compact} />
      {children === undefined ? null : (
        <>
          <View className="h-hairline bg-outline-variant" />
          {children}
        </>
      )}
    </Card>
  );
}
