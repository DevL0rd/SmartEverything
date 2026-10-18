import { Logger } from '@smarteverything/logging';
import {
  addSyncProgressListener,
  cancelSchedule,
  configureServer,
  getStatus,
  healthConnectConfigured,
  grantedPermissions,
  isHealthConnectLinked,
  lastSync,
  requestAllPermissions,
  schedule,
  syncNow,
  type HealthConnectGrants,
  type HealthConnectStatus,
  type SyncProgress,
  type SyncProgressSubscription,
  type SyncReport,
} from '../../../../modules/health-connect';
import { createHealthSource } from '../../../api/health';
import type { RelayServer } from '../../profiles';

const log = new Logger('app.health-connect');

const OPEN_SYNC_GAP_MS = 10 * 60 * 1000;

export const HEALTH_CONNECT_ON_DEVICE = isHealthConnectLinked;

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

export function grantedNothing(grants: HealthConnectGrants): boolean {
  return grants.types.length === 0 && (grants.writeTypes ?? []).length === 0;
}

async function connectSteps(
  server: RelayServer,
  deviceName: string,
  intervalMinutes: number,
  connected: boolean,
): Promise<HealthConnectGrants> {
  const status = await getStatus();
  log.info('health.connect_status', { sdk: status.sdk });
  if (status.sdk !== 'available') {
    throw new HealthConnectUnavailableError(status.sdk);
  }
  const grants = await requestAllPermissions();
  log.info('health.connect_permissions', {
    reads: grants.types.length,
    writes: (grants.writeTypes ?? []).length,
    background: grants.background,
  });
  if (grantedNothing(grants)) {
    return grants;
  }
  await configureServer(server.url, server.token);
  if (!connected) {
    await createHealthSource(deviceName);
    log.info('health.connect_source_created');
  }
  await scheduleSync(intervalMinutes);
  return grants;
}

export async function connectPhone(
  server: RelayServer,
  deviceName: string,
  intervalMinutes: number,
  connected: boolean,
): Promise<HealthConnectGrants> {
  const run = log.operation('health.connect', { connected });
  try {
    const grants = await connectSteps(server, deviceName, intervalMinutes, connected);
    run.succeeded({ types: grants.types.length, background: grants.background });
    return grants;
  } catch (error: unknown) {
    run.failed(error);
    throw error;
  }
}

export async function readHealthConnectStatus(): Promise<HealthConnectStatus> {
  const status = await getStatus();
  log.debug('health.status_read', { sdk: status.sdk });
  return status;
}

export function readGrants(): Promise<HealthConnectGrants> {
  return grantedPermissions();
}

export function readLastSync(): Promise<SyncReport | null> {
  return lastSync();
}

export async function syncPhoneNow(): Promise<SyncReport> {
  const operation = log.operation('health.sync_now');
  try {
    const report = await syncNow();
    operation.succeeded({ outcome: report.outcome, records: report.records });
    return report;
  } catch (error) {
    operation.failed(error);
    throw error;
  }
}

export async function syncWhenOpened(): Promise<void> {
  const last = await lastSync();
  if (last === null) {
    log.info('health.open_sync_skipped', { reason: 'this phone has never synced' });
    return;
  }
  if (Date.now() - Date.parse(last.finishedAt) < OPEN_SYNC_GAP_MS) {
    log.info('health.open_sync_skipped', { reason: 'synced in the last 10 minutes' });
    return;
  }
  const report = await syncNow();
  log.info('health.open_synced', { outcome: report.outcome, records: report.records });
}

export async function applySyncSchedule(intervalMinutes: number): Promise<void> {
  if (!(await healthConnectConfigured())) {
    log.debug('health.schedule_skipped', { reason: 'not-configured' });
    return;
  }
  await scheduleSync(intervalMinutes);
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
