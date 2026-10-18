import type { AdGuardSnapshot, AdGuardStats } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { MetricStrip } from '../../../components/metric-strip';
import type { Device } from '../../../store/state';
import { adguardSectionHref } from './links';
import { stripItems } from './strip-model';

const COLUMNS = { compact: 2, medium: 2, expanded: 3 } as const;

export function AdGuardStrip({
  device,
  snapshot,
  stats,
}: {
  readonly device: Device;
  readonly snapshot: AdGuardSnapshot;
  readonly stats: AdGuardStats;
}): ReactNode {
  return (
    <MetricStrip
      items={stripItems(snapshot, stats, adguardSectionHref(device.id, 'filters'))}
      columns={COLUMNS}
    />
  );
}
