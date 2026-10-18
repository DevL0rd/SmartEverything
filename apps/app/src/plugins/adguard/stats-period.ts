import type { AdGuardStats } from '@smarteverything/domain';

function spanText(stats: AdGuardStats): string {
  const unit = stats.timeUnit === 'hours' ? 'hours' : 'days';
  return `${String(stats.history.length)} ${unit}`;
}

export function periodText(stats: AdGuardStats): string {
  return `last ${spanText(stats)}`;
}

export function periodCaption(stats: AdGuardStats): string {
  return `Last ${spanText(stats)}`;
}
