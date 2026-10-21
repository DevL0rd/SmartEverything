import { API_ENDPOINTS } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { bootServer, verifiedPublicUrl, type Booted } from '../support/booted';
import { captureLogs } from '../support/logs';
import { call, temporaryDirectory } from '../support/server';
import { callTool, initialize, resultOf, rpc, structured } from './client';

const ERROR_BUDGET = 2048;
const AUTOMATION_SCHEMA_BUDGET = 100_000;
const TOOL_LIST_BUDGET = 400_000;

const LISTED = z.array(
  z.looseObject({ name: z.string(), inputSchema: z.record(z.string(), z.unknown()) }),
);

let directory: { path: string; remove: () => Promise<void> };
let booted: Booted;
let token: string;

beforeEach(async () => {
  captureLogs();
  directory = await temporaryDirectory();
  booted = await bootServer(directory.path);
  await verifiedPublicUrl(booted);
  const created = await call(booted.base, booted.owner, {
    method: 'POST',
    path: '/api/mcp/tokens',
    body: { name: 'Claude Code' },
  });
  token = API_ENDPOINTS.createMcpToken.response.parse(created.body).token;
});

afterEach(async () => {
  await booted.server.stop();
  await directory.remove();
});

async function listed(): Promise<z.infer<typeof LISTED>> {
  const result = await resultOf(
    await rpc(booted.base, token, { method: 'tools/list' }, { 'user-agent': 'claude-code/2.1' }),
  );
  return LISTED.parse(result['tools']);
}

describe('a bad automation call', () => {
  it('returns a short error that names the failing field and carries no schema', async () => {
    const result = await callTool(booted.base, token, 'automation_edit', {
      action: 'create',
      name: 'Broken',
      definition: { triggers: [{ type: 'event', kind: 7 }], actions: 'none' },
    });
    expect(result.isError).toBe(true);
    const text = JSON.stringify(result.content);
    expect(text.length).toBeLessThan(ERROR_BUDGET);
    expect(text).toContain('definition');
    expect(text).not.toContain('$defs');
    expect(text).toContain('invalid_request');
  });
});

describe('the tool listing', () => {
  it('keeps automation_edit and the whole listing small by writing shared schemas once', async () => {
    const tools = await listed();
    const automation = tools.find((tool) => tool.name === 'automation_edit');
    expect(JSON.stringify(automation).length).toBeLessThan(AUTOMATION_SCHEMA_BUDGET);
    expect(JSON.stringify(tools).length).toBeLessThan(TOOL_LIST_BUDGET);
  });

  it('hides the plugin hand-over tool from an assistant that is not a plugin', async () => {
    expect((await listed()).map((tool) => tool.name)).not.toContain('inbox_post');
    const refused = await callTool(booted.base, token, 'inbox_post', {});
    expect(refused.isError).toBe(true);
    expect(JSON.stringify(refused.content)).toContain('forbidden');
  });
});

describe('tool_read', () => {
  async function details(args: Record<string, unknown>): Promise<z.infer<typeof DETAILS>> {
    return DETAILS.parse(structured(await callTool(booted.base, token, 'tool_read', args)));
  }

  const DETAILS = z.looseObject({
    tool: z.looseObject({ name: z.string() }),
    variant: z.looseObject({ selector: z.record(z.string(), z.string()) }).optional(),
  });

  it('sends the variants of a routed tool only when one is asked for', async () => {
    const plain = await details({ name: 'room_edit' });
    expect(plain.tool).not.toHaveProperty('variants');
    expect(plain.variant).toBeUndefined();
    const one = await details({ name: 'room_edit', variant: 'remove' });
    expect(one.variant?.selector).toEqual({ action: 'remove' });
  });

  it('says which variants exist when the asked one does not', async () => {
    const result = await callTool(booted.base, token, 'tool_read', {
      name: 'room_edit',
      variant: 'paint',
    });
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toContain(
      'variant must be one of: create, update, remove',
    );
    const single = await callTool(booted.base, token, 'tool_read', {
      name: 'home_read',
      variant: 'x',
    });
    expect(single.isError).toBe(false);
    expect(JSON.stringify(single.content)).toContain('home_read has no variants');
  });
});

describe('the server instructions', () => {
  async function instructions(): Promise<string> {
    const result = await resultOf(await rpc(booted.base, token, initialize()));
    return z.string().parse(result['instructions']);
  }

  it('stop naming a tool the owner switched off', async () => {
    expect(await instructions()).toContain('chat_post');
    await call(booted.base, booted.owner, {
      method: 'PUT',
      path: '/api/mcp/tools',
      body: { disabled: ['chat_post'] },
    });
    const after = await instructions();
    expect(after).not.toContain('chat_post');
    expect(after).toContain('home_read');
  });
});
