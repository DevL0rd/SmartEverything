import { API_ENDPOINTS, type DiscoveredDevice } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { bootServer, linkFakeProvider, type Booted } from '../support/booted';
import { LAMP } from '../support/fake-provider';
import { captureLogs } from '../support/logs';
import { call, temporaryDirectory } from '../support/server';

const WASHER: DiscoveredDevice = {
  ...LAMP,
  externalId: 'washer-1',
  kind: 'appliance',
  name: 'Washing/Drying Machine',
  model: 'mibx5.washer.f29gl',
  room: null,
  capabilities: [],
};

let directory: { path: string; remove: () => Promise<void> };
let booted: Booted;

beforeEach(async () => {
  captureLogs();
  directory = await temporaryDirectory();
  booted = await bootServer(directory.path);
  booted.fake.adapter.devices = [LAMP, WASHER];
  await linkFakeProvider(booted);
});

afterEach(async () => {
  await booted.server.stop();
  await directory.remove();
});

async function deviceIdOf(externalId: string): Promise<string> {
  const reply = await call(booted.base, booted.owner, { method: 'GET', path: '/api/devices' });
  const row = API_ENDPOINTS.listDevices.response
    .parse(reply.body)
    .find((device) => device.external_id === externalId);
  if (row === undefined) throw new Error(`The fake provider did not discover ${externalId}.`);
  return row.id;
}

function patch(deviceId: string, body: unknown): ReturnType<typeof call> {
  return call(booted.base, booted.owner, {
    method: 'PATCH',
    path: `/api/devices/${deviceId}/laundry-notices`,
    body,
  });
}

describe('washing machine notice settings', () => {
  it('keeps the switches and unload minutes in the household settings', async () => {
    const washer = await deviceIdOf('washer-1');
    const reply = await patch(washer, { on: { fault: false }, unloadMinutes: 45 });
    expect(reply.status).toBe(200);
    expect(reply.body).toEqual({ off: ['fault'], unloadMinutes: 45 });
    const settings = await call(booted.base, booted.owner, {
      method: 'GET',
      path: '/api/settings',
    });
    expect(API_ENDPOINTS.readSettings.response.parse(settings.body).laundry_notices).toEqual({
      [washer]: { off: ['fault'], unloadMinutes: 45 },
    });
  });

  it('refuses a device that is not a washing machine or dryer', async () => {
    const lamp = await deviceIdOf(LAMP.externalId);
    expect((await patch(lamp, { on: { fault: false } })).status).toBe(400);
  });
});
