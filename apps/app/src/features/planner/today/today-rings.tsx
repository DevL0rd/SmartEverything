import type { PlannerDay } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Rings } from '../../../components/charts';
import { Icon } from '../../../components/icon';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { useWeather, conditionIcon, degrees } from '../../weather';
import { percent } from '../../../format/number';
import { usePlannerPreferences, usePlannerStats } from '../data';
import { usePlannerFrame } from '../frame/frame-context';
import { onTimeShareOf, todayRingsOf, type TodayRing, type TodayRingKey } from './day-strip-model';

const DOT: Readonly<Record<TodayRingKey, { readonly drawn: string; readonly open: string }>> = {
  tasks: { drawn: 'bg-primary', open: 'border border-primary' },
  focus: { drawn: 'bg-viz-1', open: 'border border-viz-1' },
  move: { drawn: 'bg-viz-4', open: 'border border-viz-4' },
};

const SIZE = { line: 56, grid: 64, card: 112 } as const;

export type RingsSize = keyof typeof SIZE;

export function useTodayRings(day: PlannerDay, move: number | null): readonly TodayRing[] {
  const { person } = usePlannerFrame();
  const preferences = usePlannerPreferences(person).data;
  return todayRingsOf({
    day,
    workingHours: preferences?.general.working_hours ?? null,
    move,
  });
}

function shown(rings: readonly TodayRing[]): Parameters<typeof Rings>[0]['rings'] {
  return rings.flatMap((ring) =>
    ring.progress === null
      ? []
      : [{ progress: ring.progress, colour: ring.colour, label: ring.label }],
  );
}

function DrawnRings({
  rings,
  size,
}: {
  readonly rings: readonly TodayRing[];
  readonly size: number;
}): ReactNode {
  const drawn = shown(rings);
  return drawn.length === 0 ? null : <Rings rings={drawn} size={size} />;
}

function LegendRow({ ring }: { readonly ring: TodayRing }): ReactNode {
  const dot = DOT[ring.key];
  return (
    <View className="flex-row items-center gap-2">
      <View className={cn('size-2 rounded-full', ring.progress === null ? dot.open : dot.drawn)} />
      <Text variant="footnote" className="min-w-0 flex-1" numberOfLines={1}>
        {ring.label}
      </Text>
      <Text variant="footnote" className="font-sans-medium tabular" numberOfLines={1}>
        {ring.value}
      </Text>
    </View>
  );
}

export function TodayRings({
  rings,
  size,
}: {
  readonly rings: readonly TodayRing[];
  readonly size: Exclude<RingsSize, 'line'>;
}): ReactNode {
  return (
    <View className={cn('flex-row items-center', size === 'card' ? 'gap-4' : 'gap-3')}>
      <DrawnRings rings={rings} size={SIZE[size]} />
      <View className="min-w-0 flex-1 gap-2">
        {rings.map((ring) => (
          <LegendRow key={ring.key} ring={ring} />
        ))}
      </View>
    </View>
  );
}

function summaryOf(rings: readonly TodayRing[], moveTracked: boolean): string {
  const value = (key: TodayRingKey): string => rings.find((ring) => ring.key === key)?.brief ?? '';
  const parts = [`${value('tasks')} done`, `${value('focus')} focus`];
  return [...parts, ...(moveTracked ? [`${value('move')} move`] : [])].join(' · ');
}

function OnTimeLine(): ReactNode {
  const { person } = usePlannerFrame();
  const stats = usePlannerStats(person, 'week').data;
  const share = stats === undefined ? null : onTimeShareOf(stats);
  if (share === null) return null;
  return (
    <Text variant="caption" tone="variant" numberOfLines={1} className="tabular">
      {`${percent(share)} on time this week`}
    </Text>
  );
}

export function WeatherMini(): ReactNode {
  const { person } = usePlannerFrame();
  const preferences = usePlannerPreferences(person).data;
  const view = useWeather();
  if (view.kind !== 'ready' || preferences?.day_planner.show_weather !== true) return null;
  const { now } = view.forecast;
  return (
    <View
      className="flex-row items-center gap-1"
      accessible
      accessibilityLabel={`Outside ${degrees(now.temperatureC)}`}
    >
      <Icon name={conditionIcon(now.code, now.isDay)} size={16} tone="variant" />
      <Text variant="caption" tone="variant" className="tabular">
        {degrees(now.temperatureC)}
      </Text>
    </View>
  );
}

export function TodayRingsLine({
  rings,
  moveTracked,
}: {
  readonly rings: readonly TodayRing[];
  readonly moveTracked: boolean;
}): ReactNode {
  return (
    <View className="flex-row items-center gap-3">
      <DrawnRings rings={rings} size={SIZE.line} />
      <View className="min-w-0 flex-1 gap-0.5">
        <Text variant="footnote" numberOfLines={2} className="tabular">
          {summaryOf(rings, moveTracked)}
        </Text>
        <OnTimeLine />
      </View>
      <WeatherMini />
    </View>
  );
}
