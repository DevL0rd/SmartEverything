import type { WeatherForecast } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import { href } from '../../../app-shell/hrefs';
import { Badge } from '../../../components/badge';
import { ProgressBar } from '../../../components/charts';
import { IconWell } from '../../../components/icon-well';
import { Text } from '../../../components/text';
import { WidgetFrame, isTall, type WidgetSize } from '../../../components/widget-board';
import { cn } from '../../../design/cn';
import { WeatherWidgetNotice, useWeather } from '../../weather';
import { useComfortReadings } from '../data/use-readings';
import type { ComfortMetric, MetricReading } from '../model/comfort';
import { comparisonsOf, hintOf, type Comparison } from '../model/outdoor';

const METRICS: readonly ComfortMetric[] = ['temperature', 'humidity', 'pm25'];

const MIN_SHARE = 0.04;

function share(value: number | null, max: number): number | null {
  return value === null ? null : Math.min(Math.max(value / max, MIN_SHARE), 1);
}

function Side({
  label,
  value,
  text,
  comparison,
  tint,
}: {
  readonly label: string;
  readonly value: number | null;
  readonly text: string;
  readonly comparison: Comparison;
  readonly tint: Comparison['colour'];
}): ReactNode {
  return (
    <View className="flex-row items-center gap-2" aria-label={`${label} ${text}`}>
      <Text variant="caption" tone="variant" className="w-14" numberOfLines={1}>
        {label}
      </Text>
      <View className="min-w-0 flex-1">
        <ProgressBar
          progress={share(value, comparison.max)}
          colour={tint}
          label={`${label} ${text}`}
          thick
        />
      </View>
      <Text variant="callout" className="w-14 text-right tabular" numberOfLines={1}>
        {text}
      </Text>
    </View>
  );
}

function Metric({ comparison }: { readonly comparison: Comparison }): ReactNode {
  return (
    <View className="min-w-0 flex-1 gap-2">
      <View className="flex-row items-center gap-2">
        <IconWell icon={comparison.icon} colour={comparison.colour} size="s" />
        <Text variant="footnote" className="flex-1" numberOfLines={1}>
          {comparison.label}
        </Text>
        {comparison.delta === null ? null : (
          <Badge label={`Outside ${comparison.delta}`} tone="neutral" />
        )}
      </View>
      <Side
        label="Inside"
        value={comparison.inside}
        text={comparison.insideText}
        comparison={comparison}
        tint="on-surface-faint"
      />
      <Side
        label="Outside"
        value={comparison.outside}
        text={comparison.outsideText}
        comparison={comparison}
        tint={comparison.colour}
      />
    </View>
  );
}

const ROOMY_PX = 600;

function Compare({
  readings,
  forecast,
  size,
  roomy,
}: {
  readonly readings: readonly MetricReading[];
  readonly forecast: WeatherForecast;
  readonly size: WidgetSize;
  readonly roomy: boolean;
}): ReactNode {
  const tall = isTall(size);
  const across = roomy;
  const rows = comparisonsOf(readings, forecast).slice(0, tall || across ? 3 : 1);
  const hint = tall ? hintOf(readings, forecast) : null;
  return (
    <View className="flex-1 justify-between gap-4">
      <View className={cn('gap-4', across ? 'flex-row gap-6' : '')}>
        {rows.map((comparison) => (
          <Metric key={comparison.key} comparison={comparison} />
        ))}
      </View>
      {hint === null ? null : (
        <Text variant="callout" tone={hint.tone} numberOfLines={2}>
          {hint.text}
        </Text>
      )}
    </View>
  );
}

export function OutdoorWidget({
  size,
  room,
}: {
  readonly size: WidgetSize;
  readonly room: string | null;
}): ReactNode {
  const readings = useComfortReadings(METRICS, room);
  const view = useWeather();
  const [width, setWidth] = useState(0);
  const measure = (event: LayoutChangeEvent): void => {
    setWidth(event.nativeEvent.layout.width);
  };
  return (
    <WidgetFrame title="Inside & outside" icon="weather" accent="viz-1" href={href.weather()}>
      <View className="flex-1" onLayout={measure}>
        {view.kind === 'ready' ? (
          <Compare
            readings={readings}
            forecast={view.forecast}
            size={size}
            roomy={width >= ROOMY_PX}
          />
        ) : (
          <WeatherWidgetNotice view={view} />
        )}
      </View>
    </WidgetFrame>
  );
}
