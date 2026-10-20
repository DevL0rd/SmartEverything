import { describe, expect, it } from 'vitest';
import {
  CAMERA_NOTIFICATION_KINDS,
  CAMERA_NOTIFICATIONS_PREF,
  CLIENT_PREFS,
  DEFAULT_CAMERA_NOTIFICATIONS,
  cameraCooldownMinutes,
  cameraNotificationOn,
  cameraQuietHours,
  inQuietHours,
  withCameraCooldown,
  withCameraNotification,
  withCameraQuiet,
} from '../src';

const base = DEFAULT_CAMERA_NOTIFICATIONS;

describe('camera notification settings', () => {
  it('keep a global default for every kind and a two minute cooldown', () => {
    expect(Object.keys(base.kinds).sort()).toEqual([...CAMERA_NOTIFICATION_KINDS].sort());
    expect(base.cooldownMinutes).toBe(2);
    expect(base.quiet).toBeNull();
  });

  it('turn a kind on for one camera only, and forget the override when it matches the default again', () => {
    const on = withCameraNotification(base, 'a', 'person', true);
    expect(cameraNotificationOn(on, 'a', 'person')).toBe(true);
    expect(cameraNotificationOn(on, 'b', 'person')).toBe(false);
    expect(withCameraNotification(on, 'a', 'person', false)).toEqual(base);
  });

  it('follow the default until a camera sets its own cooldown or quiet hours', () => {
    const own = withCameraQuiet(withCameraCooldown(base, 'a', 10), 'a', {
      from: '22:00',
      to: '06:00',
    });
    expect(cameraCooldownMinutes(own, 'a')).toBe(10);
    expect(cameraCooldownMinutes(own, 'b')).toBe(2);
    expect(cameraQuietHours(own, 'a')).toEqual({ from: '22:00', to: '06:00' });
    expect(cameraQuietHours(own, 'b')).toBeNull();
    expect(cameraQuietHours(withCameraQuiet(own, 'a', 'off'), 'a')).toBeNull();
    expect(withCameraCooldown(withCameraQuiet(own, 'a', null), 'a', null)).toEqual(base);
  });

  it('know whether a minute of the day is quiet, across midnight and for an empty window', () => {
    const night = { from: '22:00', to: '06:00' };
    expect(inQuietHours(night, 23 * 60)).toBe(true);
    expect(inQuietHours(night, 5 * 60 + 59)).toBe(true);
    expect(inQuietHours(night, 6 * 60)).toBe(false);
    expect(inQuietHours({ from: '09:00', to: '17:00' }, 12 * 60)).toBe(true);
    expect(inQuietHours({ from: '09:00', to: '09:00' }, 9 * 60)).toBe(false);
    expect(inQuietHours(null, 0)).toBe(false);
  });

  it('are stored per person and refuse a malformed clock', () => {
    const definition = CLIENT_PREFS.camera_notifications;
    expect(definition.scope).toBe('profile');
    expect(definition.decode(definition.encode(base))).toEqual({
      status: 'stored',
      value: base,
      migrated: false,
    });
    expect(
      CAMERA_NOTIFICATIONS_PREF.safeParse({ ...base, quiet: { from: '25:00', to: '06:00' } })
        .success,
    ).toBe(false);
  });
});
