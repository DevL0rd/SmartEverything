import { API_ENDPOINTS } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { guestMember, stubControls, useComputerHub, type Paired } from '../support/paired-computer';
import { call } from '../support/server';
import { until } from '../support/wait';

const hub = useComputerHub();

function backfill(token: string, paired: Paired): ReturnType<typeof call> {
  return call(hub.booted().base, token, {
    method: 'POST',
    path: '/api/history/backfill',
    body: {
      device: paired.deviceId,
      source: 'computers',
      topics: ['summary'],
      maxPoints: 100,
      windowMs: 60_000,
    },
  });
}

describe('computer history and member scope', () => {
  it('serves the recorded history and applies a changed recording interval to the computer', async () => {
    const paired = await hub.pair();
    hub.run(paired, stubControls());
    const { base, owner } = hub.booted();
    await until(async () => {
      const reply = await backfill(owner, paired);
      return (
        reply.status === 200 &&
        API_ENDPOINTS.readHistoryBackfill.response.parse(reply.body).timestamps.length > 0
      );
    }, 'recorded readings');
    const changed = await call(base, owner, {
      method: 'PATCH',
      path: '/api/settings/history',
      body: { devices: { [paired.deviceId]: { interval_ms: 2000, window_ms: null } } },
    });
    expect(changed.status).toBe(200);
    expect(
      API_ENDPOINTS.updateHistorySettings.response.parse(changed.body).history_settings.devices,
    ).toEqual({ [paired.deviceId]: { interval_ms: 2000, window_ms: null } });
    await until(async () => {
      const reply = await backfill(owner, paired);
      return API_ENDPOINTS.readHistoryBackfill.response.parse(reply.body).intervalMs === 2000;
    }, 'the new interval on the computer');
  });

  it('hides a computer from a person it does not belong to', async () => {
    const paired = await hub.pair();
    hub.run(paired, stubControls());
    const member = await guestMember(hub.booted());
    const { base } = hub.booted();
    expect((await backfill(member, paired)).status).toBe(404);
    const read = await call(base, member, {
      method: 'GET',
      path: `/api/computers/${paired.deviceId}`,
    });
    expect(read.status).toBe(404);
    const devices = await call(base, member, { method: 'GET', path: '/api/devices' });
    const ids = API_ENDPOINTS.listDevices.response.parse(devices.body).map((device) => device.id);
    expect(ids).not.toContain(paired.deviceId);
  });
});
