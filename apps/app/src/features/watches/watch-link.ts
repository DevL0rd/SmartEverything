import { useEffect } from 'react';
import { AppState, PermissionsAndroid, Platform } from 'react-native';
import { Logger, background } from '@smarteverything/logging';
import {
  AppUpdateNeededError,
  addWatchEventListener,
  associateWatch,
  findWatch,
  isHealthConnectLinked,
  openAppSettings,
  pauseWatch,
  refreshWatches,
  setWatchLive,
  startWatches,
  syncWatchNow,
  syncWatches,
  watchStatus,
  type PhoneWatchStatus,
  type WatchEvent,
} from '../../../modules/health-connect';
import { takeOverWatchBridge } from '../../api/watches';
import { startWatchCapture } from '../../developer/watch-capture';
import { ValueStore, useValue } from '../../design/external-store';
import { rawErrorText } from '../../format/errors';
import { sameJson } from '../../store/same-json';
import { useActiveProfile } from '../../store/people';
import { useDevices } from '../../store/selectors';
import { usePairedServer, type RelayServer } from '../profiles';
import { bridgeOf } from './watch-bridge';

const log = new Logger('app.watch');

export type WatchLinkState =
  | { readonly kind: 'unsupported' }
  | { readonly kind: 'starting' }
  | { readonly kind: 'ready'; readonly watches: readonly PhoneWatchStatus[] }
  | { readonly kind: 'update_needed'; readonly reason: string }
  | { readonly kind: 'failed'; readonly reason: string };

const linkState = new ValueStore<WatchLinkState>(
  isHealthConnectLinked ? { kind: 'starting' } : { kind: 'unsupported' },
);

export function useWatchLink(): WatchLinkState {
  return useValue(linkState);
}

export function usePhoneWatch(deviceId: string): PhoneWatchStatus | null {
  const state = useWatchLink();
  return state.kind === 'ready'
    ? (state.watches.find((watch) => watch.deviceId === deviceId) ?? null)
    : null;
}

let lastFailure: string | null = null;

function failed(event: string, error: unknown): void {
  const reason = rawErrorText(error);
  const updateNeeded = error instanceof AppUpdateNeededError;
  if (lastFailure !== `${event}:${reason}`) {
    lastFailure = `${event}:${reason}`;
    log.warn(event, { reason, operation: updateNeeded ? error.operation : null });
  }
  linkState.set({ kind: updateNeeded ? 'update_needed' : 'failed', reason });
}

const reading = {
  active: false,
  stale: false,
  again(): boolean {
    return this.stale;
  },
};

async function readStatus(): Promise<void> {
  try {
    const watches = await watchStatus();
    const current = linkState.get();
    if (current.kind !== 'ready' || !sameJson(current.watches, watches)) {
      linkState.set({ kind: 'ready', watches });
    }
    lastFailure = null;
  } catch (error) {
    failed('watch.status_unreadable', error);
  }
}

async function refreshStatus(): Promise<void> {
  if (reading.active) {
    reading.stale = true;
    return;
  }
  reading.active = true;
  try {
    do {
      reading.stale = false;
      await readStatus();
    } while (reading.again());
  } finally {
    reading.active = false;
  }
}

function androidApi(): number {
  return Platform.OS === 'android' && typeof Platform.Version === 'number' ? Platform.Version : 0;
}

async function permitted(): Promise<boolean> {
  if (androidApi() < 31) {
    return true;
  }
  const connect = PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT;
  if (await PermissionsAndroid.check(connect)) {
    return true;
  }
  const answer = await PermissionsAndroid.request(connect);
  log.info('watch.permission_answered', { answer });
  if (androidApi() >= 33) {
    const notify = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
    );
    log.info('watch.notification_permission_answered', { answer: notify });
  }
  return answer === PermissionsAndroid.RESULTS.GRANTED;
}

async function bringUp(server: RelayServer): Promise<void> {
  try {
    const watches = await syncWatches(server.url, server.token);
    log.info('watch.synced', { watches: watches.length });
    if (watches.length > 0 && (await permitted())) {
      await startWatchCapture();
      await startWatches();
      await setWatchLive(AppState.currentState === 'active');
    }
  } catch (error) {
    failed('watch.not_started', error);
    return;
  }
  await refreshStatus();
}

const NOTABLE = new Set([
  'failed',
  'sync_failed',
  'sync_file_unsupported',
  'sync_list_window_full',
  'sync_file_unreadable',
  'sync_file_implausible',
  'sync_sleep_empty',
  'data_failed',
  'gave_up',
  'report_failed',
  'watch_not_recognised',
  'service_refused',
  'packet_unreadable',
]);

function logEvent(event: WatchEvent): void {
  const payload = { detail: event.detail, at: event.at, device: event.deviceId ?? null };
  if (NOTABLE.has(event.event)) {
    log.warn(`watch.native_${event.event}`, payload);
  } else {
    log.info(`watch.native_${event.event}`, payload);
  }
  background(refreshStatus(), 'status.refresh_failed');
}

async function run(event: string, work: () => Promise<unknown>): Promise<void> {
  try {
    await work();
  } catch (error) {
    failed(event, error);
    return;
  }
  await refreshStatus();
}

export async function setPaused(deviceId: string, paused: boolean): Promise<void> {
  log.info('watch.pause_changed', { device: deviceId, paused });
  await run('watch.pause_failed', () => pauseWatch(deviceId, paused));
}

export async function reconnect(): Promise<void> {
  log.info('watch.reconnect_requested');
  await run('watch.reconnect_failed', async () => {
    if (await permitted()) {
      await startWatches();
      await refreshWatches();
    }
  });
}

export async function ringWatch(deviceId: string, on: boolean): Promise<void> {
  log.info('watch.find_requested', { device: deviceId, on });
  await run('watch.find_failed', async () => {
    if (!(await findWatch(deviceId, on))) {
      throw new WatchNotConnectedError();
    }
  });
}

class WatchNotConnectedError extends Error {
  override readonly name = 'WatchNotConnectedError';

  constructor() {
    super('The watch is not connected to this phone right now.');
  }
}

export async function takeOverBridge(deviceId: string): Promise<void> {
  log.info('watch.bridge_take_over_requested', { device: deviceId });
  await run('watch.bridge_take_over_failed', async () => {
    const bridge = await takeOverWatchBridge(deviceId);
    log.info('watch.bridge_taken_over', { device: deviceId, since: bridge.since });
  });
}

export async function syncNow(): Promise<void> {
  log.info('watch.sync_requested');
  await run('watch.sync_failed', syncWatchNow);
}

export async function openVendorSettings(packageName: string): Promise<void> {
  await run('watch.vendor_settings_failed', () => openAppSettings(packageName));
}

export async function keepInBackground(deviceId: string): Promise<void> {
  await run('watch.companion_failed', async () => {
    const result = await associateWatch(deviceId);
    log.info('watch.companion_answered', { device: deviceId, result });
    await startWatches();
  });
}

function useWatchKey(): string {
  const profileId = useActiveProfile()?.id ?? null;
  return useDevices({ includeHidden: true })
    .filter(
      (device) =>
        device.provider === 'local' &&
        device.details['driver'] === 'xiaomi_watch' &&
        device.details['profileId'] === profileId,
    )
    .map((device) => `${device.id}:${bridgeOf(device)?.clientId ?? ''}`)
    .join(',');
}

export function WatchLinkHost(): null {
  const paired = usePairedServer();
  const url = paired?.url ?? null;
  const token = paired?.token ?? null;
  const watches = useWatchKey();
  useEffect(() => {
    if (!isHealthConnectLinked || url === null || token === null) {
      return undefined;
    }
    const events = addWatchEventListener(logEvent);
    background(bringUp({ url, token }), 'up.bring_failed');
    const app = AppState.addEventListener('change', (state) => {
      void setWatchLive(state === 'active').catch((error: unknown) => {
        failed('watch.live_failed', error);
      });
    });
    return (): void => {
      events.remove();
      app.remove();
    };
  }, [watches, url, token]);
  return null;
}
