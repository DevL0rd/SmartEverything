import { API_ENDPOINTS, CLIENT_PREFS } from '@smarteverything/domain';
import { describe, expect, it, vi } from 'vitest';
import { call } from '../support/server';
import { usePushBench } from './push-bench';

const bench = usePushBench();

async function doorId(): Promise<string> {
  const devices = await call(bench.booted.base, bench.booted.owner, {
    method: 'GET',
    path: '/api/devices',
  });
  const door = API_ENDPOINTS.listDevices.response
    .parse(devices.body)
    .find((device) => device.external_id === 'camera-1');
  expect(door).toBeDefined();
  return door?.id ?? '';
}

async function secondPerson(token: string): Promise<void> {
  const created = await call(bench.booted.base, bench.booted.owner, {
    method: 'POST',
    path: '/api/profiles',
    body: { name: 'Sam' },
  });
  await call(bench.booted.base, token, {
    method: 'PUT',
    path: API_ENDPOINTS.selectProfile.path,
    body: { profileId: API_ENDPOINTS.createProfile.response.parse(created.body).id },
  });
}

describe('per-device alerts', () => {
  it('keeps a device’s alerts from the phones of the person who turned it off, and only theirs', async () => {
    await bench.saveAccount();
    const quiet = await bench.registerPhone('fcm-quiet');
    const loud = await bench.registerPhone('fcm-loud');
    await secondPerson(loud.token);
    const saved = await call(bench.booted.base, quiet.token, {
      method: 'PUT',
      path: `/api/layouts/${CLIENT_PREFS.device_alerts.storageKey}`,
      body: { layout: CLIENT_PREFS.device_alerts.encode({ muted: [await doorId()] }) },
    });
    expect(saved.status).toBe(200);
    bench.happen({});
    await vi.waitFor(() => {
      expect(bench.google.sent).toHaveLength(1);
    });
    expect(bench.google.sent[0]?.body).toMatchObject({ message: { token: 'fcm-loud' } });
  });

  it('alerts every phone for a device nobody turned off', async () => {
    await bench.saveAccount();
    await bench.registerPhone('fcm-a');
    await bench.registerPhone('fcm-b');
    bench.happen({});
    await vi.waitFor(() => {
      expect(bench.google.sent).toHaveLength(2);
    });
  });
});
