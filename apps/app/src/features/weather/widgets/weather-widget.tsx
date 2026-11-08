import type { WeatherForecast } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { href } from '../../../app-shell/hrefs';
import { Figure } from '../../../components/figure';
import { Text } from '../../../components/text';
import { WidgetFrame, widgetBodyHeight, type FrameClass } from '../../../components/widget-board';
import { useWidgetFace } from '../../../components/widget-board/use-widget-face';
import { useMinute } from '../../../store/clock';
import { fitVisualPx } from '../../device-visuals';
import { HourStrip } from '../components/hour-strip';
import { WeatherHero } from '../components/weather-hero';
import { WeatherWidgetNotice } from '../components/weather-notice';
import { LocationPrompt } from './location-prompt';
import { FittedDays, FittedStats } from './fit';
import { useWeather, type WeatherView } from '../data/use-weather';
import { conditionOf, degrees } from '../model/present';
import { weatherStats } from '../model/stats';
import { WeatherVisual } from '../visual/weather-visual';

const SMALL_ICON_PX = 48;

const ROW_ICON_MAX = 96;

interface ReadyProps {
  readonly forecast: WeatherForecast;
  readonly now: number;
  readonly stale: boolean;
}

function Small({ forecast, stale }: ReadyProps): ReactNode {
  const { now } = forecast;
  return (
    <View>
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

function NowRow({ forecast, stale }: ReadyProps): ReactNode {
  const { frame } = useWidgetFace();
  const px = fitVisualPx(widgetBodyHeight(frame), ROW_ICON_MAX);
  const { now } = forecast;
  return (
    <View className="min-w-0 shrink flex-row items-center gap-3 self-start">
      {px === undefined ? null : <WeatherVisual code={now.code} day={now.isDay} px={px} />}
      <View className="min-w-0 shrink gap-0.5">
        <Figure value={degrees(now.temperatureC)} size="l" stale={stale} />
        <Text variant="body-strong" numberOfLines={1}>
          {conditionOf(now.code)}
        </Text>
      </View>
    </View>
  );
}

function Hours({ forecast, now }: ReadyProps): ReactNode {
  return <HourStrip forecast={forecast} now={now} most={forecast.hourly.length} />;
}

function Medium(props: ReadyProps): ReactNode {
  return (
    <View className="flex-1 flex-row gap-3">
      <NowRow {...props} />
      <FittedStats stats={weatherStats(props.forecast, props.now)} />
    </View>
  );
}

function Wide(props: ReadyProps): ReactNode {
  return (
    <View className="flex-1 flex-row gap-6">
      <NowRow {...props} />
      <View className="min-w-0 flex-1">
        <Hours {...props} />
      </View>
    </View>
  );
}

function Large(props: ReadyProps): ReactNode {
  return (
    <View className="flex-1 gap-3">
      <WeatherHero forecast={props.forecast} now={props.now} scale="m" stale={props.stale} />
      <Hours {...props} />
      <FittedStats stats={weatherStats(props.forecast, props.now)} />
    </View>
  );
}

function ExtraLarge(props: ReadyProps): ReactNode {
  const stats = weatherStats(props.forecast, props.now).filter((stat) => stat.key !== 'range');
  return (
    <View className="flex-1 flex-row gap-6">
      <View className="min-w-0 flex-1 gap-3">
        <WeatherHero forecast={props.forecast} now={props.now} scale="l" stale={props.stale} />
        <FittedStats stats={stats} />
      </View>
      <View className="min-w-0 flex-1 gap-3">
        <Hours {...props} />
        <FittedDays forecast={props.forecast} now={props.now} />
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
