import type { RouterSnapshot } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { MetricStrip } from '../../../components/metric-strip';
import type { Device } from '../../../store/state';
import { routerSectionHref } from './links';
import { stripItems } from './strip-model';
import { useRawSeries } from './use-router-series';

const TREND_HOURS = 24;
const COLUMNS = { compact: 2, medium: 2, expanded: 3 } as const;

export function RouterStrip({
  device,
  snapshot,
}: {
  readonly device: Device;
  readonly snapshot: RouterSnapshot;
}): ReactNode {
  const series = {
    latency: useRawSeries(device.id, 'latency', TREND_HOURS),
    cpu: useRawSeries(device.id, 'cpu_load', TREND_HOURS),
    memory: useRawSeries(device.id, 'memory_used', TREND_HOURS),
  };
  return (
    <MetricStrip
      items={stripItems(snapshot, series, routerSectionHref(device.id, 'clients'))}
      columns={COLUMNS}
    />
  );
}
