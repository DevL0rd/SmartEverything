import type { PlannerColourKey, PlannerDay } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Card } from '../../../components/card';
import { Icon, type IconName } from '../../../components/icon';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { clock } from '../../../format/time';
import { useMinute } from '../../../store/clock';
import { LIST_DOT } from '../../planner/item/composer-tokens';
import { useWeather } from '../../weather';
import {
  briefingLinesOf,
  dateLineOf,
  greetingAt,
  todayRowsOf,
  weatherLineOf,
  type TodayRow,
} from './ring-model';

const RING_TIME = 'font-mono-medium text-figure-xl tracking-tighter tabular';

function useWeatherLine(today: string): string | null {
  const weather = useWeather();
  return weather.kind === 'ready' ? weatherLineOf(weather.forecast, today) : null;
}

export function RingHeading({
  icon,
  label,
  today,
}: {
  readonly icon: IconName;
  readonly label: string;
  readonly today: string;
}): ReactNode {
  const now = useMinute();
  const weather = useWeatherLine(today);
  return (
    <View className="items-center gap-1">
      <View className="flex-row items-center gap-2">
        <Icon name={icon} size={16} tone="primary" />
        <Text variant="callout" tone="variant" numberOfLines={1}>
          {label}
        </Text>
      </View>
      <Text role="timer" className={RING_TIME} numberOfLines={1}>
        {clock(now)}
      </Text>
      <Text variant="callout" tone="variant" align="center">
        {dateLineOf(now, weather)}
      </Text>
    </View>
  );
}

export function MorningCard({ day }: { readonly day: PlannerDay }): ReactNode {
  const now = useMinute();
  return (
    <Card className="gap-2 bg-surface-1/80">
      <View className="flex-row items-center gap-2">
        <Icon name="sparkles" size={16} tone="primary" />
        <Text variant="body-strong">{greetingAt(now)}</Text>
      </View>
      <Text variant="callout">{briefingLinesOf(day, now).join(' ')}</Text>
    </Card>
  );
}

function dotOf(colour: PlannerColourKey | null): string {
  return colour === null ? 'bg-on-surface-variant' : LIST_DOT[colour];
}

function TodayLine({ row }: { readonly row: TodayRow }): ReactNode {
  return (
    <View className="min-h-8 flex-row items-center gap-3">
      <Text variant="caption" tone="variant" className="w-12 font-mono tabular" numberOfLines={1}>
        {row.time}
      </Text>
      <View aria-hidden className={cn('size-2 rounded-full', dotOf(row.colour))} />
      <Text variant="callout" numberOfLines={1} className="min-w-0 flex-1">
        {row.title}
      </Text>
    </View>
  );
}

export function TodayList({
  day,
  colours,
}: {
  readonly day: PlannerDay;
  readonly colours: ReadonlyMap<string, PlannerColourKey>;
}): ReactNode {
  const rows = todayRowsOf(day, colours);
  if (rows.length === 0) return null;
  return (
    <View className="gap-2">
      <Text variant="caption" tone="variant">
        Today
      </Text>
      {rows.map((row) => (
        <TodayLine key={row.key} row={row} />
      ))}
    </View>
  );
}
