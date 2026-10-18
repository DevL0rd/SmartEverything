import { API_ENDPOINTS } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { HubTool, HubToolResult, ToolCaller } from '../../src/ai-tools/hub-tool';
import { SE_TOOLS, hubResult } from '../../src/ai-tools/se-tools';
import { searchTools, switchedOffTools } from '../../src/ai-tools/tool-discovery';
import { ToolHub } from '../../src/ai-tools/tool-hub';
import { TOOLS } from '../../src/extensions/mcp/tools';
import { bootServer, verifiedPublicUrl, type Booted } from '../support/booted';
import { captureLogs } from '../support/logs';
import { call, temporaryDirectory } from '../support/server';
import { callTool, resultOf, rpc, structured } from './client';

const LISTED = TOOLS.map((tool) => tool.listing);

const FOUND = z.object({
  tools: z.array(z.looseObject({ name: z.string() })),
  count: z.number(),
  hasMore: z.boolean(),
  nextCursor: z.string().optional(),
  operations: z.array(z.looseObject({ operation: z.string(), call: z.literal('call_operation') })),
});

function found(query: string, extra: Record<string, unknown> = {}): z.infer<typeof FOUND> {
  return FOUND.parse(searchTools(LISTED, { query, ...extra }));
}

function names(query: string): string[] {
  return found(query).tools.map((tool) => tool.name);
}

describe('search_tools ranking', () => {
  it.each([
    ['turn on the light', 'control_devices'],
    ['lights', 'control_devices'],
    ['timer', 'edit_schedule'],
    ['water', 'log_food'],
    ['what is the weather', 'get_weather'],
    ['log my breakfast', 'log_food'],
    ['create automation', 'edit_automation'],
  ])('puts the tool for %j first', (query, expected) => {
    expect(names(query)[0]).toBe(expected);
  });

  it('finds settings tools for a settings word that only the settings tools name', () => {
    expect(names('firewall').slice(0, 2).sort()).toEqual(['get_settings', 'update_settings']);
  });

  it('treats singular, plural and tense of a word alike', () => {
    expect(names('light')).toEqual(names('lights'));
    expect(names('schedule')).toEqual(names('scheduled'));
  });

  it('matches any word of the query, best match first, without needing every word', () => {
    expect(names('zzzz timer')).toContain('edit_schedule');
    expect(found('zzzz').count).toBe(0);
  });

  it('reaches operations that have no tool of their own through call_operation', () => {
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

  it('offers operations only where call_operation is offered, and only in a permitted area', () => {
    const without = LISTED.filter((tool) => tool.name !== 'call_operation');
    expect(searchTools(without, { query: 'bluetooth' })).not.toHaveProperty('operations');
    const none = FOUND.parse(
      searchTools(LISTED, { query: 'bluetooth' }, { operationInScope: () => false }),
    );
    expect(none.operations).toEqual([]);
  });
});

describe('search_tools paging', () => {
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
  it('never counts search_tools or tool_details as switched off', () => {
    expect([...switchedOffTools(['search_tools', 'tool_details', 'speak'])]).toEqual(['speak']);
  });
});

describe('the in-app answer of a tool run', () => {
  const nameOf = (): null => null;

  function homeTool(): HubTool {
    const found = SE_TOOLS.find((candidate) => candidate.name === 'get_home');
    if (found === undefined) {
      throw new Error('get_home is not an in-app tool');
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

  it('answers search_tools with the same ranking and cursor as the MCP server', async () => {
    const result = FOUND.parse(
      (await hub.call('search_tools', { query: 'timer', limit: 1 }, caller)).response,
    );
    expect(result.tools.map((tool) => tool.name)).toEqual(['edit_schedule']);
    expect(result.nextCursor).toBeDefined();
  });

  it('keeps the code of a discovery refusal and says it once', async () => {
    const bad = await hub.call('search_tools', { query: 'timer', cursor: 'abc' }, caller);
    expect(bad.response).toEqual({
      error: 'cursor must be a nextCursor from search_tools',
      code: 'invalid_request',
    });
    const missing = await hub.call('tool_details', { name: 'no_such_tool' }, caller);
    expect(missing.response).toMatchObject({ code: 'not_found' });
  });

  it('gives the schema of one variant through tool_details, like the MCP server', async () => {
    const DETAILS = z.object({
      tool: z.looseObject({ name: z.string() }),
      variant: z.looseObject({ selector: z.record(z.string(), z.string()) }),
    });
    const one = DETAILS.parse(
      (await hub.call('tool_details', { name: 'edit_room', variant: 'remove' }, caller)).response,
    );
    expect(one.variant.selector).toEqual({ action: 'remove' });
    const refused = hub.check('tool_details', { name: 'edit_room', variant: 'paint' });
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
    const result = await resultOf(await rpc(booted.base, token, { method: 'tools/list' }));
    const tools = z.array(z.looseObject({ name: z.string() })).parse(result['tools']);
    expect(tools.length).toBeGreaterThan(0);
    expect(tools.every((tool) => !('outputSchema' in tool))).toBe(true);
    const answer = await callTool(booted.base, token, 'search_tools', { query: 'weather' });
    expect(answer).not.toHaveProperty('structuredContent');
    expect(FOUND.parse(structured(answer)).tools.length).toBeGreaterThan(0);
  });

  it('answers search_tools with the same ranking and cursor the in-app path uses', async () => {
    const result = FOUND.parse(
      structured(await callTool(booted.base, token, 'search_tools', { query: 'timer', limit: 1 })),
    );
    expect(result.tools.map((tool) => tool.name)).toEqual(['edit_schedule']);
    expect(result.nextCursor).toBeDefined();
  });

  it('words a discovery refusal with its code once', async () => {
    const result = await callTool(booted.base, token, 'search_tools', {
      query: 'timer',
      cursor: 'abc',
    });
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toContain('invalid_request: cursor must be');
    expect(JSON.stringify(result.content)).not.toContain('invalid_request: invalid_request');
  });

  it('refuses a null for a field that does not allow null and names the field', async () => {
    const result = await callTool(booted.base, token, 'edit_room', {
      action: 'create',
      name: null,
    });
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toContain('name');
  });

  it('keeps answering search_tools after the owner switches it off', async () => {
    await call(booted.base, booted.owner, {
      method: 'PUT',
      path: '/api/mcp/tools',
      body: { disabled: ['search_tools'] },
    });
    const result = await callTool(booted.base, token, 'search_tools', { query: 'weather' });
    expect(result.isError).toBe(false);
    const listed = await resultOf(await rpc(booted.base, token, { method: 'tools/list' }));
    const names = z.array(z.looseObject({ name: z.string() })).parse(listed['tools']);
    expect(names.map((tool) => tool.name)).toEqual(
      expect.arrayContaining(['search_tools', 'tool_details']),
    );
  });
});
