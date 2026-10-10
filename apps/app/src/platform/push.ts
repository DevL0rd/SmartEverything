import * as Notifications from 'expo-notifications';
import { z } from 'zod';
import { API_ENDPOINTS as E } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { api } from '../api/transport';
import { appPlatform } from '../design/platform';

const log = new Logger('app.push');

export type PushRegistration =
  | { readonly registered: true; readonly platform: 'android' }
  | { readonly registered: false; readonly reason: string };

export const PUSH_UNAVAILABLE = {
  web: 'Alerts show while this page is open',
  desktop: 'Alerts show as system notifications while the app runs',
} as const;

export type PushPermission = 'granted' | 'denied' | 'undetermined';

export async function pushPermission(): Promise<PushPermission> {
  return (await Notifications.getPermissionsAsync()).status;
}

const FCM_TOKEN = z.object({ type: z.literal('android'), data: z.string().min(1) });

async function firebaseToken(): Promise<string> {
  const token: unknown = await Notifications.getDevicePushTokenAsync();
  return FCM_TOKEN.parse(token).data;
}

export async function registerForPush(): Promise<PushRegistration> {
  const form = appPlatform();
  if (form !== 'android') {
    log.info('push.not_available', { form });
    return { registered: false, reason: PUSH_UNAVAILABLE[form] };
  }
  const permission = await Notifications.requestPermissionsAsync();
  if (!permission.granted) {
    log.warn('push.permission_refused');
    return {
      registered: false,
      reason: 'Notifications are off for SmartEverything in Android settings',
    };
  }
  await saveToken(await firebaseToken());
  log.info('push.registered');
  return { registered: true, platform: 'android' };
}

async function saveToken(token: string): Promise<void> {
  await api().call(E.savePushTarget, { body: { token, platform: 'android' } });
}

export async function forgetThisPhone(): Promise<void> {
  if (appPlatform() !== 'android') {
    return;
  }
  const permission = await Notifications.getPermissionsAsync();
  if (!permission.granted) {
    return;
  }
  await api().call(E.removePushTarget, { body: { token: await firebaseToken() } });
  log.info('push.forgotten');
}
