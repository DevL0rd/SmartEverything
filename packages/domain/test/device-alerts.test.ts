import { describe, expect, it } from 'vitest';
import { CLIENT_PREFS, deviceAlertsOn, withDeviceAlerts } from '../src';

describe('device alerts', () => {
  it('alerts for every device until one is muted', () => {
    const pref = CLIENT_PREFS.device_alerts.defaultValue;
    expect(deviceAlertsOn(pref, 'camera-1')).toBe(true);
    const muted = withDeviceAlerts(pref, 'camera-1', false);
    expect(deviceAlertsOn(muted, 'camera-1')).toBe(false);
    expect(deviceAlertsOn(muted, 'camera-2')).toBe(true);
  });

  it('turns a muted device back on without touching the others', () => {
    const pref = withDeviceAlerts(withDeviceAlerts({ muted: [] }, 'a', false), 'b', false);
    expect(withDeviceAlerts(pref, 'a', true)).toEqual({ muted: ['b'] });
  });

  it('lists a device once however often it is muted', () => {
    const once = withDeviceAlerts({ muted: [] }, 'a', false);
    expect(withDeviceAlerts(once, 'a', false)).toEqual({ muted: ['a'] });
  });

  it('is stored per person and survives an encode and decode', () => {
    const definition = CLIENT_PREFS.device_alerts;
    expect(definition.scope).toBe('profile');
    const read = definition.decode(definition.encode({ muted: ['x'] }));
    expect(read).toEqual({ status: 'stored', value: { muted: ['x'] }, migrated: false });
  });
});
