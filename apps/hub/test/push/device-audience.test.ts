import type { ClientPrefRead, DeviceAlertsPref, PushTargetRow } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { deviceAudience } from '../../src/extensions/push/device-audience';
import { captureLogs } from '../support/logs';
import { Logger } from '@smarteverything/logging';

const TARGET: PushTargetRow = {
  token: 't',
  client_id: 'client-1',
  platform: 'android',
  created_at: '2026-10-18T10:00:00.000Z',
};

function stored(muted: readonly string[]): ClientPrefRead<DeviceAlertsPref> {
  return { status: 'stored', value: { muted: [...muted] }, migrated: false };
}

const log = new Logger('hub.push');

describe('who a device’s alerts reach', () => {
  it('reaches everyone when the event belongs to no device', () => {
    const audience = deviceAudience(null, { alertsOf: () => stored(['a']), log });
    expect(audience(TARGET)).toBe(true);
  });

  it('skips the phones of a person who muted that device only', () => {
    const audience = deviceAudience('a', { alertsOf: () => stored(['a']), log });
    expect(audience(TARGET)).toBe(false);
    expect(deviceAudience('b', { alertsOf: () => stored(['a']), log })(TARGET)).toBe(true);
  });

  it('still alerts, and says so, when the saved setting cannot be read', () => {
    const logs = captureLogs();
    const audience = deviceAudience('a', {
      alertsOf: () => ({ status: 'invalid', reason: 'wrong version' }),
      log,
    });
    expect(audience(TARGET)).toBe(true);
    expect(logs.events()).toContain('push.device_alerts_unreadable');
  });
});
