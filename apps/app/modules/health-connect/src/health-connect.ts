import { captureNativeServerEnrollment } from './hub-network';
import { NativeModule, requireOptionalNativeModule } from 'expo';
import { HEALTH_RECORD_TYPE, type HealthRecordType } from '@smarteverything/domain';
import { z } from 'zod';

export interface SyncProgressSubscription {
  readonly remove: () => void;
}
import {
  ENTRY_REPORT,
  HEALTH_CONNECT_GRANTS,
  HEALTH_CONNECT_STATUS,
  PERMISSION_REQUEST,
  SCALE_EVENT,
  SCALE_RELAY_STATUS,
  SYNC_PROGRESS,
  SYNC_REPORT,
  SYNC_SCHEDULE,
  SYNC_TARGET,
  WRITE_REPORT,
  type EntryReport,
  type HealthConnectGrants,
  type HealthConnectStatus,
  type PermissionRequest,
  type SyncProgress,
  type SyncReport,
  type SyncSchedule,
  type SyncTarget,
  type ScaleEvent,
  type ScaleRelayStatus,
  type WriteReport,
} from './schemas';

interface HealthConnectEvents {
  readonly onSyncProgress: (payload: unknown) => void;
  readonly onScaleEvent: (payload: unknown) => void;
  readonly onWatchEvent: (payload: unknown) => void;
  readonly [event: string]: (payload: unknown) => void;
}

declare class HealthConnectNative extends NativeModule<HealthConnectEvents> {
  getStatus(): Promise<unknown>;
  requestPermissions(
    types: readonly string[],
    background: boolean,
    history: boolean,
  ): Promise<unknown>;
  grantedPermissions(): Promise<unknown>;
  requestAllPermissions(): Promise<unknown>;
  configure(endpoint: string, token: string): Promise<void>;
  syncNow(): Promise<unknown>;
  schedule(intervalMinutes: number): Promise<void>;
  cancelSchedule(): Promise<void>;
  lastSync(): Promise<unknown>;
  requestWritePermissions(): Promise<unknown>;
  writeGranted(): Promise<unknown>;
  deliverBodyReadings(): Promise<unknown>;
  requestEntryWrites(types: readonly string[]): Promise<unknown>;
  entryWritesGranted(types: readonly string[]): Promise<unknown>;
  deliverEntries(): Promise<unknown>;
  startScaleRelay(): Promise<unknown>;
  stopScaleRelay(): Promise<void>;
  configureScaleRelay(serverUrl: string, token: string, enrollment?: string): Promise<void>;
  healthConnectConfigured(): Promise<unknown>;
  scaleRelayStatus(): Promise<unknown>;
  startScaleLiveScan(): Promise<void>;
  stopScaleLiveScan(): Promise<void>;
  syncWatches(serverUrl: string, token: string, enrollment?: string): Promise<unknown>;
  startWatches(): Promise<void>;
  runPushCommand(command: string, payloadJson: string): Promise<void>;
  pauseWatch(deviceId: string, paused: boolean): Promise<void>;
  setWatchLive(on: boolean): Promise<void>;
  refreshWatches(): Promise<void>;
  watchStatus(): Promise<unknown>;
  associateWatch(deviceId: string): Promise<unknown>;
  watchFamilies(): Promise<unknown>;
  syncWatchNow(): Promise<void>;
  requestWatchWrites(): Promise<unknown>;
  watchWritesGranted(): Promise<unknown>;
  openAppSettings(packageName: string): Promise<void>;
  findWatch(deviceId: string, on: boolean): Promise<unknown>;
  setWatchCalendar(eventsJson: string): Promise<unknown>;
  runWatchAction(deviceId: string, actionJson: string): Promise<unknown>;
  watchRelayStatus(): Promise<unknown>;
  setWatchRelay(change: Readonly<Record<string, unknown>>): Promise<unknown>;
  phoneApps(): Promise<unknown>;
  openNotificationAccess(): Promise<void>;
  openDndAccess(): Promise<void>;
}

export class HealthConnectMissingError extends Error {
  override readonly name = 'HealthConnectMissingError';

  constructor(readonly operation: string) {
    super(
      `Health Connect sync needs the HealthConnect native module, which exists only in the ` +
        `Android build; ${operation} was called where it is not linked`,
    );
  }
}

const linked = requireOptionalNativeModule<HealthConnectNative>('HealthConnect');

export const isHealthConnectLinked = linked !== null;

export class AppUpdateNeededError extends Error {
  override readonly name = 'AppUpdateNeededError';

  constructor(readonly operation: string) {
    super(`This app build has no ${operation}; install the newest SmartEverything app`);
  }
}

type NativeName =
  Exclude<keyof HealthConnectNative, keyof NativeModule<HealthConnectEvents>> | 'addListener';

export function nativeFor(operation: NativeName): HealthConnectNative {
  if (linked === null) {
    throw new HealthConnectMissingError(operation);
  }
  if (typeof Reflect.get(linked, operation) !== 'function') {
    throw new AppUpdateNeededError(operation);
  }
  return linked;
}

export async function getStatus(): Promise<HealthConnectStatus> {
  return HEALTH_CONNECT_STATUS.parse(await nativeFor('getStatus').getStatus());
}

export async function requestPermissions(request: PermissionRequest): Promise<HealthConnectGrants> {
  const { types, background, history } = PERMISSION_REQUEST.parse(request);
  const granted = await nativeFor('requestPermissions').requestPermissions(
    types,
    background,
    history,
  );
  return HEALTH_CONNECT_GRANTS.parse(granted);
}

export async function grantedPermissions(): Promise<HealthConnectGrants> {
  return HEALTH_CONNECT_GRANTS.parse(await nativeFor('grantedPermissions').grantedPermissions());
}

export async function requestAllPermissions(): Promise<HealthConnectGrants> {
  const grants = HEALTH_CONNECT_GRANTS.parse(
    await nativeFor('requestAllPermissions').requestAllPermissions(),
  );
  if (grants.writeTypes === undefined) {
    throw new AppUpdateNeededError('Health Connect read and write access');
  }
  return grants;
}

export async function configure(target: SyncTarget): Promise<void> {
  const { endpoint, token } = SYNC_TARGET.parse(target);
  await nativeFor('configure').configure(endpoint, token);
}

export async function syncNow(): Promise<SyncReport> {
  return SYNC_REPORT.parse(await nativeFor('syncNow').syncNow());
}

export async function schedule(plan: SyncSchedule): Promise<void> {
  await nativeFor('schedule').schedule(SYNC_SCHEDULE.parse(plan).intervalMinutes);
}

export async function cancelSchedule(): Promise<void> {
  await nativeFor('cancelSchedule').cancelSchedule();
}

export async function lastSync(): Promise<SyncReport | null> {
  return SYNC_REPORT.nullable().parse(await nativeFor('lastSync').lastSync());
}

export function addSyncProgressListener(
  listener: (progress: SyncProgress) => void,
): SyncProgressSubscription {
  return nativeFor('addListener').addListener('onSyncProgress', (payload) => {
    listener(SYNC_PROGRESS.parse(payload));
  });
}

const GRANTED = z.boolean();
const WATCHING = z.int().min(0);

export async function requestWritePermissions(): Promise<boolean> {
  return GRANTED.parse(await nativeFor('requestWritePermissions').requestWritePermissions());
}

export async function writeGranted(): Promise<boolean> {
  return GRANTED.parse(await nativeFor('writeGranted').writeGranted());
}

export async function deliverBodyReadings(): Promise<WriteReport> {
  return WRITE_REPORT.parse(await nativeFor('deliverBodyReadings').deliverBodyReadings());
}

export async function healthConnectConfigured(): Promise<boolean> {
  return GRANTED.parse(await nativeFor('healthConnectConfigured').healthConnectConfigured());
}

export async function configureScaleRelay(serverUrl: string, token: string): Promise<void> {
  const enrollment = await captureNativeServerEnrollment(serverUrl, token);
  const source = nativeFor('configureScaleRelay');
  if (enrollment === null) await source.configureScaleRelay(serverUrl, token);
  else await source.configureScaleRelay(serverUrl, token, enrollment);
}

export async function startScaleRelay(): Promise<number> {
  return WATCHING.parse(await nativeFor('startScaleRelay').startScaleRelay());
}

export async function stopScaleRelay(): Promise<void> {
  await nativeFor('stopScaleRelay').stopScaleRelay();
}

export async function scaleRelayStatus(): Promise<ScaleRelayStatus> {
  return SCALE_RELAY_STATUS.parse(await nativeFor('scaleRelayStatus').scaleRelayStatus());
}

export async function startScaleLiveScan(): Promise<void> {
  await nativeFor('startScaleLiveScan').startScaleLiveScan();
}

export async function stopScaleLiveScan(): Promise<void> {
  await nativeFor('stopScaleLiveScan').stopScaleLiveScan();
}

export function addScaleEventListener(
  listener: (event: ScaleEvent) => void,
): SyncProgressSubscription {
  return nativeFor('addListener').addListener('onScaleEvent', (payload) => {
    listener(SCALE_EVENT.parse(payload));
  });
}

const GRANTED_TYPES = z.array(HEALTH_RECORD_TYPE);

export async function requestEntryWrites(
  types: readonly HealthRecordType[],
): Promise<HealthRecordType[]> {
  return GRANTED_TYPES.parse(await nativeFor('requestEntryWrites').requestEntryWrites(types));
}

export async function entryWritesGranted(
  types: readonly HealthRecordType[],
): Promise<HealthRecordType[]> {
  return GRANTED_TYPES.parse(await nativeFor('entryWritesGranted').entryWritesGranted(types));
}

export async function deliverEntries(): Promise<EntryReport> {
  return ENTRY_REPORT.parse(await nativeFor('deliverEntries').deliverEntries());
}
