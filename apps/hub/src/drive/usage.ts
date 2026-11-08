import type { DriveStats, DriveUsage } from '@smarteverything/domain';
import type { DriveViewer } from './search';

export interface DriveUsageSource {
  readonly usage: (profileId: string | null) => DriveUsage;
  readonly usageByProfile: () => DriveUsage[];
}

export const PURGE_FORECAST_MONTHS = 12;

function monthAfter(month: string): string {
  const [year = 0, number = 1] = month.split('-').map(Number);
  return number === 12
    ? `${String(year + 1).padStart(4, '0')}-01`
    : `${String(year).padStart(4, '0')}-${String(number + 1).padStart(2, '0')}`;
}

export function readDriveUsage(source: DriveUsageSource, viewer: DriveViewer): DriveUsage[] {
  return viewer.role === 'owner' ? source.usageByProfile() : [source.usage(viewer.profileId)];
}

export function purgeForecast(
  purges: DriveStats['purges'],
  currentMonth: string,
): DriveStats['purges'] {
  const byMonth = new Map(purges.map((purge) => [purge.month, purge]));
  const out: DriveStats['purges'][number][] = [];
  let month = currentMonth;
  for (let step = 0; step < PURGE_FORECAST_MONTHS; step += 1) {
    out.push(byMonth.get(month) ?? { month, trashBytes: 0, versionBytes: 0 });
    month = monthAfter(month);
  }
  return out;
}
