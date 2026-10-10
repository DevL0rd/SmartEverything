import type { WeatherDay, WeatherForecast, WeatherHour } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Icon } from '../../../components/icon';
import { Text } from '../../../components/text';
import Svg, { Path } from 'react-native-svg';
import { cn } from '../../../design/cn';
import { useColour } from '../../../design/colour';
import { localDayKey } from '../../../format/time';
import { rounded } from '../../device-visuals';
import {
  chanceText,
  conditionColour,
  conditionIcon,
  conditionOf,
  dayName,
  degrees,
  hourName,
} from '../model/present';

export function HourCell({
  hour,
  index,
  timeZone,
  fixed,
}: {
  readonly hour: WeatherHour;
  readonly index: number;
  readonly timeZone: string;
  readonly fixed: boolean;
}): ReactNode {
  const chance = chanceText(hour.precipitationChance);
  return (
    <View
      className={cn('items-center gap-1 py-1', fixed ? 'w-16' : 'min-w-0 flex-1')}
      aria-label={`${hourName(hour, index, timeZone)}, ${degrees(hour.temperatureC)}, ${conditionOf(hour.code)}`}
    >
      <Text variant="caption" tone="variant" numberOfLines={1}>
        {hourName(hour, index, timeZone)}
      </Text>
      <Icon
        name={conditionIcon(hour.code, hour.isDay)}
        size={20}
        colour={conditionColour(hour.code, hour.isDay)}
      />
      <Text variant="callout" numberOfLines={1}>
        {degrees(hour.temperatureC)}
      </Text>
      <Text variant="caption" tone="info" numberOfLines={1}>
        {chance ?? ' '}
      </Text>
    </View>
  );
}

interface Span {
  readonly low: number;
  readonly high: number;
}

function spanOf(days: readonly WeatherDay[]): Span {
  return {
    low: Math.min(...days.map((day) => day.minC)),
    high: Math.max(...days.map((day) => day.maxC)),
  };
}

function RangeBar({ day, span }: { readonly day: WeatherDay; readonly span: Span }): ReactNode {
  const width = Math.max(span.high - span.low, 1);
  const left = ((day.minC - span.low) / width) * 100;
  const right = ((day.maxC - span.low) / width) * 100;
  const track = useColour('surface-3');
  const fill = useColour('temp-warm');
  return (
    <View className="h-1.5 min-w-8 flex-1">
      <View pointerEvents="none" className="absolute inset-0">
        <Svg width="100%" height="100%" viewBox="0 0 100 6" preserveAspectRatio="none">
          <Path d={rounded({ x: 0, y: 0, w: 100, h: 6, r: 3 })} fill={track} />
          <Path
            d={rounded({ x: left, y: 0, w: Math.max(right - left, 3), h: 6, r: 3 })}
            fill={fill}
          />
        </Svg>
      </View>
    </View>
  );
}

function DayRow({
  day,
  today,
  span,
}: {
  readonly day: WeatherDay;
  readonly today: string;
  readonly span: Span;
}): ReactNode {
  const chance = chanceText(day.precipitationChance);
  return (
    <View
      className="min-h-10 flex-row items-center gap-3"
      aria-label={`${dayName(day, today)}, ${conditionOf(day.code)}, high ${degrees(day.maxC)}, low ${degrees(day.minC)}`}
    >
      <Text variant="callout" className="w-12" numberOfLines={1}>
        {dayName(day, today)}
      </Text>
      <View className="w-14 flex-row items-center gap-1">
        <Icon
          name={conditionIcon(day.code, true)}
          size={20}
          colour={conditionColour(day.code, true)}
        />
        <Text variant="caption" tone="info" numberOfLines={1}>
          {chance ?? ''}
        </Text>
      </View>
      <Text variant="callout" tone="variant" className="w-10 text-right" numberOfLines={1}>
        {degrees(day.minC)}
      </Text>
      <RangeBar day={day} span={span} />
      <Text variant="callout" className="w-10" numberOfLines={1}>
        {degrees(day.maxC)}
      </Text>
    </View>
  );
}

export function DayList({
  forecast,
  now,
  count,
}: {
  readonly forecast: WeatherForecast;
  readonly now: number;
  readonly count: number;
}): ReactNode {
  const today = localDayKey(now, forecast.timeZone);
  const days = forecast.daily.filter((day) => day.day >= today).slice(0, count);
  const span = spanOf(days);
  return (
    <View className="gap-0.5">
      {days.map((day) => (
        <DayRow key={day.day} day={day} today={today} span={span} />
      ))}
    </View>
  );
}
