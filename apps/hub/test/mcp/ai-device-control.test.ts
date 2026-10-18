import { API_ENDPOINTS, type DeviceCapability } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { CAMERA, LAMP } from '../support/fake-provider';
import type { DiscoveredDevice } from '@smarteverything/domain';
import { bootServer, linkFakeProvider, verifiedPublicUrl, type Booted } from '../support/booted';
import { captureLogs } from '../support/logs';
import { call, temporaryDirectory } from '../support/server';
import { callTool, structured, type ToolResult } from './client';

const POWER: DeviceCapability = {
  key: 'power',
  label: 'Power',
  access: 'read_write',
  value: { kind: 'boolean' },
};

const COLOUR_LIGHT: DiscoveredDevice = {
  ...LAMP,
  externalId: 'light-colour',
  name: 'Light 3',
  model: 'ESP25_SHRGB_01',
  room: 'Living room',
  capabilities: [
    POWER,
    {
      key: 'brightness',
      label: 'Brightness',
      access: 'read_write',
      value: { kind: 'number', min: 10, max: 100, step: 1, unit: '%' },
    },
    { key: 'color', label: 'Colour', access: 'read_write', value: { kind: 'color' } },
    {
      key: 'color_temperature',
      label: 'Colour temperature',
      access: 'read_write',
      value: { kind: 'number', min: 2200, max: 6500, step: 1, unit: 'K' },
    },
  ],
};

const FAN: DiscoveredDevice = {
  ...LAMP,
  externalId: 'fan-1',
  kind: 'fan',
  name: 'Xiaomi Smart Tower Fan 2',
  model: 'xiaomi.fan.p45',
  room: 'Living room',
  capabilities: [POWER],
};

const LIVING_ROOM_CAMERA: DiscoveredDevice = {
  ...CAMERA,
  externalId: 'camera-living',
  name: 'Camera',
  room: 'Living room',
  capabilities: [
    ...CAMERA.capabilities,
    {
      key: 'raw:8.8',
      label: 'Ai Detection: Human Detection',
      access: 'read_write',
      value: { kind: 'boolean' },
    },
  ],
};

let directory: { path: string; remove: () => Promise<void> };
let booted: Booted;
let token: string;
let ids: Readonly<Record<string, string>>;

beforeEach(async () => {
  captureLogs();
  directory = await temporaryDirectory();
  booted = await bootServer(directory.path);
  await verifiedPublicUrl(booted);
  await call(booted.base, booted.owner, {
    method: 'POST',
    path: '/api/rooms',
    body: { name: 'Living room', position: 0 },
  });
  booted.fake.adapter.devices = [COLOUR_LIGHT, FAN, LIVING_ROOM_CAMERA];
  await linkFakeProvider(booted);
  const created = await call(booted.base, booted.owner, {
    method: 'POST',
    path: '/api/mcp/tokens',
    body: { name: 'ChatGPT' },
  });
  token = API_ENDPOINTS.createMcpToken.response.parse(created.body).token;
  const devices = API_ENDPOINTS.listDevices.response.parse(
    (await call(booted.base, booted.owner, { method: 'GET', path: '/api/devices' })).body,
  );
  ids = Object.fromEntries(devices.map((device) => [device.external_id, device.id]));
});

afterEach(async () => {
  await booted.server.stop();
  await directory.remove();
});

function tool(name: string, args: Record<string, unknown>): Promise<ToolResult> {
  return callTool(booted.base, token, name, args);
}

async function refusal(name: string, args: Record<string, unknown>): Promise<string> {
  const result = await tool(name, args);
  expect(result.isError).toBe(true);
  return JSON.stringify(result.content);
}

function colourOf(value: unknown): Record<string, unknown> {
  return {
    changes: [{ target: { deviceIds: [ids['light-colour']] }, capability: 'color', value }],
  };
}

function sentColour(): unknown {
  return booted.fake.adapter.executed.find((command) => command.capability === 'color')?.value;
}

describe('colour sent by the AI through control_devices', () => {
  const RED = { hue: 0, saturation: 100, value: 100 };

  it.each([
    ['the RGB object as JSON text from the voice call', '{"red": 255, "green": 0, "blue": 0}'],
    ['an RGB object', { r: 255, g: 0, b: 0 }],
    ['an RGB object with long keys', { red: 255, green: 0, blue: 0 }],
    ['comma separated RGB text', '255,0,0'],
    ['a hex code', '#ff0000'],
    ['a colour name', 'red'],
    ['hue, saturation and value', RED],
  ])('accepts %s and sends the device hue, saturation and value', async (_form, value) => {
    structured(await tool('control_devices', colourOf(value)));
    expect(sentColour()).toStrictEqual(RED);
  });

  it('refuses text that is no colour and names the accepted forms', async () => {
    const message = await refusal('control_devices', colourOf('not a colour'));
    expect(message).toContain('is not a colour');
    expect(message).toContain('hex (#ff0000)');
    expect(message).toContain('Brightness is a separate capability');
  });

  it('sends a white tone in the colour temperature unit of the device', async () => {
    const change = (value: unknown): Record<string, unknown> => ({
      changes: [
        { target: { deviceIds: [ids['light-colour']] }, capability: 'color_temperature', value },
      ],
    });
    structured(await tool('control_devices', change('2700K')));
    structured(await tool('control_devices', change('250 mireds')));
    const sent = booted.fake.adapter.executed
      .filter((command) => command.capability === 'color_temperature')
      .map((command) => command.value);
    expect(sent).toStrictEqual([2700, 4000]);
  });
});

describe('finding a fan', () => {
  const DEVICES = z.array(z.object({ id: z.string(), family: z.string() }));

  it('finds the tower fan by its words, room, kind or exact family', async () => {
    for (const filter of [
      { search: 'living room fan' },
      { search: 'tower fan' },
      { kinds: ['fan'] },
      { families: ['tower_fan'] },
      { rooms: ['Living room'], families: ['tower_fan'] },
    ]) {
      const found = DEVICES.parse(structured(await tool('find_devices', filter))['devices']);
      expect(
        found.map((device) => device.id),
        JSON.stringify(filter),
      ).toStrictEqual([ids['fan-1']]);
    }
  });

  it('says plainly that nothing matched and lists the families in the home', async () => {
    const empty = structured(await tool('find_devices', { families: ['fan'] }));
    expect(empty['devices']).toStrictEqual([]);
    expect(String(empty['nothing_matches'])).toContain('ask the person');
    expect(empty['families_in_the_home']).toMatchObject({ tower_fan: 1, light: 1, camera: 1 });
  });

  it('gives no hint for a search that matches', async () => {
    expect(structured(await tool('find_devices', { search: 'fan' }))).not.toHaveProperty(
      'nothing_matches',
    );
  });
});

describe('raw controls', () => {
  const raw = (target: Record<string, unknown>, capability: string): Record<string, unknown> => ({
    changes: [{ target, capability, value: true }],
  });

  it('are refused when the device was not named by id', async () => {
    const message = await refusal('control_devices', raw({ search: 'fan' }, 'raw:8.8'));
    expect(message).toContain('target it by deviceIds');
    expect(message).toContain('ask the person instead of guessing raw ids');
    expect(booted.fake.adapter.executed).toHaveLength(0);
  });

  it('are never sent to the fan, which does not report them', async () => {
    const message = await refusal('control_devices', raw({ deviceIds: [ids['fan-1']] }, 'raw:8.8'));
    expect(message).toContain('has no raw:8.8');
    expect(message).toContain('ask the person instead of guessing raw ids');
    expect(booted.fake.adapter.executed).toHaveLength(0);
  });
});

describe('tool_details for a tool without variants', () => {
  it('gives control_devices its full schema and says it has no variants', async () => {
    const result = structured(
      await tool('tool_details', { name: 'control_devices', variant: 'color' }),
    );
    expect(result['note']).toContain('control_devices has no variants');
    expect(JSON.stringify(result['tool'])).toContain('hex (#ff0000)');
  });
});
