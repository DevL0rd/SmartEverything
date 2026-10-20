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
      personId: person,
    });
    expect(text).toContain('view summary does not take personId');
    expect(text).toContain('from (required), to (required), metrics, records');
  });

  it('name the argument a tool that takes none was sent', async () => {
    const text = await refusal('get_home', { rooms: true });
    expect(text).toContain('The arguments are not valid');
    expect(text).toContain('rooms');
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
      operations: ['control_claude_cli_session', 'list_claude_prompts', 'listClaudeSessions'],
    });
    const names = OPERATIONS.parse(structured(result)).operations.map((entry) => entry.name);
    expect(names).toStrictEqual([
      'controlClaudeCliSession',
      'listClaudePrompts',
      'listClaudeSessions',
    ]);
  });

  it('suggest the operations that look like an unknown name', async () => {
    const listed = await refusal('list_operations', { operations: ['claudeSession'] });
    expect(listed).toContain('There is no operation claudeSession');
    expect(listed).toContain('did you mean');
    expect(listed).toContain('readClaudeSession');
    const called = await refusal('call_operation', { operation: 'sessions' });
    expect(called).toContain('listClaudeSessions');
  });
});
