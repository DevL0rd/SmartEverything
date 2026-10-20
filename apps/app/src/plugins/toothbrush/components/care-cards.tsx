import {
  BATTERY_LOW_PERCENT,
  HEAD_DUE_PERCENT,
  HEAD_WARN_PERCENT,
  type BrushStateView,
} from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Badge, type BadgeTone } from '../../../components/badge';
import { Card } from '../../../components/card';
import { LoadedQuery } from '../../../components/loaded-query';
import { Text } from '../../../components/text';
import { BatteryCurve, Scatter, TimelineStrip, WearForecast } from '../charts/care-charts';
import { useBrushView } from '../data/brush-data';
import {
  batteryPlot,
  daysLeftText,
  forecastLine,
  headLine,
  replaceByText,
  scatterPoints,
  timelineBars,
  wearTone,
  type WearTone,
} from '../model/care-model';

const WEAR_BADGE: Readonly<Record<WearTone, { readonly label: string; readonly tone: BadgeTone }>> =
  {
    fresh: { label: 'Good', tone: 'positive' },
    worn: { label: 'Wearing out', tone: 'warning' },
    due: { label: 'Replace now', tone: 'critical' },
  };

export function HeadCard({
  deviceId,
  view,
}: {
  readonly deviceId: string;
  readonly view: BrushStateView;
}): ReactNode {
  const head = useBrushView(deviceId, 'head');
  return (
    <Card title="Brush head" icon="toothbrush">
      <LoadedQuery query={head}>
        {(loaded) => {
          const percent = loaded.head.wearPercent;
          const line = forecastLine(loaded.head, loaded.perDayS, HEAD_WARN_PERCENT);
          const replace = replaceByText(loaded.head.replaceBy);
          return (
            <View className="gap-3">
              <View className="flex-row flex-wrap items-center gap-2">
                {percent === null ? null : (
                  <Badge {...WEAR_BADGE[wearTone(percent, HEAD_WARN_PERCENT, HEAD_DUE_PERCENT)]} />
                )}
                <Text variant="callout" className="min-w-0 flex-1">
                  {headLine(loaded.head)}
                </Text>
              </View>
              {replace === null ? null : (
                <Text variant="footnote" tone="variant">
                  At your pace, replace it by {replace}.
                </Text>
              )}
              {line === null ? null : (
                <WearForecast line={line} label="Brush head wear now and at today’s pace" />
              )}
              {loaded.timeline.length < 2 ? null : (
                <TimelineStrip bars={timelineBars(loaded.timeline)} />
              )}
              {view.profile.head === 'full' ? null : (
                <Text variant="caption" tone="faint">
                  This model only reports whether a head is fitted.
                </Text>
              )}
            </View>
          );
        }}
      </LoadedQuery>
    </Card>
  );
}

export function BatteryCard({ deviceId }: { readonly deviceId: string }): ReactNode {
  const battery = useBrushView(deviceId, 'battery');
  return (
    <Card title="Battery" icon="battery">
      <LoadedQuery query={battery}>
        {(loaded) => {
          const plot = batteryPlot(loaded, BATTERY_LOW_PERCENT);
          const left = daysLeftText(loaded.battery.daysLeft);
          const points = scatterPoints(loaded);
          return (
            <View className="gap-3">
              <Text variant="title-2" className="tabular">
                {loaded.battery.percent === null
                  ? '–'
                  : `${String(Math.round(loaded.battery.percent))}%`}
              </Text>
              {left === null ? null : <Text variant="callout">{left}</Text>}
              {plot === null ? (
                <Text variant="callout" tone="variant">
                  The curve fills in after a few days of use.
                </Text>
              ) : (
                <BatteryCurve plot={plot} label="Battery level over time, charges marked" />
              )}
              {points.length < 3 ? null : (
                <Scatter points={points} label="Battery voltage against charge level" />
              )}
            </View>
          );
        }}
      </LoadedQuery>
    </Card>
  );
}
