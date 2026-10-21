import { API_ENDPOINTS } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { HubTool, HubToolResult, ToolCaller } from '../../src/ai-tools/hub-tool';
import { SE_TOOLS, hubResult } from '../../src/ai-tools/se-tools';
import { searchTools, switchedOffTools, toolDetails } from '../../src/ai-tools/tool-discovery';
import { operationLookup } from '../../src/extensions/mcp/tools/operation-details';
import { ToolHub } from '../../src/ai-tools/tool-hub';
import { TOOLS } from '../../src/extensions/mcp/tools';
import { bootServer, verifiedPublicUrl, type Booted } from '../support/booted';
import { captureLogs } from '../support/logs';
import { call, temporaryDirectory } from '../support/server';
import { callTool, resultOf, rpc, structured } from './client';

const LISTED = TOOLS.map((tool) => tool.listing);

const EVERY_AREA = { operations: operationLookup(() => true) };

const FOUND = z.object({
  tools: z.array(z.looseObject({ name: z.string() })),
  count: z.number(),
  hasMore: z.boolean(),
  nextCursor: z.string().optional(),
  operations: z.array(z.looseObject({ operation: z.string(), call: z.literal('operation_call') })),
});

function found(query: string, extra: Record<string, unknown> = {}): z.infer<typeof FOUND> {
  return FOUND.parse(searchTools(LISTED, { query, ...extra }, EVERY_AREA));
}

function names(query: string): string[] {
  return found(query).tools.map((tool) => tool.name);
}

describe('tool_search ranking', () => {
  it.each([
    ['turn on the light', 'device_control'],
    ['lights', 'device_control'],
    ['timer', 'schedule_edit'],
    ['water', 'food_log'],
    ['what is the weather', 'weather_read'],
    ['log my breakfast', 'food_log'],
    ['create automation', 'automation_edit'],
  ])('puts the tool for %j first', (query, expected) => {
    expect(names(query)[0]).toBe(expected);
  });

  it('finds settings tools for a settings word that only the settings tools name', () => {
    expect(names('firewall').slice(0, 2).sort()).toEqual(['settings_read', 'settings_sync']);
  });

  it('treats singular, plural and tense of a word alike', () => {
    expect(names('light')).toEqual(names('lights'));
    expect(names('schedule')).toEqual(names('scheduled'));
  });

  it('matches any word of the query, best match first, without needing every word', () => {
    expect(names('zzzz timer')).toContain('schedule_edit');
    expect(found('zzzz').count).toBe(0);
  });

  it('reaches operations that have no tool of their own through operation_call', () => {
    const operations = (query: string): string[] =>
      found(query).operations.map((entry) => entry.operation);
    expect(operations('bluetooth')).toContain('readBleDevice');
    expect(operations('device effect')).toEqual(
      expect.arrayContaining(['listDeviceEffects', 'endDeviceEffect']),
    );
  });

  it('does not turn a verb like turn into operations that merely control something else', () => {
    const operations = found('turn on the light').operations.map((entry) => entry.operation);
    expect(operations).not.toContain('controlAiAgentRun');
    expect(operations).not.toContain('controlAiChatProvider');
  });

  it('offers operations only where operation_call is offered, and only in a permitted area', () => {
    const without = LISTED.filter((tool) => tool.name !== 'operation_call');
    expect(searchTools(without, { query: 'bluetooth' }, EVERY_AREA)).not.toHaveProperty(
      'operations',
    );
    const none = FOUND.parse(
      searchTools(LISTED, { query: 'bluetooth' }, { operations: operationLookup(() => false) }),
    );
    expect(none.operations).toEqual([]);
  });
});

describe('API operations through tool_search and tool_read', () => {
  it('lists every operation of an area when only the area is given', () => {
    const listed = z
      .object({ operations: z.array(z.looseObject({ name: z.string(), area: z.string() })) })
      .parse(searchTools(LISTED, { area: 'computers' }, EVERY_AREA));
    expect(listed.operations.length).toBeGreaterThan(0);
    expect(listed.operations.every((entry) => entry.area === 'computers')).toBe(true);
  });

  it('refuses a search with neither words nor an area', () => {
    expect(() => searchTools(LISTED, {}, EVERY_AREA)).toThrow(/query, area or both/u);
  });

  it('reads the input schema of an operation by its camelCase name', () => {
    const read = z
      .object({ operation: z.looseObject({ name: z.string(), inputSchema: z.looseObject({}) }) })
      .parse(toolDetails(LISTED, { name: 'listDeviceEffects' }, EVERY_AREA));
    expect(read.operation.name).toBe('listDeviceEffects');
  });

  it('refuses a name that is neither a tool, an operation nor a schema, and says how to find one', () => {
    expect(() => toolDetails(LISTED, { name: 'list_rooms' }, EVERY_AREA)).toThrow(/tool_search/u);
  });
});

describe('tool_search paging', () => {
  it('pages with an opaque cursor, states whether more exist and repeats nothing', () => {
    const first = found('device', { limit: 2 });
    expect(first.tools).toHaveLength(2);
    expect(first.hasMore).toBe(true);
    expect(first.nextCursor).toBeDefined();
    const second = found('device', { limit: 2, cursor: first.nextCursor });
    const seen = new Set(first.tools.map((tool) => tool.name));
    expect(second.tools.every((tool) => !seen.has(tool.name))).toBe(true);
    expect(second.count).toBe(first.count);
    expect(second.operations).toEqual([]);
  });

  it('ends without a cursor on the last page', () => {
    const all = found('device', { limit: 50 });
    expect(all.hasMore).toBe(false);
    expect(all.nextCursor).toBeUndefined();
  });

  it('refuses a cursor that did not come from a search', () => {
    expect(() => searchTools(LISTED, { query: 'device', cursor: 'abc' })).toThrow(/nextCursor/u);
  });
});

describe('discovery tools are core', () => {
  it('never counts tool_search or tool_read as switched off', () => {
    expect([...switchedOffTools(['tool_search', 'tool_read', 'voice_speak'])]).toEqual([
      'voice_speak',
    ]);
  });
});

describe('the in-app answer of a tool run', () => {
  const nameOf = (): null => null;

  function homeTool(): HubTool {
    const found = SE_TOOLS.find((candidate) => candidate.name === 'home_read');
    if (found === undefined) {
      throw new Error('home_read is not an in-app tool');
    }
    return found;
  }

  it('keeps the code of a refusal beside its message', () => {
    const answer = hubResult(
      { kind: 'refused', refusal: { code: 'forbidden', message: 'This plugin may not.' } },
      homeTool(),
      {},
      nameOf,
    );
    expect(answer.response).toStrictEqual({ error: 'This plugin may not.', code: 'forbidden' });
  });

  it('hands over the structured result and decodes pictures without an envelope', () => {
    const answer = hubResult(
      {
        kind: 'done',
        output: {
          structured: { rooms: 2 },
          images: [{ data: Buffer.from('jpeg').toString('base64'), mimeType: 'image/jpeg' }],
        },
      },
      homeTool(),
      {},
      nameOf,
    );
    expect(answer.response).toStrictEqual({ result: { rooms: 2 } });
    expect(answer.pictures).toStrictEqual([{ data: Buffer.from('jpeg'), mimeType: 'image/jpeg' }]);
  });
});

describe('the in-app tool hub', () => {
  const caller: ToolCaller = {
    profileId: 'p',
    role: 'owner',
    chatId: null,
    via: 'chat',
    clientId: null,
  };
  const hub = new ToolHub([
    {
      tools: (): typeof SE_TOOLS => SE_TOOLS,
      validate: (): null => null,
      changes: (): (() => void) => () => undefined,
      call: (): Promise<HubToolResult> =>
        Promise.resolve({ response: { result: 'done' }, line: '', pictures: [] }),
    },
  ]);

  it('answers tool_search with the same ranking and cursor as the MCP server', async () => {
    const result = FOUND.parse(
      (await hub.call('tool_search', { query: 'timer', limit: 1 }, caller)).response,
    );
    expect(result.tools.map((tool) => tool.name)).toEqual(['schedule_edit']);
    expect(result.nextCursor).toBeDefined();
  });

  it('keeps the code of a discovery refusal and says it once', async () => {
    const bad = await hub.call('tool_search', { query: 'timer', cursor: 'abc' }, caller);
    expect(bad.response).toEqual({
      error: 'cursor must be a nextCursor from tool_search',
      code: 'invalid_request',
    });
    const missing = await hub.call('tool_read', { name: 'no_such_tool' }, caller);
    expect(missing.response).toMatchObject({ code: 'not_found' });
  });

  it('gives the schema of one variant through tool_read, like the MCP server', async () => {
    const DETAILS = z.object({
      tool: z.looseObject({ name: z.string() }),
      variant: z.looseObject({ selector: z.record(z.string(), z.string()) }),
    });
    const one = DETAILS.parse(
      (await hub.call('tool_read', { name: 'room_edit', variant: 'remove' }, caller)).response,
    );
    expect(one.variant.selector).toEqual({ action: 'remove' });
    const refused = hub.check('tool_read', { name: 'room_edit', variant: 'paint' });
    expect(refused).toMatchObject({ ok: false });
    expect(JSON.stringify(refused)).toContain('variant must be one of: create, update, remove');
  });
});

describe('the MCP server', () => {
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

  it('answers every call with its JSON as text and declares no output schema', async () => {
    const result = await resultOf(
      await rpc(booted.base, token, { method: 'tools/list' }, { 'user-agent': 'claude-code/2.1' }),
    );
    const tools = z.array(z.looseObject({ name: z.string() })).parse(result['tools']);
    expect(tools.length).toBeGreaterThan(0);
    expect(tools.every((tool) => !('outputSchema' in tool))).toBe(true);
    const answer = await callTool(booted.base, token, 'tool_search', { query: 'weather' });
    expect(answer).not.toHaveProperty('structuredContent');
    expect(FOUND.parse(structured(answer)).tools.length).toBeGreaterThan(0);
  });

  it('answers tool_search with the same ranking and cursor the in-app path uses', async () => {
    const result = FOUND.parse(
      structured(await callTool(booted.base, token, 'tool_search', { query: 'timer', limit: 1 })),
    );
    expect(result.tools.map((tool) => tool.name)).toEqual(['schedule_edit']);
    expect(result.nextCursor).toBeDefined();
  });

  it('words a discovery refusal with its code once', async () => {
    const result = await callTool(booted.base, token, 'tool_search', {
      query: 'timer',
      cursor: 'abc',
    });
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toContain('invalid_request: cursor must be');
    expect(JSON.stringify(result.content)).not.toContain('invalid_request: invalid_request');
  });

  it('refuses a null for a field that does not allow null and names the field', async () => {
    const result = await callTool(booted.base, token, 'room_edit', {
      action: 'create',
      name: null,
    });
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toContain('name');
  });

  it('keeps answering tool_search after the owner switches it off', async () => {
    await call(booted.base, booted.owner, {
      method: 'PUT',
      path: '/api/mcp/tools',
      body: { disabled: ['tool_search'] },
    });
    const result = await callTool(booted.base, token, 'tool_search', { query: 'weather' });
    expect(result.isError).toBe(false);
    const listed = await resultOf(
      await rpc(booted.base, token, { method: 'tools/list' }, { 'user-agent': 'claude-code/2.1' }),
    );
    const names = z.array(z.looseObject({ name: z.string() })).parse(listed['tools']);
    expect(names.map((tool) => tool.name)).toEqual(
      expect.arrayContaining(['tool_search', 'tool_read']),
    );
  });
});
