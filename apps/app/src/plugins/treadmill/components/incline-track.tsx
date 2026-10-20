import type { TreadmillStateView } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { TimeSeriesChart } from '../../../components/charts';
import { useLivePoints, useLiveSelect } from '../data/treadmill-data';
import { inclineSummary, inclineText } from '../model/counters-model';
import { LIVE_WINDOW_MS, steppedSeries } from '../model/speed-history';

const HEIGHT = 80;

export function InclineTrack({
  deviceId,
  view,
}: {
  readonly deviceId: string;
  readonly view: TreadmillStateView;
}): ReactNode {
  const points = useLivePoints(deviceId, view.recentSpeed);
  const scale = useLiveSelect(deviceId, view.frame, (frame) => frame.belt.inclineScale);
  const range = view.limits.incline;
  const stepped = steppedSeries(points, (point) => point.incline);
  const last = points[points.length - 1];
  if (range === null || last === undefined || stepped.length < 2) {
    return null;
  }
  return (
    <TimeSeriesChart
      series={[{ points: stepped, colour: 'viz-violet', label: 'Incline' }]}
      window={{ spanMs: LIVE_WINDOW_MS, now: last.t }}
      yDomain={[range.min, range.max]}
      label={inclineSummary(stepped, scale)}
      height={HEIGHT}
      area
      formatValue={(value) => inclineText(value, scale)}
    />
  );
}
