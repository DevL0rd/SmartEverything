import type { PlannerColourKey, PlannerDay } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Card } from '../../../components/card';
import { Icon, type IconName } from '../../../components/icon';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { clock } from '../../../format/time';
import { useMinute } from '../../../store/clock';
import { LIST_DOT } from '../../planner';
import { useWeather } from '../../weather';
import type { SoundLine } from './ring-lines';
import {
  briefingLinesOf,
  clockPartsOf,
  dateLineOf,
  greetingAt,
  todayRowsOf,
  weatherLineOf,
  type TodayRow,
} from './ring-model';

const RING_TIME = 'font-mono-medium tracking-tighter tabular';

const RING_PERIOD = 'font-mono-medium text-figure-m tabular';

function useWeatherLine(today: string): string | null {
  const weather = useWeather();
  return weather.kind === 'ready' ? weatherLineOf(weather.forecast, today) : null;
}

export function RingHeading({
  icon,
  label,
  today,
  compact,
  subtitle,
}: {
  readonly icon: IconName;
  readonly label: string;
  readonly today: string;
  readonly compact: boolean;
  readonly subtitle: string | null;
}): ReactNode {
  const now = useMinute();
  const weather = useWeatherLine(today);
  const time = clockPartsOf(clock(now));
  return (
    <View className="items-center gap-1">
      <View className="flex-row items-center gap-2">
        <Icon name={icon} size={16} tone="primary" />
        <Text variant="callout" tone="variant" role="heading" numberOfLines={1}>
          {label}
        </Text>
      </View>
      <View role="timer" aria-label={clock(now)} className="flex-row items-baseline gap-2">
        <Text
          className={cn(RING_TIME, compact ? 'text-figure-xl' : 'text-display')}
          numberOfLines={1}
        >
          {time.digits}
        </Text>
        {time.period === null ? null : (
          <Text tone="variant" className={RING_PERIOD} numberOfLines={1}>
            {time.period}
          </Text>
        )}
      </View>
      <Text variant="callout" tone="variant" align="center">
        {subtitle ?? dateLineOf(now, weather)}
      </Text>
    </View>
  );
}

export function SoundLineRow({ line }: { readonly line: SoundLine }): ReactNode {
  const tone = line.fellBack ? 'warning' : 'variant';
  return (
    <View
      role={line.fellBack ? 'alert' : undefined}
      className="flex-row items-center justify-center gap-2 self-center"
    >
      <Icon name={line.icon} size={16} tone={tone} />
      <Text variant="callout" tone={tone} className="shrink" align="center">
        {line.text}
      </Text>
    </View>
  );
}

export function SleepLine({
  sleep,
  centred,
}: {
  readonly sleep: string;
  readonly centred: boolean;
}): ReactNode {
  return (
    <View className={cn('flex-row items-start gap-2', centred && 'self-center')}>
      <View className="h-5 justify-center">
        <Icon name="moon" size={14} tone="variant" />
      </View>
      <Text variant="callout" tone="variant" className="shrink">
        {sleep}
      </Text>
    </View>
  );
}

export function MorningCard({
  day,
  sleep,
}: {
  readonly day: PlannerDay;
  readonly sleep: string | null;
}): ReactNode {
  const now = useMinute();
  const lines = briefingLinesOf(day);
  return (
    <Card className="gap-2 bg-surface-1/80">
      <View className="flex-row items-center gap-2">
        <Icon name="sparkles" size={16} tone="primary" />
        <Text variant="body-strong">{greetingAt(now)}</Text>
      </View>
      {sleep === null ? null : <SleepLine sleep={sleep} centred={false} />}
      {lines.length === 0 ? null : <Text variant="callout">{lines.join(' ')}</Text>}
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
