import {
  deviceAlertsOn,
  type ClientPrefRead,
  type DeviceAlertsPref,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { Audience } from './reply-audience';

export interface DeviceAudienceDeps {
  readonly alertsOf: (clientId: string) => ClientPrefRead<DeviceAlertsPref>;
  readonly log: Logger;
}

export function deviceAudience(deviceId: string | null, deps: DeviceAudienceDeps): Audience {
  if (deviceId === null) {
    return () => true;
  }
  return (clientId) => {
    const read = deps.alertsOf(clientId);
    if (read.status === 'invalid') {
      deps.log.warn('push.device_alerts_unreadable', {
        clientId,
        deviceId,
        reason: read.reason,
      });
      return true;
    }
    return deviceAlertsOn(read.value, deviceId);
  };
}
