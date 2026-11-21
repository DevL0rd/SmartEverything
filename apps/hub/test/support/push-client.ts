import { CLIENT_PREFS, type ClientPrefRead } from '@smarteverything/domain';
import type { PushClient } from '../../src/extensions/push/push-units';

function stored<T>(value: T): ClientPrefRead<T> {
  return { status: 'stored', value, migrated: false };
}

export function pushClient(overrides: Partial<PushClient> = {}): PushClient {
  return {
    clientId: 'client-1',
    profileId: 'profile-1',
    role: 'owner',
    deviceAlerts: stored(CLIENT_PREFS.device_alerts.defaultValue),
    cameraNotifications: stored(CLIENT_PREFS.camera_notifications.defaultValue),
    driveNotifications: stored(CLIENT_PREFS.drive_notifications.defaultValue),
    photos: stored(CLIENT_PREFS.photos.defaultValue),
    ...overrides,
  };
}
