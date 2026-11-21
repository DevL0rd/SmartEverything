import type { ClientPrefRead, DeviceAlertsPref } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { deviceAudience } from '../../src/extensions/push/device-audience';
import { captureLogs } from '../support/logs';
import { pushClient } from '../support/push-client';
import { Logger } from '@smarteverything/logging';

function stored(muted: readonly string[]): ClientPrefRead<DeviceAlertsPref> {
  return { status: 'stored', value: { muted: [...muted] }, migrated: false };
}

const log = new Logger('hub.push');

describe('who a device’s alerts reach', () => {
  it('reaches everyone when the event belongs to no device', () => {
    const audience = deviceAudience(null, log);
    expect(audience(pushClient({ deviceAlerts: stored(['a']) }))).toBe(true);
  });

  it('skips the phones of a person who muted that device only', () => {
    const muted = pushClient({ deviceAlerts: stored(['a']) });
    expect(deviceAudience('a', log)(muted)).toBe(false);
    expect(deviceAudience('b', log)(muted)).toBe(true);
  });

  it('still alerts, and says so, when the saved setting cannot be read', () => {
    const logs = captureLogs();
    const audience = deviceAudience('a', log);
    expect(
      audience(pushClient({ deviceAlerts: { status: 'invalid', reason: 'wrong version' } })),
    ).toBe(true);
    expect(logs.events()).toContain('push.device_alerts_unreadable');
  });
});
