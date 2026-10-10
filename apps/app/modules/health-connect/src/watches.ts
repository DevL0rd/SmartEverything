import { z } from 'zod';
import {
  WATCH_ACTION_RESULT,
  WATCH_CALENDAR,
  type WatchCalendarEvent,
  type WatchActionResult,
} from '@smarteverything/domain';
import { AppUpdateNeededError, nativeFor, type SyncProgressSubscription } from './health-connect';
import {
  ASSOCIATION_RESULT,
  PHONE_APPS,
  WATCH_RELAY_STATUS,
  type PhoneApp,
  type WatchRelayChange,
  type WatchRelayStatus,
  PHONE_WATCH_STATUSES,
  WATCH_EVENT,
  WATCH_FAMILY_INFO,
  type PhoneWatchStatus,
  type WatchEvent,
} from './schemas';

export async function syncWatches(serverUrl: string, token: string): Promise<PhoneWatchStatus[]> {
  return PHONE_WATCH_STATUSES.parse(await nativeFor('syncWatches').syncWatches(serverUrl, token));
}

export async function runPushCommand(command: string, payloadJson: string): Promise<void> {
  await nativeFor('runPushCommand').runPushCommand(command, payloadJson);
}

export async function startWatches(): Promise<void> {
  await nativeFor('startWatches').startWatches();
}

export async function pauseWatch(deviceId: string, paused: boolean): Promise<void> {
  await nativeFor('pauseWatch').pauseWatch(deviceId, paused);
}

export async function setWatchLive(on: boolean): Promise<void> {
  await nativeFor('setWatchLive').setWatchLive(on);
}

export async function refreshWatches(): Promise<void> {
  await nativeFor('refreshWatches').refreshWatches();
}

function missingOnly(error: z.ZodError): boolean {
  return error.issues.every((issue) => issue.code === 'invalid_type' && issue.input === undefined);
}

export async function watchStatus(): Promise<PhoneWatchStatus[]> {
  const parsed = PHONE_WATCH_STATUSES.safeParse(await nativeFor('watchStatus').watchStatus(), {
    reportInput: true,
  });
  if (parsed.success) {
    return parsed.data;
  }
  if (missingOnly(parsed.error)) {
    throw new AppUpdateNeededError('watch sync status');
  }
  throw parsed.error;
}

export async function associateWatch(deviceId: string): Promise<string> {
  return ASSOCIATION_RESULT.parse(await nativeFor('associateWatch').associateWatch(deviceId));
}

export async function watchFamilies(): Promise<{ readonly id: string; readonly label: string }[]> {
  return WATCH_FAMILY_INFO.parse(await nativeFor('watchFamilies').watchFamilies());
}

export function addWatchEventListener(
  listener: (event: WatchEvent) => void,
): SyncProgressSubscription {
  return nativeFor('addListener').addListener('onWatchEvent', (payload) => {
    listener(WATCH_EVENT.parse(payload));
  });
}

export async function syncWatchNow(): Promise<void> {
  await nativeFor('syncWatchNow').syncWatchNow();
}

const GRANTED = z.boolean();

export async function requestWatchWrites(): Promise<boolean> {
  return GRANTED.parse(await nativeFor('requestWatchWrites').requestWatchWrites());
}

export async function watchWritesGranted(): Promise<boolean> {
  return GRANTED.parse(await nativeFor('watchWritesGranted').watchWritesGranted());
}

export async function openAppSettings(packageName: string): Promise<void> {
  await nativeFor('openAppSettings').openAppSettings(packageName);
}

const SENT_TO = z.int().min(0);

export async function findWatch(deviceId: string, on: boolean): Promise<boolean> {
  return GRANTED.parse(await nativeFor('findWatch').findWatch(deviceId, on));
}

export async function watchRelayStatus(): Promise<WatchRelayStatus> {
  return WATCH_RELAY_STATUS.parse(await nativeFor('watchRelayStatus').watchRelayStatus());
}

export async function setWatchRelay(change: WatchRelayChange): Promise<WatchRelayStatus> {
  return WATCH_RELAY_STATUS.parse(await nativeFor('setWatchRelay').setWatchRelay({ ...change }));
}

export async function phoneApps(): Promise<PhoneApp[]> {
  return PHONE_APPS.parse(await nativeFor('phoneApps').phoneApps());
}

export async function openNotificationAccess(): Promise<void> {
  await nativeFor('openNotificationAccess').openNotificationAccess();
}

export async function openDndAccess(): Promise<void> {
  await nativeFor('openDndAccess').openDndAccess();
}

export async function probeWatchWorkout(
  deviceId: string,
  sport: number,
  on: boolean,
): Promise<WatchActionResult> {
  return WATCH_ACTION_RESULT.parse(
    await nativeFor('runWatchAction').runWatchAction(
      deviceId,
      JSON.stringify({ type: 'debug_workout', sport, on }),
    ),
  );
}

export async function setWatchCalendar(events: readonly WatchCalendarEvent[]): Promise<number> {
  const checked = WATCH_CALENDAR.parse(events);
  return SENT_TO.parse(
    await nativeFor('setWatchCalendar').setWatchCalendar(JSON.stringify(checked)),
  );
}
