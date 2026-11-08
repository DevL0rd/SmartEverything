import type { WeatherForecast } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { href } from '../../../app-shell/hrefs';
import { Badge } from '../../../components/badge';
import { ProgressBar } from '../../../components/charts';
import { IconWell } from '../../../components/icon-well';
import { Text } from '../../../components/text';
import { WidgetFrame } from '../../../components/widget-board';
import { WeatherWidgetNotice, useWeather } from '../../weather';
import { useComfortReadings } from '../data/use-readings';
import type { ComfortMetric, MetricReading } from '../model/comfort';
import { comparisonsOf, hintOf, type Comparison } from '../model/outdoor';
import { outdoorFit, rowsOf } from './climate-fit';
import { useClimateBody } from './use-body-box';

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
    <View className="min-w-0 flex-1 gap-1">
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

function Compare({
  readings,
  forecast,
}: {
  readonly readings: readonly MetricReading[];
  readonly forecast: WeatherForecast;
}): ReactNode {
  const comparisons = comparisonsOf(readings, forecast);
  const fit = outdoorFit(useClimateBody().box, comparisons.length);
  const hint = fit.hintLines === 0 ? null : hintOf(readings, forecast);
  return (
    <View className="flex-1 gap-3">
      {rowsOf(comparisons.slice(0, fit.shown), fit.columns).map((row) => (
        <View key={row.map((comparison) => comparison.key).join()} className="flex-row gap-6">
          {row.map((comparison) => (
            <Metric key={comparison.key} comparison={comparison} />
          ))}
          {Array.from({ length: fit.columns - row.length }, (_, index) => (
            <View key={`gap-${String(index)}`} className="min-w-0 flex-1" />
          ))}
        </View>
      ))}
      {hint === null ? null : (
        <Text variant="callout" tone={hint.tone} numberOfLines={fit.hintLines}>
          {hint.text}
        </Text>
      )}
    </View>
  );
}

export function OutdoorWidget({ room }: { readonly room: string | null }): ReactNode {
  const readings = useComfortReadings(METRICS, room);
  const view = useWeather();
  return (
    <WidgetFrame title="Inside & outside" icon="weather" accent="viz-1" href={href.weather()}>
      {view.kind === 'ready' ? (
        <Compare readings={readings} forecast={view.forecast} />
      ) : (
        <WeatherWidgetNotice view={view} />
      )}
    </WidgetFrame>
  );
}
