import { API_ENDPOINTS } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { bootServer, linkFakeProvider, verifiedPublicUrl, type Booted } from '../support/booted';
import { captureLogs } from '../support/logs';
import { call, temporaryDirectory } from '../support/server';
import { callTool, structured } from './client';

let directory: { path: string; remove: () => Promise<void> };
let booted: Booted;
let token: string;
let person: string;

const PEOPLE = z.object({ people: z.array(z.looseObject({ id: z.string() })) });

const OPERATION = z.object({ operation: z.looseObject({ name: z.string() }) });

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
  const people = PEOPLE.parse(structured(await callTool(booted.base, token, 'person_read', {})));
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
    const text = await refusal('health_read', {
      view: 'summary',
      from: '2026-10-10',
      to: '2026-10-10',
      personId: person,
    });
    expect(text).toContain('view summary does not take personId');
    expect(text).toContain('from (required), to (required), metrics, records');
  });

  it('name the argument a tool that takes none was sent', async () => {
    const text = await refusal('home_read', { rooms: true });
    expect(text).toContain('The arguments are not valid');
    expect(text).toContain('rooms');
  });

  it('say how a day must be written', async () => {
    const text = await refusal('health_read', {
      view: 'summary',
      from: '2026-10-10T00:00:00',
      to: '2026-10-10T23:59:59',
    });
    expect(text).toContain('must be a day written YYYY-MM-DD');
  });

  it('read an operation by its exact camelCase name through tool_read', async () => {
    const result = await callTool(booted.base, token, 'tool_read', { name: 'listClaudeSessions' });
    expect(OPERATION.parse(structured(result)).operation.name).toBe('listClaudeSessions');
  });

  it('refuse a snake_case operation or a tool name in operation_call and say the right one', async () => {
    const snake = await refusal('operation_call', { operation: 'list_claude_prompts' });
    expect(snake).toContain('did you mean listClaudePrompts');
    const tool = await refusal('operation_call', { operation: 'remote_press' });
    expect(tool).toContain('remote_press is a tool, not an operation: call it directly');
  });

  it('suggest the operations that look like an unknown name', async () => {
    const called = await refusal('operation_call', { operation: 'claudeSession' });
    expect(called).toContain('There is no operation claudeSession');
    expect(called).toContain('readClaudeSession');
  });
});
