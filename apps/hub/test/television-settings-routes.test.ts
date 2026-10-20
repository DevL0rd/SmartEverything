import { API_ENDPOINTS, type DiscoveredDevice } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { bootServer, linkFakeProvider, type Booted } from './support/booted';
import { LAMP } from './support/fake-provider';
import { captureLogs } from './support/logs';
import { call, openLive, temporaryDirectory } from './support/server';

const TELEVISION: DiscoveredDevice = {
  ...LAMP,
  externalId: 'tv-1',
  kind: 'television',
  name: 'Living room TV',
  model: 'QN90',
  manufacturer: 'Samsung',
  room: null,
  capabilities: [],
};

let directory: { path: string; remove: () => Promise<void> };
let booted: Booted;

beforeEach(async () => {
  captureLogs();
  directory = await temporaryDirectory();
  booted = await bootServer(directory.path);
  booted.fake.adapter.devices = [LAMP, TELEVISION];
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

async function patch(deviceId: string, body: unknown): Promise<{ status: number; body: unknown }> {
  return call(booted.base, booted.owner, {
    method: 'PATCH',
    path: `/api/devices/${deviceId}`,
    body,
  });
}

async function snapshotSettings(): Promise<unknown> {
  const reply = await call(booted.base, booted.owner, { method: 'GET', path: '/api/snapshot' });
  return API_ENDPOINTS.readSnapshot.response.parse(reply.body).tables.television_settings;
}

describe('naming the inputs of a television over HTTP', () => {
  it('stores the names, answers with the device and puts them in the snapshot', async () => {
    const id = await deviceIdOf('tv-1');
    const reply = await patch(id, { input_names: { HDMI1: 'Console', HDMI2: 'Laptop' } });
    expect(reply.status).toBe(200);
    expect(reply.body).toMatchObject({ id, kind: 'television' });
    expect(await snapshotSettings()).toEqual([
      {
        device_id: id,
        direct_host: null,
        direct_mac: null,
        input_names: { HDMI1: 'Console', HDMI2: 'Laptop' },
        wake_macs: [],
        wake_worked_at: null,
      },
    ]);
  });

  it('tells a live client about the change', async () => {
    const id = await deviceIdOf('tv-1');
    const live = await openLive(booted.base, booted.owner);
    live.socket.send(
      JSON.stringify({ type: 'subscribe', tables: ['television_settings'], streams: [] }),
    );
    await live.next((message) => message.type === 'subscribed');
    await patch(id, { input_names: { HDMI1: 'Console' } });
    await live.next(
      (message) =>
        message.type === 'change' &&
        message.table === 'television_settings' &&
        message.record?.input_names['HDMI1'] === 'Console',
    );
    live.socket.close();
  });

  it('changes the name of the device and the names of the inputs in one request', async () => {
    const id = await deviceIdOf('tv-1');
    const reply = await patch(id, { display_name: 'Lounge', input_names: { dtv: 'Antenna' } });
    expect(reply.body).toMatchObject({ display_name: 'Lounge' });
    expect(await snapshotSettings()).toMatchObject([{ input_names: { dtv: 'Antenna' } }]);
  });

  it('clears every name with an empty map', async () => {
    const id = await deviceIdOf('tv-1');
    await patch(id, { input_names: { HDMI1: 'Console' } });
    await patch(id, { input_names: {} });
    expect(await snapshotSettings()).toMatchObject([{ input_names: {} }]);
  });

  it('refuses names for a device that is not a television', async () => {
    const reply = await patch(await deviceIdOf('lamp-1'), { input_names: { HDMI1: 'Console' } });
    expect(reply).toMatchObject({ status: 400, body: { error: { code: 'invalid_request' } } });
    expect(await snapshotSettings()).toEqual([]);
  });

  it('refuses a name that is empty or longer than forty characters', async () => {
    const id = await deviceIdOf('tv-1');
    expect((await patch(id, { input_names: { HDMI1: '' } })).status).toBe(400);
    expect((await patch(id, { input_names: { HDMI1: 'x'.repeat(41) } })).status).toBe(400);
  });
});

describe('setting the wake address of a television over HTTP', () => {
  it('stores the address, normalises it, puts it in the snapshot and clears it with null', async () => {
    const id = await deviceIdOf('tv-1');
    expect((await patch(id, { wake_address: 'A1-B2-C3-D4-E5-F6' })).status).toBe(200);
    expect(await snapshotSettings()).toMatchObject([{ wake_macs: ['a1:b2:c3:d4:e5:f6'] }]);
    await patch(id, { wake_address: null });
    expect(await snapshotSettings()).toMatchObject([{ wake_macs: [] }]);
  });

  it('refuses an address that is not a MAC and a device that is not a television', async () => {
    expect((await patch(await deviceIdOf('tv-1'), { wake_address: '192.168.1.40' })).status).toBe(
      400,
    );
    const lamp = await patch(await deviceIdOf('lamp-1'), { wake_address: 'a1:b2:c3:d4:e5:f6' });
    expect(lamp).toMatchObject({ status: 400, body: { error: { code: 'invalid_request' } } });
  });
});
