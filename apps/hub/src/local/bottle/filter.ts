import { bottleFilterStatusOf, type BottleFilterStatus } from '@smarteverything/domain';
import type { BottleReadingsRepository } from '../../store/repositories/bottle-readings';
import type { BottleEntryConfig } from './config';

const MS_PER_SECOND = 1000;

const DAY_SECONDS = 86_400;

const RECENT_DAYS = 14;

export function filterStatusOf(
  readings: Pick<BottleReadingsRepository, 'drunkMl'>,
  moment: { readonly deviceId: string; readonly now: Date; readonly today: string },
  config: Pick<BottleEntryConfig, 'filter'>,
): BottleFilterStatus | null {
  const installedOn = config.filter.installedOn;
  if (installedOn === null) {
    return null;
  }
  const now = Math.floor(moment.now.getTime() / MS_PER_SECOND);
  const since = Math.floor(Date.parse(`${installedOn}T00:00:00Z`) / MS_PER_SECOND);
  return bottleFilterStatusOf(
    config.filter,
    readings.drunkMl(moment.deviceId, { from: since, to: now }),
    readings.drunkMl(moment.deviceId, { from: now - RECENT_DAYS * DAY_SECONDS, to: now }),
    moment.today,
  );
}
