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
let person: string;

const PEOPLE = z.object({
  people: z.array(z.looseObject({ id: z.string(), name: z.string() })),
});

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
  person = (await people())[0]?.id ?? '';
});

afterEach(async () => {
  await booted.server.stop();
  await directory.remove();
});

async function run(name: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
  return structured(await callTool(booted.base, token, name, args));
}

async function people(): Promise<readonly { id: string; name: string }[]> {
  return PEOPLE.parse(await run('list_people', {})).people;
}

describe('a client that still sends a name or key from before the merge', () => {
  it('reads a settings area through the old area key as it does through view', async () => {
    const old = await run('get_settings', { area: 'firewall' });
    expect(old).toStrictEqual(await run('get_settings', { view: 'firewall' }));
  });

  it('reads a person’s health through profileId as it does through personId', async () => {
    const window = { view: 'latest', withinDays: 7 };
    const old = await run('read_health', { ...window, profileId: person });
    expect(old).toStrictEqual(await run('read_health', { ...window, personId: person }));
  });

  it('changes a device through update_device with the what key', async () => {
    await run('update_device', { what: 'device', deviceId: lamp, favourite: true });
    const described = await run('get_device', { deviceId: lamp });
    expect(described['device']).toMatchObject({ favourite: true });
  });

  it('reads a camera’s transcript status through cameraId as it does through deviceId', async () => {
    const old = await run('read_transcripts', { view: 'status', cameraId: camera });
    expect(old).toStrictEqual(await run('read_transcripts', { view: 'status', deviceId: camera }));
  });
});

describe('the named device groups', () => {
  it('come with the home, and the old get_device_groups answers with the home', async () => {
    const created = await run('edit_device_group', {
      action: 'create',
      name: 'Evening',
      device_ids: [lamp],
    });
    expect(JSON.stringify(created)).toContain('Evening');
    const home = await run('get_home', {});
    expect(home['device_groups']).toMatchObject([
      { name: 'Evening', kind: 'group', member_ids: [lamp] },
    ]);
    expect(await run('get_device_groups', {})).toStrictEqual(home);
  });
});

describe('the person a tool is about is always called personId', () => {
  it('posts to a person’s chat by personId and still by the old profileId', async () => {
    const fresh = await run('assistant_post', { text: 'Dinner', personId: person, notify: false });
    const old = await run('assistant_post', { text: 'Dinner', profileId: person, notify: false });
    expect([fresh['ok'], old['ok']]).toStrictEqual([true, true]);
    expect(old['id']).not.toBe(fresh['id']);
  });

  it('edits that person by personId and refuses the call without one', async () => {
    await run('edit_person', { action: 'update', personId: person, name: 'Sam' });
    expect((await people()).map((one) => one.name)).toContain('Sam');
    const refused = await callTool(booted.base, token, 'edit_person', {
      action: 'update',
      name: 'Other',
    });
    expect(refused.isError).toBe(true);
    expect(JSON.stringify(refused.content)).toContain('personId');
  });
});
