import type { DriveQuota, DriveStats, DriveUsage, DriveUsageTotals } from '@smarteverything/domain';

export interface DriveUsageSource {
  readonly usage: (profileId: string | null) => DriveUsage;
  readonly usageByProfile: () => DriveUsage[];
  readonly find: (profileId: string) => DriveQuota | undefined;
}

export type DriveUsageViewer =
  { readonly role: 'owner' } | { readonly role: 'member'; readonly profileId: string };

export const PURGE_FORECAST_MONTHS = 12;

function monthAfter(month: string): string {
  const [year = 0, number = 1] = month.split('-').map(Number);
  return number === 12
    ? `${String(year + 1).padStart(4, '0')}-01`
    : `${String(year).padStart(4, '0')}-${String(number + 1).padStart(2, '0')}`;
}

function withQuota(source: DriveUsageSource, usage: DriveUsage): DriveUsageTotals {
  return {
    ...usage,
    quota: usage.profileId === null ? null : (source.find(usage.profileId)?.bytes ?? null),
  };
}

export function readDriveUsage(
  source: DriveUsageSource,
  viewer: DriveUsageViewer,
): DriveUsageTotals[] {
  const rows = viewer.role === 'owner' ? source.usageByProfile() : [source.usage(viewer.profileId)];
  return rows.map((usage) => withQuota(source, usage));
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
