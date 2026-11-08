import {
  API_ENDPOINTS,
  type DeviceCapability,
  type DiscoveredDevice,
  type IrAppliance,
} from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { bootServer, linkFakeProvider, verifiedPublicUrl, type Booted } from '../support/booted';
import { LAMP } from '../support/fake-provider';
import { captureLogs } from '../support/logs';
import { callTool, structured } from '../mcp/client';
import { call, temporaryDirectory } from '../support/server';
import { until } from '../support/wait';

const SEND: DeviceCapability = {
  key: 'ir_send',
  label: 'Send',
  access: 'write',
  value: { kind: 'action', arguments: ['format', 'code'] },
};

const BLASTER: DiscoveredDevice = {
  ...LAMP,
  externalId: 'ir-1',
  kind: 'ir_blaster',
  name: 'Living room IR',
  model: 'tuya.wnykq',
  room: 'Living room',
  capabilities: [SEND],
};

const SPARE: DiscoveredDevice = { ...BLASTER, externalId: 'ir-2', name: 'Bedroom IR', room: null };

const BUTTONS = ['Power', 'Temp up', 'Temp down', 'Mode'];

let directory: { path: string; remove: () => Promise<void> };
let booted: Booted;

beforeEach(async () => {
  captureLogs();
  directory = await temporaryDirectory();
  booted = await bootServer(directory.path);
  booted.fake.adapter.devices = [LAMP, BLASTER, SPARE];
  await linkFakeProvider(booted);
});

afterEach(async () => {
  await booted.server.stop();
  await directory.remove();
});

function owner(method: string, path: string, body?: unknown): ReturnType<typeof call> {
  return call(booted.base, booted.owner, { method, path, ...(body === undefined ? {} : { body }) });
}

async function devices(): Promise<ReturnType<typeof API_ENDPOINTS.listDevices.response.parse>> {
  return API_ENDPOINTS.listDevices.response.parse((await owner('GET', '/api/devices')).body);
}

async function deviceIdOf(externalId: string): Promise<string> {
  const row = (await devices()).find((device) => device.external_id === externalId);
  if (row === undefined) throw new Error(`The fake provider did not discover ${externalId}.`);
  return row.id;
}

async function learnedAirConditioner(): Promise<string> {
  const blaster = await deviceIdOf('ir-1');
  const room = API_ENDPOINTS.createRoom.response.parse(
    (await owner('POST', '/api/rooms', { name: 'Living room' })).body,
  );
  await owner('PATCH', `/api/devices/${blaster}`, { room_id: room.id });
  const created = await owner('POST', '/api/ir-remotes', {
    blaster_id: blaster,
    name: 'Air Conditioner',
    category: 'air conditioner',
    brand: null,
  });
  const remote = API_ENDPOINTS.createIrRemote.response.parse(created.body).id;
  for (const button of BUTTONS) {
    await owner('PUT', '/api/ir-codes', {
      remote_id: remote,
      button,
      format: 'pulses',
      code: `code-${button}`,
    });
  }
  await owner('PATCH', `/api/ir-remotes/${remote}/state`, { on: true, temp: 24, mode: 'Cool' });
  return remote;
}

async function promoted(remote: string): Promise<IrAppliance> {
  const reply = await owner('POST', `/api/ir-remotes/${remote}/promote`);
  expect(reply.status).toBe(200);
  return API_ENDPOINTS.promoteIrRemote.response.parse(reply.body);
}

async function appliances(): Promise<readonly IrAppliance[]> {
  return API_ENDPOINTS.listIrAppliances.response.parse(
    (await owner('GET', '/api/ir-appliances')).body,
  );
}

function sentCodes(): unknown[] {
  return booted.fake.adapter.executed
    .filter((command) => command.capability === 'ir_send')
    .map((command) => command.value);
}

describe('promoting a learned remote to its own device', () => {
  it('keeps its id, name, buttons and assumed state and shows it as its own device in the blaster’s room', async () => {
    const remote = await learnedAirConditioner();
    const appliance = await promoted(remote);
    expect(appliance).toMatchObject({
      id: remote,
      name: 'Air Conditioner',
      encoder: 'learned',
      online: true,
      keys: ['Mode', 'Power', 'Temp down', 'Temp up'],
    });
    const listed = await devices();
    const device = listed.find((row) => row.id === appliance.device_id);
    const blaster = listed.find((row) => row.external_id === 'ir-1');
    expect(device).toMatchObject({ kind: 'air_conditioner', parent_id: null, provider: 'local' });
    expect(device?.room_id).toBe(blaster?.room_id);
    expect(device?.room_id).not.toBeNull();
    const remotes = API_ENDPOINTS.listIrRemotes.response.parse(
      (await owner('GET', '/api/ir-remotes')).body,
    );
    expect(remotes).toStrictEqual([]);
    const settings = API_ENDPOINTS.readSettings.response.parse(
      (await owner('GET', '/api/settings')).body,
    );
    expect(settings.ir_remotes[remote]).toMatchObject({ on: true, temp: 24, mode: 'Cool' });
  });

  it('answers the same appliance when promoted again and refuses an unknown remote', async () => {
    const remote = await learnedAirConditioner();
    const first = await promoted(remote);
    expect(await promoted(remote)).toStrictEqual(first);
    expect(await appliances()).toHaveLength(1);
    const missing = await owner(
      'POST',
      '/api/ir-remotes/00000000-0000-4000-8000-000000000999/promote',
    );
    expect(missing.status).toBe(404);
  });
});

describe('controlling an IR air conditioner by state', () => {
  it('sends the buttons that bring the assumed state to the asked one and remembers it', async () => {
    const appliance = await promoted(await learnedAirConditioner());
    const reply = await owner('POST', `/api/ir-appliances/${appliance.id}/apply`, {
      temp: 22,
      mode: 'Dry',
    });
    expect(reply.status).toBe(200);
    expect(reply.body).toMatchObject({ on: true, temp: 22, mode: 'Dry' });
    expect(sentCodes()).toStrictEqual([
      { format: 'pulses', code: 'code-Mode' },
      { format: 'pulses', code: 'code-Mode' },
      { format: 'pulses', code: 'code-Temp down' },
      { format: 'pulses', code: 'code-Temp down' },
    ]);
  });

  it('takes a single capability as a device command and shows the new state on the device', async () => {
    const appliance = await promoted(await learnedAirConditioner());
    const deviceId = appliance.device_id ?? '';
    await owner('POST', '/api/commands', {
      device_id: deviceId,
      capability: 'target_temperature',
      value: 25,
    });
    await until(async () => {
      const states = API_ENDPOINTS.listState.response.parse(
        (await owner('GET', '/api/device-state')).body,
      );
      return states.some(
        (row) =>
          row.device_id === deviceId && row.capability === 'target_temperature' && row.value === 25,
      );
    }, 'the temperature to be sent');
    expect(sentCodes()).toStrictEqual([{ format: 'pulses', code: 'code-Temp up' }]);
  });

  it('refuses a state it cannot reach without sending anything', async () => {
    const appliance = await promoted(await learnedAirConditioner());
    await owner('PATCH', `/api/ir-remotes/${appliance.id}/state`, { temp: null });
    const reply = await owner('POST', `/api/ir-appliances/${appliance.id}/apply`, { temp: 20 });
    expect(reply.status).toBe(422);
    expect(sentCodes()).toStrictEqual([]);
  });
});

describe('an appliance whose blaster is offline', () => {
  it('stays and shows offline, and comes back when bound to another blaster', async () => {
    const appliance = await promoted(await learnedAirConditioner());
    booted.fake.adapter.sink?.online('ir-1', false);
    await until(
      async () => (await appliances())[0]?.online === false,
      'the appliance to go offline',
    );
    const device = (await devices()).find((row) => row.id === appliance.device_id);
    expect(device?.online).toBe(false);
    const spare = await deviceIdOf('ir-2');
    const rebound = await owner('PATCH', `/api/ir-appliances/${appliance.id}/blaster`, {
      blaster_id: spare,
    });
    expect(API_ENDPOINTS.rebindIrAppliance.response.parse(rebound.body)).toMatchObject({
      blaster_id: spare,
      online: true,
    });
    await owner('POST', `/api/ir-appliances/${appliance.id}/apply`, { on: false });
    expect(booted.fake.adapter.executed.at(-1)).toMatchObject({ externalId: 'ir-2' });
  });

  it('refuses a blaster that cannot send infrared', async () => {
    const appliance = await promoted(await learnedAirConditioner());
    const lamp = await deviceIdOf(LAMP.externalId);
    const reply = await owner('PATCH', `/api/ir-appliances/${appliance.id}/blaster`, {
      blaster_id: lamp,
    });
    expect(reply.status).toBe(422);
  });
});

describe('what the AI finds and presses on an IR appliance', () => {
  it('lists the appliance with its device and presses a button through it', async () => {
    await verifiedPublicUrl(booted);
    const token = API_ENDPOINTS.createMcpToken.response.parse(
      (await owner('POST', '/api/mcp/tokens', { name: 'ChatGPT' })).body,
    ).token;
    const appliance = await promoted(await learnedAirConditioner());
    const listed = structured(await callTool(booted.base, token, 'remote_find', {}));
    expect(listed).toMatchObject({
      remotes: [{ id: appliance.id, device_id: appliance.device_id, assumed: { temp: 24 } }],
    });
    await callTool(booted.base, token, 'remote_press', {
      remote: 'Air Conditioner',
      button: 'Power',
    });
    expect(sentCodes()).toStrictEqual([{ format: 'pulses', code: 'code-Power' }]);
  });

  it('removes the appliance with its device and state', async () => {
    const appliance = await promoted(await learnedAirConditioner());
    expect((await owner('DELETE', `/api/ir-appliances/${appliance.id}`)).status).toBe(200);
    expect(await appliances()).toStrictEqual([]);
    expect((await devices()).some((row) => row.id === appliance.device_id)).toBe(false);
  });
});
