import type { AdGuardStats } from '@smarteverything/domain';

export function periodText(stats: AdGuardStats): string {
  const span = stats.history.length;
  return stats.timeUnit === 'hours' ? `last ${String(span)} hours` : `last ${String(span)} days`;
}
