import type { TreadmillStateView } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { TimeSeriesChart } from '../../../components/charts';
import { Text } from '../../../components/text';
import { useLivePoints } from '../data/treadmill-data';
import { LIVE_WINDOW_MS, seriesOf } from '../model/speed-history';
import { chartTopKmh, speedText } from '../model/treadmill-model';
import { heartSummary } from '../model/counters-model';
import { speedSummary } from '../model/treadmill-summary';

const MINUTES = LIVE_WINDOW_MS / 60_000;
const HEIGHT = 140;
const MIN_POINTS = 2;

export function SpeedChart({
  deviceId,
  view,
}: {
  readonly deviceId: string;
  readonly view: TreadmillStateView;
}): ReactNode {
  const points = seriesOf(useLivePoints(deviceId, view.recentSpeed), (point) => point.speed);
  const last = points[points.length - 1];
  if (last === undefined || points.length < MIN_POINTS) {
    return (
      <View className="h-24 items-center justify-center rounded-md bg-surface-2">
        <Text variant="footnote" tone="variant">
          The speed shows here once the belt moves.
        </Text>
      </View>
    );
  }
  return (
    <TimeSeriesChart
      series={[{ points, colour: 'primary', label: 'Speed' }]}
      window={{ spanMs: LIVE_WINDOW_MS, now: last.t }}
      yDomain={[0, chartTopKmh(Math.max(...points.map((point) => point.v)), view.limits.maxKmh)]}
      label={speedSummary(points, MINUTES)}
      unit="km/h"
      height={HEIGHT}
      area
      formatValue={speedText}
    />
  );
}

export function HeartChart({
  deviceId,
  view,
}: {
  readonly deviceId: string;
  readonly view: TreadmillStateView;
}): ReactNode {
  const history = useLivePoints(deviceId, view.recentSpeed);
  const points = seriesOf(history, (point) => point.heartRate);
  const last = history[history.length - 1];
  if (last === undefined || points.length < MIN_POINTS) {
    return null;
  }
  return (
    <TimeSeriesChart
      series={[{ points, colour: 'critical', label: 'Heart rate' }]}
      window={{ spanMs: LIVE_WINDOW_MS, now: last.t }}
      yDomain="sticky"
      label={heartSummary(points)}
      unit="bpm"
      height={96}
      formatValue={(value) => String(Math.round(value))}
    />
  );
}
