import type { ReactNode } from 'react';
import { MetricStrip } from '../../../components/metric-strip';
import { linkStatsOf, type LinkGroups } from './shared-model';

const COLUMNS = { compact: 2, medium: 2, expanded: 4 } as const;

export function LinkStats({
  groups,
  now,
}: {
  readonly groups: LinkGroups;
  readonly now: number;
}): ReactNode {
  return <MetricStrip items={linkStatsOf(groups, now)} columns={COLUMNS} />;
}
