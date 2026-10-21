import { API_ENDPOINTS } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { CAMERA, LAMP } from '../support/fake-provider';
import { bootServer, linkFakeProvider, verifiedPublicUrl, type Booted } from '../support/booted';
import { captureLogs } from '../support/logs';
import { call, temporaryDirectory } from '../support/server';
import { callTool, structured } from './client';

let directory: { path: string; remove: () => Promise<void> };
let booted: Booted;
let token: string;
let lamp: string;
let camera: string;

const GROUPS = z.array(
  z.looseObject({
    key: z.string(),
    name: z.string(),
    kind: z.string(),
    member_ids: z.array(z.string()),
    lost: z.number(),
    state: z.looseObject({ power: z.string(), members: z.number(), online: z.number() }),
  }),
);

beforeEach(async () => {
  captureLogs();
  directory = await temporaryDirectory();
  booted = await bootServer(directory.path);
  await verifiedPublicUrl(booted);
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
  lamp = devices.find((device) => device.external_id === LAMP.externalId)?.id ?? '';
  camera = devices.find((device) => device.external_id === CAMERA.externalId)?.id ?? '';
});

afterEach(async () => {
  await booted.server.stop();
  await directory.remove();
});

async function run(name: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
  return structured(await callTool(booted.base, token, name, args));
}

async function pair(): Promise<string> {
  await run('group_edit', {
    action: 'create',
    name: 'Pair',
    deviceIds: [lamp, camera],
  });
  const groups = GROUPS.parse((await run('home_read', {}))['device_groups']);
  const found = groups.find((group) => group.name === 'Pair');
  return found?.key.replace('group:', '') ?? '';
}

describe('the device group read', () => {
  it('gives each group a key, its members and its live state', async () => {
    const groupId = await pair();
    const groups = GROUPS.parse((await run('home_read', {}))['device_groups']);
    expect(groups).toMatchObject([
      {
        key: `group:${groupId}`,
        name: 'Pair',
        kind: 'group',
        member_ids: [lamp, camera],
        lost: 0,
        state: { members: 2, online: 2 },
      },
    ]);
  });
});

describe('controlling a device group', () => {
  it('names an unsupported member as skipped next to the member it changed', async () => {
    await pair();
    const result = await run('device_control', { group: 'Pair', capability: 'power', value: true });
    expect(result['changed']).toStrictEqual([{ device: 'Desk lamp', capability: 'power' }]);
    expect(result['skipped']).toStrictEqual([{ item: 'Front door', reason: 'has no power' }]);
    expect(result['failed']).toBeUndefined();
  });

  it('puts a failing member in the headline', async () => {
    await pair();
    booted.fake.adapter.failure = new Error('The lamp is unplugged');
    const result = await run('device_control', { group: 'Pair', capability: 'power', value: true });
    expect(result['headline']).toBe("1 light didn't change");
  });
});
