import {
  API_ENDPOINTS as E,
  HEALTH_RECORD_TYPES,
  type HealthRecordType,
} from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import {
  MINIMUM_INTERVAL_MINUTES,
  addSyncProgressListener,
  cancelSchedule,
  configure,
  getStatus,
  grantedPermissions,
  isHealthConnectLinked,
  lastSync,
  requestPermissions,
  schedule,
  syncNow,
  type HealthConnectGrants,
  type HealthConnectStatus,
  type SyncProgress,
  type SyncProgressSubscription,
  type SyncReport,
} from '../../../../modules/health-connect';
import { createHealthSource } from '../../../api/health';
import { SERIES } from '../model/catalogue';
import type { SeriesGroup } from '../model/series-spec';

const log = new Logger('app.health-connect');

const ASKED_LATER: ReadonlySet<SeriesGroup> = new Set(['cycle', 'mindfulness']);

function typesOfGroups(groups: ReadonlySet<SeriesGroup>): ReadonlySet<HealthRecordType> {
  return new Set(SERIES.filter((spec) => groups.has(spec.group)).map((spec) => spec.type));
}

const LATER_TYPES = typesOfGroups(ASKED_LATER);

export const HEALTH_CONNECT_ON_DEVICE = isHealthConnectLinked;

const HEALTH_CONNECT_DEFAULT_INTERVAL = MINIMUM_INTERVAL_MINUTES;

class HealthConnectUnavailableError extends Error {
  override readonly name = 'HealthConnectUnavailableError';

  constructor(readonly sdk: 'unavailable' | 'provider_update_required') {
    super(
      sdk === 'provider_update_required'
        ? 'Update Health Connect from the Play Store, then try again.'
        : 'Health Connect is not available on this phone.',
    );
  }
}

class NoPublicUrlError extends Error {
  override readonly name = 'NoPublicUrlError';

  constructor() {
    super('Set your server’s public address on the desktop app first.');
  }
}

function ingestEndpoint(publicUrl: string | null): string {
  if (publicUrl === null) {
    throw new NoPublicUrlError();
  }
  return `${publicUrl.replace(/\/+$/, '')}${E.ingestHealth.path}`;
}

export async function connectPhone(
  deviceName: string,
  publicUrl: string | null,
): Promise<HealthConnectGrants> {
  const run = log.operation('health.connect');
  const status = await getStatus();
  if (status.sdk !== 'available') {
    throw new HealthConnectUnavailableError(status.sdk);
  }
  const endpoint = ingestEndpoint(publicUrl);
  const token = await createHealthSource(deviceName);
  await configure({ endpoint, token });
  const readable = HEALTH_RECORD_TYPES.filter(
    (type) => status.readableTypes.includes(type) && !LATER_TYPES.has(type),
  );
  const grants = await requestPermissions({ types: readable, background: true, history: true });
  await schedule({ intervalMinutes: HEALTH_CONNECT_DEFAULT_INTERVAL });
  run.succeeded({ types: grants.types.length, background: grants.background });
  return grants;
}

export function readHealthConnectStatus(): Promise<HealthConnectStatus> {
  return getStatus();
}

export function readGrants(): Promise<HealthConnectGrants> {
  return grantedPermissions();
}

export function readLastSync(): Promise<SyncReport | null> {
  return lastSync();
}

export function syncPhoneNow(): Promise<SyncReport> {
  return syncNow();
}

export async function askForAccess(
  types: readonly HealthRecordType[],
): Promise<HealthConnectGrants> {
  const grants = await requestPermissions({ types: [...types], background: true, history: true });
  log.info('health.permissions_requested', {
    requested: types.length,
    granted: grants.types.length,
  });
  return grants;
}

export async function scheduleSync(intervalMinutes: number): Promise<void> {
  if (intervalMinutes === 0) {
    await cancelSchedule();
    log.info('health.unscheduled');
    return;
  }
  await schedule({ intervalMinutes });
  log.info('health.scheduled', { intervalMinutes });
}

export function onSyncProgress(
  listener: (progress: SyncProgress) => void,
): SyncProgressSubscription {
  return addSyncProgressListener(listener);
}

export type { HealthConnectGrants, HealthConnectStatus, SyncProgress, SyncReport };
