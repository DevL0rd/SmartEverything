import type { WeatherForecast } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { href } from '../../../app-shell/hrefs';
import { Figure } from '../../../components/figure';
import { Text } from '../../../components/text';
import {
  WidgetFrame,
  WidgetStat,
  WidgetStats,
  type FrameClass,
} from '../../../components/widget-board';
import { useWidgetFace } from '../../../components/widget-board/use-widget-face';
import { useMinute } from '../../../store/clock';
import { DayList } from '../components/forecast-parts';
import { HourStrip } from '../components/hour-strip';
import { WeatherHero } from '../components/weather-hero';
import { WeatherWidgetNotice } from '../components/weather-notice';
import { LocationPrompt } from './location-prompt';
import { useWeather, type WeatherView } from '../data/use-weather';
import { conditionOf, degrees } from '../model/present';
import { weatherStats } from '../model/stats';
import { WeatherVisual } from '../visual/weather-visual';

const SMALL_ICON_PX = 48;

interface ReadyProps {
  readonly forecast: WeatherForecast;
  readonly now: number;
  readonly stale: boolean;
}

function Small({ forecast, stale }: ReadyProps): ReactNode {
  const { now } = forecast;
  return (
    <View className="flex-1 justify-end">
      <View className="flex-row items-center gap-1.5">
        <WeatherVisual code={now.code} day={now.isDay} px={SMALL_ICON_PX} />
        <Figure value={degrees(now.temperatureC)} size="m" stale={stale} />
      </View>
      <Text variant="footnote" tone="variant" numberOfLines={1}>
        {conditionOf(now.code)}
      </Text>
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

function Wide(props: ReadyProps): ReactNode {
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

function ExtraLarge(props: ReadyProps): ReactNode {
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

function Ready({ cls, ...props }: ReadyProps & { readonly cls: FrameClass }): ReactNode {
  switch (cls) {
    case 's':
      return <Small {...props} />;
    case 'xs':
    case 'm':
      return <Medium {...props} />;
    case 'w':
      return <Wide {...props} />;
    case 'l':
      return <Large {...props} />;
    case 'xl':
      return <ExtraLarge {...props} />;
  }
}

function Notice({
  view,
}: {
  readonly view: Exclude<WeatherView, { readonly kind: 'ready' }>;
}): ReactNode {
  const { cls } = useWidgetFace();
  if (cls === 's' && view.kind === 'no_location') {
    return <LocationPrompt canSet={view.canSet} />;
  }
  return <WeatherWidgetNotice view={view} />;
}

export function WeatherWidget(): ReactNode {
  const view = useWeather();
  const now = useMinute();
  const { cls } = useWidgetFace();
  return (
    <WidgetFrame title="Weather" icon="weather" accent="info" href={href.weather()}>
      {view.kind === 'ready' ? (
        <Ready cls={cls} forecast={view.forecast} now={now} stale={view.stale} />
      ) : (
        <Notice view={view} />
      )}
    </WidgetFrame>
  );
}
