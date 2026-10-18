import { API_ENDPOINTS, type DiscoveredDevice } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { bootServer, linkFakeProvider, verifiedPublicUrl, type Booted } from './support/booted';
import { LAMP } from './support/fake-provider';
import { captureLogs } from './support/logs';
import { callTool, structured } from './mcp/client';
import { call, openLive, temporaryDirectory } from './support/server';

const BLASTER: DiscoveredDevice = {
  ...LAMP,
  externalId: 'ir-1',
  kind: 'ir_blaster',
  name: 'Living room IR',
  model: 'tuya.wfcon',
  room: null,
  capabilities: [],
};

const AIR_CONDITIONER: DiscoveredDevice = {
  ...LAMP,
  externalId: 'ir-ac',
  kind: 'ir_remote',
  name: 'Living room AC',
  model: 'ir-category-5',
  room: null,
  capabilities: [
    {
      key: 'remote_key',
      label: 'Key',
      access: 'write',
      value: { kind: 'enum', options: ['Power', 'Temp+', 'Temp-'] },
    },
  ],
};

let directory: { path: string; remove: () => Promise<void> };
let booted: Booted;

beforeEach(async () => {
  captureLogs();
  directory = await temporaryDirectory();
  booted = await bootServer(directory.path);
  booted.fake.adapter.devices = [LAMP, BLASTER, AIR_CONDITIONER];
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

function patch(remoteId: string, body: unknown): ReturnType<typeof call> {
  return call(booted.base, booted.owner, {
    method: 'PATCH',
    path: `/api/ir-remotes/${remoteId}/state`,
    body,
  });
}

async function homeStates(): Promise<unknown> {
  const reply = await call(booted.base, booted.owner, { method: 'GET', path: '/api/settings' });
  return API_ENDPOINTS.readSettings.response.parse(reply.body).ir_remotes;
}

describe('correcting what an IR remote is assumed to be doing over HTTP', () => {
  it('keeps the correction for the whole home and answers with the remote’s state', async () => {
    const remote = await deviceIdOf('ir-ac');
    const lamp = await deviceIdOf('lamp-1');
    const reply = await patch(remote, { on: false, temp: 22, checkDeviceId: lamp });
    expect(reply.status).toBe(200);
    expect(reply.body).toMatchObject({ on: false, temp: 22, checkDeviceId: lamp, sentKey: null });
    expect(await homeStates()).toMatchObject({ [remote]: { on: false, temp: 22 } });
  });

  it('clears a field with null and leaves the others', async () => {
    const remote = await deviceIdOf('ir-ac');
    await patch(remote, { on: true, temp: 22 });
    const reply = await patch(remote, { temp: null });
    expect(reply.body).toMatchObject({ on: true, temp: null });
  });

  it('tells a live client about the change', async () => {
    const remote = await deviceIdOf('ir-ac');
    const live = await openLive(booted.base, booted.owner);
    live.socket.send(JSON.stringify({ type: 'subscribe', tables: ['settings'], streams: [] }));
    await live.next((message) => message.type === 'subscribed');
    await patch(remote, { on: true });
    await live.next(
      (message) =>
        message.type === 'change' &&
        message.table === 'settings' &&
        message.record?.ir_remotes[remote]?.on === true,
    );
    live.socket.close();
  });

  it('follows a learned remote and forgets it when it is removed', async () => {
    const blaster = await deviceIdOf('ir-1');
    const created = await call(booted.base, booted.owner, {
      method: 'POST',
      path: '/api/ir-remotes',
      body: { blaster_id: blaster, name: 'Fan', category: 'fan', brand: null },
    });
    const learned = API_ENDPOINTS.createIrRemote.response.parse(created.body).id;
    expect((await patch(learned, { on: true })).status).toBe(200);
    expect(await homeStates()).toMatchObject({ [learned]: { on: true } });
    await call(booted.base, booted.owner, { method: 'DELETE', path: `/api/ir-remotes/${learned}` });
    expect(await homeStates()).toEqual({});
  });

  it('refuses a device that is not a remote, a missing remote, an unknown plug and an empty change', async () => {
    const lamp = await deviceIdOf('lamp-1');
    const remote = await deviceIdOf('ir-ac');
    expect((await patch(lamp, { on: true })).status).toBe(404);
    expect((await patch('00000000-0000-4000-8000-000000000999', { on: true })).status).toBe(404);
    expect(
      (await patch(remote, { checkDeviceId: '00000000-0000-4000-8000-000000000999' })).status,
    ).toBe(404);
    expect((await patch(remote, {})).status).toBe(400);
    expect((await patch(remote, { temp: 99 })).status).toBe(400);
    expect(await homeStates()).toEqual({});
  });
});

describe('what the AI reads and sets about an IR remote', () => {
  async function aiToken(): Promise<string> {
    await verifiedPublicUrl(booted);
    const created = await call(booted.base, booted.owner, {
      method: 'POST',
      path: '/api/mcp/tokens',
      body: { name: 'ChatGPT' },
    });
    return API_ENDPOINTS.createMcpToken.response.parse(created.body).token;
  }

  it('sets the assumed state with updateIrRemote and reads it back from the device and the home', async () => {
    const token = await aiToken();
    const remote = await deviceIdOf('ir-ac');
    const set = structured(
      await callTool(booted.base, token, 'call_operation', {
        operation: 'updateIrRemote',
        arguments: { remoteId: remote, on: true, temp: 21 },
      }),
    );
    expect(set).toMatchObject({ on: true, temp: 21 });
    const device = structured(
      await callTool(booted.base, token, 'get_device', { deviceId: remote }),
    );
    expect(device).toMatchObject({ device: { infrared: { assumed: { on: true, temp: 21 } } } });
    expect(await homeStates()).toMatchObject({ [remote]: { temp: 21 } });
  });

  it('lists a learned remote with what it is assumed to be doing', async () => {
    const token = await aiToken();
    const blaster = await deviceIdOf('ir-1');
    const created = await call(booted.base, booted.owner, {
      method: 'POST',
      path: '/api/ir-remotes',
      body: { blaster_id: blaster, name: 'Fan', category: 'fan', brand: null },
    });
    const learned = API_ENDPOINTS.createIrRemote.response.parse(created.body).id;
    await patch(learned, { speed: 3 });
    const listed = structured(await callTool(booted.base, token, 'list_remotes', {}));
    expect(listed).toMatchObject({
      remotes: [{ id: learned, assumed: { speed: 3, on: null } }],
    });
  });
});
