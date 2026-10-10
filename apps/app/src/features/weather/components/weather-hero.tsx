import type { WeatherAir, WeatherForecast } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Dot } from '../../../components/badge';
import { Figure } from '../../../components/figure';
import { Text } from '../../../components/text';
import { aqiLook, conditionOf, degrees, highLow, todayOf } from '../model/present';
import type { VisualPx } from '../../device-visuals';
import { WeatherVisual } from '../visual/weather-visual';

export type HeroScale = 's' | 'm' | 'l';

const VISUAL_PX: Readonly<Record<HeroScale, VisualPx>> = { s: 48, m: 96, l: 168 };

const FIGURE: Readonly<Record<HeroScale, 'm' | 'l' | 'xl'>> = { s: 'm', m: 'l', l: 'xl' };

export function AirChip({ air }: { readonly air: WeatherAir }): ReactNode {
  const aqi = air.now.usAqi;
  if (aqi === null) {
    return null;
  }
  const look = aqiLook(aqi);
  return (
    <View
      className="flex-row items-center gap-1.5"
      aria-label={`Outdoor air ${look.label}, AQI ${look.value}`}
    >
      <Dot tone={look.tone} />
      <Text variant="footnote" tone="variant" numberOfLines={1}>
        {`Air ${look.value} · ${look.label}`}
      </Text>
    </View>
  );
}

export function WeatherHero({
  forecast,
  now,
  scale,
  stale,
}: {
  readonly forecast: WeatherForecast;
  readonly now: number;
  readonly scale: HeroScale;
  readonly stale: boolean;
}): ReactNode {
  const today = todayOf(forecast, now);
  const current = forecast.now;
  return (
    <View className={scale === 's' ? 'gap-1' : 'flex-row items-center gap-4'}>
      <WeatherVisual code={current.code} day={current.isDay} px={VISUAL_PX[scale]} />
      <View className="min-w-0 flex-1 gap-0.5">
        <Figure value={degrees(current.temperatureC)} size={FIGURE[scale]} stale={stale} />
        <Text variant={scale === 's' ? 'footnote' : 'body-strong'} numberOfLines={2}>
          {conditionOf(current.code)}
        </Text>
        {scale === 'l' ? (
          <>
            {today === null ? null : (
              <Text variant="footnote" tone="variant">
                {highLow(today)}
              </Text>
            )}
            <Text variant="footnote" tone="variant">
              {`Feels like ${degrees(current.feelsLikeC)}`}
            </Text>
          </>
        ) : null}
      </View>
    </View>
  );
}
