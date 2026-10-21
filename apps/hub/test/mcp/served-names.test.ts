import { API_ENDPOINTS } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { CAMERA, LAMP } from '../support/fake-provider';
import { bootServer, linkFakeProvider, verifiedPublicUrl, type Booted } from '../support/booted';
import { captureLogs } from '../support/logs';
import { call, temporaryDirectory } from '../support/server';
import { RPC_ERROR, callTool, rpc, structured } from './client';
import { TOOL_EXAMPLES } from '../../src/extensions/mcp/tools/examples';

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
  return PEOPLE.parse(await run('person_read', {})).people;
}

describe('the tool names', () => {
  it('serve only the current names and argument names, with no mapping from older ones', async () => {
    const unknown = await rpc(booted.base, token, {
      method: 'tools/call',
      params: { name: 'get_home', arguments: {} },
    });
    expect(RPC_ERROR.parse(await unknown.json()).error.message).toContain('get_home');
    const old = await callTool(booted.base, token, 'health_read', {
      view: 'latest',
      withinDays: 7,
      profileId: person,
    });
    expect(old.isError).toBe(true);
    expect(JSON.stringify(old.content)).toContain('profileId');
  });

  it('read a person’s health by personId', async () => {
    const read = await run('health_read', { view: 'latest', withinDays: 7, personId: person });
    expect(read).toBeTypeOf('object');
  });

  it('change a device through device_edit action update', async () => {
    await run('device_edit', { action: 'update', deviceId: lamp, favourite: true });
    const described = await run('device_read', { deviceId: lamp });
    expect(described['device']).toMatchObject({ favourite: true });
  });

  it('read a camera’s transcript status by deviceId', async () => {
    const status = await run('transcript_read', { view: 'status', deviceId: camera });
    expect(status).toBeTypeOf('object');
  });
});

describe('the named device groups', () => {
  it('come with the home', async () => {
    const created = await run('group_edit', {
      action: 'create',
      name: 'Evening',
      deviceIds: [lamp],
    });
    expect(JSON.stringify(created)).toContain('Evening');
    const home = await run('home_read', {});
    expect(home['device_groups']).toMatchObject([
      { name: 'Evening', kind: 'group', member_ids: [lamp] },
    ]);
  });
});

describe('the person a tool is about is always called personId', () => {
  it('posts to a person’s chat by personId', async () => {
    const posted = await run('chat_post', { text: 'Dinner', personId: person, notify: false });
    expect(posted['ok']).toBe(true);
  });

  it('edits that person by personId and refuses the call without one', async () => {
    await run('person_edit', { action: 'update', personId: person, name: 'Sam' });
    expect((await people()).map((one) => one.name)).toContain('Sam');
    const refused = await callTool(booted.base, token, 'person_edit', {
      action: 'update',
      name: 'Other',
    });
    expect(refused.isError).toBe(true);
    expect(JSON.stringify(refused.content)).toContain('personId');
  });
});

describe('the input examples tool_read gives', () => {
  it('are accepted by their tool’s own argument checks', async () => {
    for (const [name, examples] of Object.entries(TOOL_EXAMPLES)) {
      for (const example of examples) {
        const result = await callTool(booted.base, token, name, { ...example });
        const text = JSON.stringify(result.content);
        expect(text, name).not.toMatch(/arguments are not valid|does not take|must be one of/u);
      }
    }
  });

  it('come with tool_read for the tool', async () => {
    const read = structured(
      await callTool(booted.base, token, 'tool_read', { name: 'schedule_edit' }),
    );
    expect(read['inputExamples']).toStrictEqual(TOOL_EXAMPLES.schedule_edit);
  });
});
