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

const PEOPLE = z.object({ people: z.array(z.looseObject({ id: z.string() })) });

const OPERATIONS = z.object({
  operations: z.array(z.looseObject({ name: z.string() })),
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
  const people = PEOPLE.parse(structured(await callTool(booted.base, token, 'list_people', {})));
  person = people.people[0]?.id ?? '';
});

afterEach(async () => {
  await booted.server.stop();
  await directory.remove();
});

async function refusal(name: string, args: Record<string, unknown>): Promise<string> {
  const result = await callTool(booted.base, token, name, args);
  expect(result.isError).toBe(true);
  return JSON.stringify(result.content);
}

describe('refusals a model can act on', () => {
  it('name the fields of the chosen view when another view’s field is sent', async () => {
    const text = await refusal('read_health', {
      view: 'summary',
      from: '2026-10-10',
      to: '2026-10-10',
      profileId: person,
    });
    expect(text).toContain('view summary does not take profileId');
    expect(text).toContain('from (required), to (required), metrics, records');
  });

  it('say how a day must be written', async () => {
    const text = await refusal('read_health', {
      view: 'summary',
      from: '2026-10-10T00:00:00',
      to: '2026-10-10T23:59:59',
    });
    expect(text).toContain('must be a day written YYYY-MM-DD');
  });

  it('answer list_operations for tool names and snake_case names with the real operation', async () => {
    const result = await callTool(booted.base, token, 'list_operations', {
      operations: ['control_claude_session', 'list_claude_prompts', 'listClaudeSessions'],
    });
    const names = OPERATIONS.parse(structured(result)).operations.map((entry) => entry.name);
    expect(names).toStrictEqual([
      'controlClaudeSession',
      'listClaudePrompts',
      'listClaudeSessions',
    ]);
  });

  it('suggest the operations that look like an unknown name', async () => {
    const listed = await refusal('list_operations', { operations: ['claudeSession'] });
    expect(listed).toContain('There is no operation claudeSession');
    expect(listed).toContain('did you mean');
    expect(listed).toContain('controlClaudeSession');
    const called = await refusal('call_operation', { operation: 'sessions' });
    expect(called).toContain('listClaudeSessions');
  });
});

describe('saving an automation whose actions would be refused when it runs', () => {
  function definition(actions: readonly unknown[]): Record<string, unknown> {
    return {
      name: 'Air alert',
      definition: {
        triggers: [{ type: 'event', deviceId: null, kind: 'motion' }],
        conditions: { mode: 'all', items: [] },
        actions,
      },
    };
  }

  async function saved(body: Record<string, unknown>): Promise<{ status: number; body: unknown }> {
    return call(booted.base, booted.owner, { method: 'POST', path: '/api/automations', body });
  }

  async function stored(): Promise<number> {
    const listed = await call(booted.base, booted.owner, {
      method: 'GET',
      path: '/api/automations',
    });
    return API_ENDPOINTS.listAutomations.response.parse(listed.body).length;
  }

  it('refuses a tool action whose arguments the tool would reject, and saves nothing', async () => {
    const reply = await saved(
      definition([
        { type: 'command', deviceId: lamp, capability: 'power', value: true },
        { type: 'tool', profileId: person, tool: 'speak', args: { target: camera, text: 'Hi' } },
      ]),
    );
    expect(reply.status).toBe(400);
    expect(JSON.stringify(reply.body)).toContain(
      'Nothing was saved. Action 2: speak would be refused',
    );
    expect(await stored()).toBe(0);
  });

  it('refuses a command value the device does not accept', async () => {
    const reply = await saved(
      definition([{ type: 'command', deviceId: lamp, capability: 'brightness', value: 500 }]),
    );
    expect(reply.status).toBe(400);
    expect(JSON.stringify(reply.body)).toContain('Action 1: brightness command would be refused');
    expect(await stored()).toBe(0);
  });

  it('names every bad action at once', async () => {
    const reply = await saved(
      definition([
        { type: 'command', deviceId: lamp, capability: 'brightness', value: 500 },
        { type: 'command', deviceId: lamp, capability: 'temperature', value: 20 },
      ]),
    );
    const text = JSON.stringify(reply.body);
    expect(text).toContain('Action 1');
    expect(text).toContain('Action 2');
  });

  it('saves a tool action with the right arguments', async () => {
    const reply = await saved(
      definition([
        { type: 'command', deviceId: lamp, capability: 'brightness', value: 40 },
        {
          type: 'tool',
          profileId: person,
          tool: 'speak',
          args: { target: { kind: 'device', deviceId: camera }, text: 'Hi' },
        },
      ]),
    );
    expect(reply.status).toBe(200);
    expect(await stored()).toBe(1);
  });
});
