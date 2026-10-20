import {
  CLIENT_PREFS,
  DEFAULT_CAMERA_NOTIFICATIONS,
  type CameraNotificationsPref,
} from '@smarteverything/domain';
import { describe, expect, it, vi } from 'vitest';
import { call } from '../support/server';
import { usePushBench } from './push-bench';

const bench = usePushBench();

const STORM = 25;

async function savePref(token: string, pref: CameraNotificationsPref): Promise<void> {
  const saved = await call(bench.booted.base, token, {
    method: 'PUT',
    path: `/api/layouts/${CLIENT_PREFS.camera_notifications.storageKey}`,
    body: { layout: CLIENT_PREFS.camera_notifications.encode(pref) },
  });
  expect(saved.status).toBe(200);
}

function titles(): readonly string[] {
  return bench.google.sent.flatMap((sent) => {
    const message = JSON.stringify(sent.body);
    return [/"title":"([^"]+)"/.exec(message)?.[1] ?? ''];
  });
}

describe('camera notifications', () => {
  it('sends nothing for a storm of camera alarms nobody asked for, and still rings the doorbell', async () => {
    await bench.saveAccount();
    await bench.registerPhone('fcm-a');
    for (let index = 0; index < STORM; index += 1) {
      bench.happen({ kind: 'alarm', details: { miotEvent: 'no-huamn-appear' } });
    }
    bench.happen({ kind: 'doorbell' });
    await vi.waitFor(() => {
      expect(bench.google.sent).toHaveLength(1);
    });
    expect(titles()).toEqual(['Doorbell']);
  });

  it('sends one person notification for a storm of person events once the person turned it on', async () => {
    await bench.saveAccount();
    const phone = await bench.registerPhone('fcm-a');
    await savePref(phone.token, {
      ...DEFAULT_CAMERA_NOTIFICATIONS,
      kinds: { ...DEFAULT_CAMERA_NOTIFICATIONS.kinds, person: true },
    });
    for (let index = 0; index < STORM; index += 1) {
      bench.happen({ kind: 'person' });
    }
    bench.happen({ kind: 'sound', details: { detection: 'baby_cry' } });
    await vi.waitFor(() => {
      expect(bench.google.sent).toHaveLength(2);
    });
    expect(titles()).toEqual(['Person', 'Baby crying']);
  });

  it('collapses a storm of offline reports into one notice and replaces it quietly on recovery', async () => {
    await bench.saveAccount();
    await bench.registerPhone('fcm-a');
    for (let index = 0; index < STORM; index += 1) {
      bench.happen({ kind: 'device_offline' });
    }
    bench.happen({ kind: 'device_online' });
    await vi.waitFor(() => {
      expect(bench.google.sent).toHaveLength(2);
    });
    expect(titles()).toEqual(['Camera offline', 'Camera back online']);
    const [offline, back] = bench.google.sent.map((sent) => JSON.stringify(sent.body));
    expect(back).toContain('PRIORITY_LOW');
    expect(offline).not.toContain('PRIORITY_LOW');
  });
});
