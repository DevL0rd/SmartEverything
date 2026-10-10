import type { WeatherForecast } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import { href } from '../../../app-shell/hrefs';
import { Figure } from '../../../components/figure';
import { Text } from '../../../components/text';
import {
  WidgetFrame,
  WidgetStat,
  WidgetStats,
  heroFigure,
  type WidgetSize,
} from '../../../components/widget-board';
import { useMinute } from '../../../store/clock';
import { DayList } from '../components/forecast-parts';
import { HourStrip } from '../components/hour-strip';
import { WeatherHero } from '../components/weather-hero';
import { WeatherWidgetNotice } from '../components/weather-notice';
import { useWeather } from '../data/use-weather';
import { conditionOf, degrees } from '../model/present';
import { weatherStats } from '../model/stats';
import { WeatherVisual } from '../visual/weather-visual';

const ROOMY_PX = 520;

interface ReadyProps {
  readonly forecast: WeatherForecast;
  readonly now: number;
  readonly stale: boolean;
}

function Small({ forecast, stale }: ReadyProps): ReactNode {
  const { now } = forecast;
  return (
    <View className="flex-1 justify-between">
      <WeatherVisual code={now.code} day={now.isDay} px={48} />
      <View>
        <Figure value={degrees(now.temperatureC)} size={heroFigure('S')} stale={stale} />
        <Text variant="footnote" tone="variant" numberOfLines={2}>
          {conditionOf(now.code)}
        </Text>
      </View>
    </View>
  );
}

function Medium(props: ReadyProps): ReactNode {
  const [range, rain] = weatherStats(props.forecast, props.now);
  return (
    <View className="flex-1 flex-row items-center gap-4">
      <View className="flex-1">
        <WeatherHero forecast={props.forecast} now={props.now} scale="m" stale={props.stale} />
      </View>
      <View className="w-36 gap-3">
        {[range, rain].map((stat) => {
          if (stat === undefined) {
            return null;
          }
          const { key, ...shown } = stat;
          return <WidgetStat key={key} {...shown} />;
        })}
      </View>
    </View>
  );
}

function Wide(props: ReadyProps & { readonly roomy: boolean }): ReactNode {
  if (!props.roomy) {
    return <Medium {...props} />;
  }
  return (
    <View className="flex-1 flex-row items-center gap-6">
      <WeatherHero forecast={props.forecast} now={props.now} scale="m" stale={props.stale} />
      <View className="flex-1">
        <HourStrip forecast={props.forecast} now={props.now} most={8} />
      </View>
    </View>
  );
}

function Large(props: ReadyProps): ReactNode {
  return (
    <View className="flex-1 justify-between gap-3">
      <WeatherHero forecast={props.forecast} now={props.now} scale="m" stale={props.stale} />
      <HourStrip forecast={props.forecast} now={props.now} most={6} />
      <WidgetStats stats={weatherStats(props.forecast, props.now).slice(0, 4)} columns={2} />
    </View>
  );
}

function ExtraLarge(props: ReadyProps & { readonly roomy: boolean }): ReactNode {
  if (!props.roomy) {
    return <Large {...props} />;
  }
  return (
    <View className="flex-1 flex-row gap-6">
      <View className="flex-1 justify-between gap-3">
        <WeatherHero forecast={props.forecast} now={props.now} scale="l" stale={props.stale} />
        <WidgetStats stats={weatherStats(props.forecast, props.now).slice(1)} columns={2} />
      </View>
      <View className="flex-1 justify-between gap-3">
        <HourStrip forecast={props.forecast} now={props.now} most={7} />
        <DayList forecast={props.forecast} now={props.now} count={5} />
      </View>
    </View>
  );
}

function Ready({
  size,
  roomy,
  ...props
}: ReadyProps & { readonly size: WidgetSize; readonly roomy: boolean }): ReactNode {
  switch (size) {
    case 'S':
      return <Small {...props} />;
    case 'M':
      return <Medium {...props} />;
    case 'W':
      return <Wide {...props} roomy={roomy} />;
    case 'L':
      return <Large {...props} />;
    case 'XL':
      return <ExtraLarge {...props} roomy={roomy} />;
  }
}

export function WeatherWidget({ size }: { readonly size: WidgetSize }): ReactNode {
  const view = useWeather();
  const now = useMinute();
  const [width, setWidth] = useState(0);
  const measure = (event: LayoutChangeEvent): void => {
    setWidth(event.nativeEvent.layout.width);
  };
  return (
    <WidgetFrame title="Weather" icon="weather" accent="info" size={size} href={href.weather()}>
      <View className="flex-1" onLayout={measure}>
        {view.kind === 'ready' ? (
          <Ready
            size={size}
            roomy={width >= ROOMY_PX}
            forecast={view.forecast}
            now={now}
            stale={view.stale}
          />
        ) : (
          <WeatherWidgetNotice view={view} size={size} />
        )}
      </View>
    </WidgetFrame>
  );
}
