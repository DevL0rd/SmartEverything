import { useEffect } from 'react';
import { AppState, PermissionsAndroid } from 'react-native';
import { Logger, background } from '@smarteverything/logging';
import {
  AppUpdateNeededError,
  addScaleEventListener,
  configureServer,
  deliverBodyReadings,
  healthConnectConfigured,
  isHealthConnectLinked,
  scaleRelayStatus,
  startScaleLiveScan,
  startScaleRelay,
  stopScaleLiveScan,
  stopScaleRelay,
  type ScaleEvent,
  type ScaleRelayStatus,
} from '../../../modules/health-connect';
import { ValueStore, useValue } from '../../design/external-store';
import { friendlyError, rawErrorText } from '../../format/errors';
import { useConnection } from '../../api/transport';
import { counted, isLocalScale, useActiveProfile } from '../../store/people';
import { useStoreSelector } from '../../store/store-context';
import { rowsOf, type StoreState } from '../../store/state';

const log = new Logger('app.scale');

export type RelayState =
  | { readonly kind: 'unsupported' }
  | { readonly kind: 'starting' }
  | { readonly kind: 'ready'; readonly native: ScaleRelayStatus; readonly live: boolean }
  | { readonly kind: 'update_needed'; readonly reason: string }
  | { readonly kind: 'failed'; readonly reason: string };

const relayState = new ValueStore<RelayState>(
  isHealthConnectLinked ? { kind: 'starting' } : { kind: 'unsupported' },
);

export function useRelayState(): RelayState {
  return useValue(relayState);
}

let live = false;

function operationOf(error: unknown): string | null {
  return error instanceof AppUpdateNeededError ? error.operation : null;
}

function failed(event: string, error: unknown): void {
  const reason = rawErrorText(error);
  log.warn(event, { reason, operation: operationOf(error) });
  relayState.set({
    kind: error instanceof AppUpdateNeededError ? 'update_needed' : 'failed',
    reason,
  });
}

async function refreshRelay(): Promise<void> {
  try {
    relayState.set({ kind: 'ready', native: await scaleRelayStatus(), live });
  } catch (error) {
    failed('scale.status_unreadable', error);
  }
}

async function permitted(): Promise<boolean> {
  const scan = PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN;
  if (await PermissionsAndroid.check(scan)) {
    return true;
  }
  const answer = await PermissionsAndroid.request(scan);
  log.info('scale.permission_answered', { answer });
  return answer === PermissionsAndroid.RESULTS.GRANTED;
}

export interface RelayServer {
  readonly url: string;
  readonly token: string;
}

async function startListening(server: RelayServer): Promise<void> {
  try {
    await configureServer(server.url, server.token);
    if (await permitted()) {
      const scales = await startScaleRelay();
      log.info('scale.listening', { scales });
    }
  } catch (error) {
    failed('scale.relay_not_started', error);
    return;
  }
  await refreshRelay();
}

let server: RelayServer | null = null;

export async function listenAgain(): Promise<void> {
  if (server === null) {
    log.warn('scale.relay_not_started', { reason: 'this app is not paired with a server' });
    return;
  }
  await startListening(server);
}

async function setLive(on: boolean): Promise<void> {
  try {
    if (on) {
      await startScaleLiveScan();
    } else {
      await stopScaleLiveScan();
    }
    live = on;
  } catch (error) {
    failed('scale.live_scan_failed', error);
    return;
  }
  await refreshRelay();
}

export type WriteState =
  | { readonly kind: 'ready' }
  | { readonly kind: 'needs_permission'; readonly waiting: number }
  | { readonly kind: 'failed'; readonly reason: string };

const writeState = new ValueStore<WriteState>({ kind: 'ready' });

export function useWriteState(): WriteState {
  return useValue(writeState);
}

export async function retryHealthConnectWrites(): Promise<void> {
  try {
    if (!(await healthConnectConfigured())) {
      log.info('scale.health_connect_not_set_up', { reason: 'weigh-ins stay on your server' });
      writeState.set({ kind: 'ready' });
      return;
    }
    const report = await deliverBodyReadings();
    log.info('scale.saved_to_health_connect', { written: report.written, waiting: report.waiting });
    writeState.set(
      report.missingPermission
        ? { kind: 'needs_permission', waiting: report.waiting }
        : { kind: 'ready' },
    );
  } catch (error) {
    log.warn('scale.not_saved_to_health_connect', {
      reason: String(error),
      operation: operationOf(error),
    });
    writeState.set({
      kind: 'failed',
      reason: friendlyError(error) ?? rawErrorText(error),
    });
  }
}

function logEvent(event: ScaleEvent): void {
  const payload = { detail: event.detail, at: event.at };
  if (event.event === 'failed') {
    log.warn(`scale.native_${event.event}`, payload);
  } else {
    log.info(`scale.native_${event.event}`, payload);
  }
  background(refreshRelay(), 'relay.refresh_failed');
}

function passiveAddresses(state: StoreState): string {
  return rowsOf(state.tables.devices)
    .filter(
      (device) => isLocalScale(device) || typeof device.details['bleObserverAddress'] === 'string',
    )
    .flatMap((device) => {
      const address = isLocalScale(device)
        ? device.details['address']
        : device.details['bleObserverAddress'];
      return typeof address === 'string' ? [address] : [];
    })
    .join(',');
}

function usePassiveAddresses(): string {
  return useStoreSelector(passiveAddresses);
}

function useUnsavedReadings(): string {
  const profileId = useActiveProfile()?.id ?? null;
  return useStoreSelector(
    (state) =>
      rowsOf(state.tables.body_readings)
        .filter(
          (reading) =>
            reading.profile_id === profileId &&
            counted(reading) &&
            reading.saved_to_health_connect_at === null,
        )
        .map((reading) => `${reading.id}:${String(reading.version)}`)
        .join(','),
    Object.is,
    [profileId],
  );
}

export function usePairedServer(): RelayServer | null {
  const connection = useConnection();
  return connection.status === 'paired' ? connection.connection : null;
}

function useListening(addresses: string): void {
  const paired = usePairedServer();
  const url = paired?.url ?? null;
  const token = paired?.token ?? null;
  useEffect(() => {
    if (!isHealthConnectLinked) {
      return undefined;
    }
    if (addresses === '' || url === null || token === null) {
      server = null;
      void stopScaleRelay().catch((error: unknown) => {
        failed('scale.relay_not_stopped', error);
      });
      return undefined;
    }
    server = { url, token };
    const events = addScaleEventListener(logEvent);
    background(
      startListening(server).then(() => setLive(AppState.currentState === 'active')),
      'listening.start_failed',
    );
    const app = AppState.addEventListener('change', (state) => {
      background(setLive(state === 'active'), 'live.set_failed');
    });
    return (): void => {
      events.remove();
      app.remove();
      background(setLive(false), 'live.set_failed');
    };
  }, [addresses, url, token]);
}

export function ScaleListenerHost(): null {
  const addresses = usePassiveAddresses();
  const unsaved = useUnsavedReadings();
  useListening(addresses);
  useEffect(() => {
    if (isHealthConnectLinked && unsaved !== '') {
      background(retryHealthConnectWrites(), 'health_connect_writes.retry_failed');
    }
  }, [unsaved]);
  return null;
}
