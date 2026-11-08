import type { PlannerDay } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Rings } from '../../../components/charts';
import { Icon } from '../../../components/icon';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { useWeather } from '../../weather';
import { conditionIcon, degrees } from '../../weather/model/present';
import { percent } from '../../../format/number';
import { usePlannerPreferences, usePlannerStats } from '../data';
import { usePlannerFrame } from '../frame/frame-context';
import { onTimeShareOf, todayRingsOf, type TodayRing, type TodayRingKey } from './day-strip-model';

const DOT: Readonly<Record<TodayRingKey, string>> = {
  tasks: 'bg-primary',
  focus: 'bg-viz-1',
  move: 'bg-viz-4',
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
  return rings.map((ring) => ({ progress: ring.progress, colour: ring.colour, label: ring.label }));
}

function LegendRow({ ring }: { readonly ring: TodayRing }): ReactNode {
  return (
    <View className="flex-row items-center gap-2">
      <View className={cn('size-2 rounded-full', DOT[ring.key])} />
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
      <Rings rings={shown(rings)} size={SIZE[size]} />
      <View className="min-w-0 flex-1 gap-2">
        {rings.map((ring) => (
          <LegendRow key={ring.key} ring={ring} />
        ))}
      </View>
    </View>
  );
}

function summaryOf(rings: readonly TodayRing[]): string {
  const value = (key: TodayRingKey): string => rings.find((ring) => ring.key === key)?.brief ?? '';
  return `${value('tasks')} done · ${value('focus')} focus · ${value('move')} move`;
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

export function TodayRingsLine({ rings }: { readonly rings: readonly TodayRing[] }): ReactNode {
  return (
    <View className="flex-row items-center gap-3">
      <Rings rings={shown(rings)} size={SIZE.line} />
      <View className="min-w-0 flex-1 gap-0.5">
        <Text variant="footnote" numberOfLines={2} className="tabular">
          {summaryOf(rings)}
        </Text>
        <OnTimeLine />
      </View>
      <WeatherMini />
    </View>
  );
}
