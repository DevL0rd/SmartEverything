import type { WeatherForecast } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Icon } from '../../../components/icon';
import { Text } from '../../../components/text';
import { clock } from '../../../format/time';
import { sunOf, todayOf } from '../model/present';

function SunTime({
  icon,
  label,
  at,
  timeZone,
}: {
  readonly icon: 'sunrise' | 'sunset';
  readonly label: string;
  readonly at: string;
  readonly timeZone: string;
}): ReactNode {
  return (
    <View className="flex-row items-center gap-1.5" aria-label={`${label} ${clock(at, timeZone)}`}>
      <Icon name={icon} size={16} colour="temp-warm" />
      <Text variant="footnote" tone="variant" numberOfLines={1}>
        {clock(at, timeZone)}
      </Text>
    </View>
  );
}

export function SunTimes({
  forecast,
  now,
}: {
  readonly forecast: WeatherForecast;
  readonly now: number;
}): ReactNode {
  const today = sunOf(todayOf(forecast, now));
  if (today === null) {
    return null;
  }
  return (
    <View className="flex-row gap-4">
      <SunTime icon="sunrise" label="Sunrise" at={today.sunrise} timeZone={forecast.timeZone} />
      <SunTime icon="sunset" label="Sunset" at={today.sunset} timeZone={forecast.timeZone} />
    </View>
  );
}
