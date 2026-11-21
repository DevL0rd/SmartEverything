import { deviceAlertsOn } from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { Audience } from './reply-audience';

export function deviceAudience(deviceId: string | null, log: Logger): Audience {
  if (deviceId === null) {
    return () => true;
  }
  return (client) => {
    const read = client.deviceAlerts;
    if (read.status === 'invalid') {
      log.warn('push.device_alerts_unreadable', {
        clientId: client.clientId,
        deviceId,
        reason: read.reason,
      });
      return true;
    }
    return deviceAlertsOn(read.value, deviceId);
  };
}
