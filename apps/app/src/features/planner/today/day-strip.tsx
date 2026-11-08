import type { GeoPoint, PlannerDay } from '@smarteverything/domain';
import { useRef, type ReactNode } from 'react';
import { View } from 'react-native';
import { Card } from '../../../components/card';
import { StateTimeline } from '../../../components/charts';
import { Text } from '../../../components/text';
import { useMeasuredWidth } from '../../../components/use-measured-width';
import { cn } from '../../../design/cn';
import { clock, hoursMinutes } from '../../../format/time';
import { useSettings } from '../../../store/selectors';
import { usePlannerCollections, usePlannerPreferences, useVisibleMinute } from '../data';
import { usePlannerFrame } from '../frame/frame-context';
import {
  STRIP_COLOURS,
  dayStripOf,
  nowIn,
  type DayStripModel,
  type StripMarkTone,
} from './day-strip-model';

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

function AlarmPins({ placed }: { readonly placed: Placed }): ReactNode {
  return (
    <View className="relative h-2.5">
      {placed.model.alarms.map((at) => (
        <View key={at} style={leftOf(placed, at, 3)} className="absolute top-0 w-1.5 items-center">
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

function HourLabels({ placed }: { readonly placed: Placed }): ReactNode {
  const last = placed.model.hours.length - 1;
  return (
    <View className="relative h-4">
      {placed.model.hours.map((hour, index) => (
        <View
          key={hour.label}
          style={index === 0 || index === last ? undefined : leftOf(placed, hour.at, 16)}
          className={cn(
            'absolute top-0 w-8',
            index === 0 && 'left-0 items-start',
            index === last && 'right-0 items-end',
            index !== 0 && index !== last && 'items-center',
          )}
        >
          <Text variant="caption" tone="faint" className="tabular">
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
  return (
    <View
      ref={ref}
      onLayout={(event) => {
        onLayout(event);
        minute.onLayout?.();
      }}
      className="relative"
    >
      <AlarmPins placed={placed} />
      <StateTimeline
        segments={model.segments}
        colours={STRIP_COLOURS}
        label={model.label}
        empty="Nothing booked today"
        height={compact ? TRACK.compact : TRACK.wide}
        from={model.from}
        to={model.to}
      />
      <TaskMarks placed={placed} />
      <HourLabels placed={placed} />
      {now === null || width === 0 ? null : <NowMarker placed={placed} now={now} />}
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

function StripHeader({
  model,
  timeZone,
}: {
  readonly model: DayStripModel;
  readonly timeZone: string;
}): ReactNode {
  const sun =
    model.sun === null
      ? null
      : `Sunrise ${clock(model.sun.rise, timeZone)} · Sunset ${clock(model.sun.set, timeZone)}`;
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
        <LegendDot dot="bg-viz-3" label="Events" />
        <LegendDot dot="bg-primary" label="Alarms" />
        <LegendDot dot="bg-critical" label="Missed" />
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
