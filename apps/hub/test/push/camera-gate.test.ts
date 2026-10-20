import {
  DEFAULT_CAMERA_NOTIFICATIONS,
  withCameraCooldown,
  withCameraNotification,
  withCameraQuiet,
  type CameraNotificationKind,
  type CameraNotificationsPref,
  type ClientPrefRead,
} from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { describe, expect, it } from 'vitest';
import { CameraGate } from '../../src/extensions/push/camera-gate';
import type { CameraNotice } from '../../src/extensions/push/camera-notice';
import { captureLogs } from '../support/logs';

const CAMERA = 'cam-1';
const PHONE = 'phone-1';
const MINUTE = 60_000;

function notice(kind: CameraNotificationKind, recovered = false): CameraNotice {
  return { deviceId: CAMERA, eventId: 'e', kind, recovered, eventKind: 'motion' };
}

class Bench {
  at = Date.parse('2026-10-18T12:00:00.000Z');
  pref: ClientPrefRead<CameraNotificationsPref> = {
    status: 'stored',
    value: DEFAULT_CAMERA_NOTIFICATIONS,
    migrated: false,
  };
  zone = 'UTC';
  readonly gate = new CameraGate({
    prefOf: (): ClientPrefRead<CameraNotificationsPref> => this.pref,
    now: (): Date => new Date(this.at),
    timeZone: (): string => this.zone,
    log: new Logger('hub.push'),
  });

  use(value: CameraNotificationsPref): void {
    this.pref = { status: 'stored', value, migrated: false };
  }

  later(minutes: number): void {
    this.at += minutes * MINUTE;
  }

  admit(kind: CameraNotificationKind, recovered = false): boolean {
    return this.gate.admit(PHONE, notice(kind, recovered));
  }
}

describe('which camera notices reach a phone', () => {
  it('lets only the kinds that are on by default through', () => {
    const bench = new Bench();
    expect(bench.admit('doorbell')).toBe(true);
    expect(bench.admit('baby_cry')).toBe(true);
    expect(bench.admit('alarm')).toBe(false);
    expect(bench.admit('motion')).toBe(false);
  });

  it('follows a camera’s own switch over the default', () => {
    const bench = new Bench();
    bench.use(withCameraNotification(DEFAULT_CAMERA_NOTIFICATIONS, CAMERA, 'person', true));
    expect(bench.admit('person')).toBe(true);
    bench.use(withCameraNotification(DEFAULT_CAMERA_NOTIFICATIONS, CAMERA, 'doorbell', false));
    expect(bench.admit('doorbell')).toBe(false);
  });

  it('lets one notice per kind through per cooldown, however many events arrive', () => {
    const bench = new Bench();
    bench.use(withCameraNotification(DEFAULT_CAMERA_NOTIFICATIONS, CAMERA, 'person', true));
    const storm = Array.from({ length: 40 }, () => {
      bench.later(1 / 60);
      return bench.admit('person');
    });
    expect(storm.filter(Boolean)).toHaveLength(1);
    bench.later(2);
    expect(bench.admit('person')).toBe(true);
  });

  it('keeps the cooldown per kind and per camera', () => {
    const bench = new Bench();
    expect(bench.admit('doorbell')).toBe(true);
    expect(bench.admit('baby_cry')).toBe(true);
    expect(bench.gate.admit(PHONE, { ...notice('doorbell'), deviceId: 'cam-2' })).toBe(true);
    expect(bench.admit('doorbell')).toBe(false);
  });

  it('uses a camera’s own cooldown, and none at all when it is 0', () => {
    const bench = new Bench();
    bench.use(withCameraCooldown(DEFAULT_CAMERA_NOTIFICATIONS, CAMERA, 10));
    expect(bench.admit('doorbell')).toBe(true);
    bench.later(5);
    expect(bench.admit('doorbell')).toBe(false);
    bench.later(5);
    expect(bench.admit('doorbell')).toBe(true);
    bench.use({ ...DEFAULT_CAMERA_NOTIFICATIONS, cooldownMinutes: 0 });
    expect([bench.admit('doorbell'), bench.admit('doorbell')]).toEqual([true, true]);
  });

  it('stays silent in quiet hours that cross midnight, in the home time zone', () => {
    const bench = new Bench();
    bench.use({ ...DEFAULT_CAMERA_NOTIFICATIONS, quiet: { from: '22:00', to: '07:00' } });
    bench.zone = 'Asia/Bangkok';
    bench.at = Date.parse('2026-10-18T16:30:00.000Z');
    expect(bench.admit('doorbell')).toBe(false);
    bench.at = Date.parse('2026-10-18T05:00:00.000Z');
    expect(bench.admit('doorbell')).toBe(true);
  });

  it('lets one camera ignore the global quiet hours', () => {
    const bench = new Bench();
    const quiet = { ...DEFAULT_CAMERA_NOTIFICATIONS, quiet: { from: '11:00', to: '13:00' } };
    bench.use(quiet);
    expect(bench.admit('doorbell')).toBe(false);
    bench.use(withCameraQuiet(quiet, CAMERA, 'off'));
    expect(bench.admit('doorbell')).toBe(true);
  });

  it('collapses a storm of offline reports into one notice an hour that clears on recovery', () => {
    const bench = new Bench();
    const reports = Array.from({ length: 30 }, () => {
      bench.later(1);
      return bench.admit('offline');
    });
    expect(reports.filter(Boolean)).toHaveLength(1);
    expect(bench.admit('offline', true)).toBe(true);
    expect(bench.admit('offline', true)).toBe(false);
    bench.later(61);
    expect(bench.admit('offline')).toBe(true);
  });

  it('does not repeat an offline notice because the camera flapped within the hour', () => {
    const bench = new Bench();
    expect(bench.admit('offline')).toBe(true);
    expect(bench.admit('offline', true)).toBe(true);
    bench.later(5);
    expect(bench.admit('offline')).toBe(false);
  });

  it('says nothing about a recovery that had no offline notice', () => {
    const bench = new Bench();
    bench.use(withCameraNotification(DEFAULT_CAMERA_NOTIFICATIONS, CAMERA, 'offline', false));
    expect(bench.admit('offline')).toBe(false);
    expect(bench.admit('offline', true)).toBe(false);
  });

  it('still notifies, and says so, when the saved setting cannot be read', () => {
    const logs = captureLogs();
    const bench = new Bench();
    bench.pref = { status: 'invalid', reason: 'wrong version' };
    expect(bench.admit('motion')).toBe(true);
    expect(logs.events()).toContain('push.camera_notifications_unreadable');
  });
});
