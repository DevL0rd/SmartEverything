import {
  CLIENT_CAPABILITIES_META_KEY,
  CLIENT_INFO_META_KEY,
  PROTOCOL_VERSION_META_KEY,
  SERVER_INFO_META_KEY,
} from '@modelcontextprotocol/server';
import { API_ENDPOINTS, MCP_TOOLS } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { listedFor } from '../../src/extensions/mcp/server';

const SEARCHING = { 'user-agent': 'claude-code/2.1.299' };
import { TOOLS } from '../../src/extensions/mcp/tools';
import { PLUGIN_ONLY_TOOLS } from '../../src/extensions/mcp/tools/registry';
import { bootServer, verifiedPublicUrl, type Booted } from '../support/booted';
import { captureLogs } from '../support/logs';
import { call, temporaryDirectory } from '../support/server';
import { RPC_ERROR, callTool, initialize, messageOf, resultOf, rpc } from './client';

function listedToExternalMcp(name: string): boolean {
  return name !== 'self_update' && !PLUGIN_ONLY_TOOLS.has(name);
}

describe('the served tool catalogue', () => {
  it('offers exactly the tools the app describes, with the same words and read-only hints', () => {
    expect(
      TOOLS.map((tool) => ({
        name: tool.listing.name,
        title: tool.listing.title,
        description: tool.listing.description,
        readOnly: tool.listing.annotations.readOnlyHint,
      })),
    ).toStrictEqual(
      MCP_TOOLS.map((tool) => ({
        name: tool.name,
        title: tool.title,
        description: tool.description,
        readOnly: tool.access === 'read',
      })),
    );
  });
});

const MODERN = '2026-07-28';

function modernHeaders(method: string): Record<string, string> {
  return { 'mcp-protocol-version': MODERN, 'mcp-method': method };
}

function modernEnvelope(version = MODERN): Record<string, unknown> {
  return {
    _meta: {
      [PROTOCOL_VERSION_META_KEY]: version,
      [CLIENT_INFO_META_KEY]: { name: 'test-client', version: '1.0.0' },
      [CLIENT_CAPABILITIES_META_KEY]: {},
    },
  };
}

const STREAMABLE = {
  'content-type': 'application/json',
  accept: 'application/json, text/event-stream',
} as const;

describe('the MCP endpoint', () => {
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

  async function errorOf(response: Response): Promise<{ code: number; message: string }> {
    return RPC_ERROR.parse(await messageOf(response)).error;
  }

  it('initializes with a personal token and records when the token was used', async () => {
    const result = await resultOf(await rpc(booted.base, token, initialize()));
    expect(result).toMatchObject({
      protocolVersion: '2025-11-25',
      capabilities: { tools: { listChanged: true } },
      serverInfo: { name: 'smarteverything', title: 'SmartEverything' },
    });
    const later = await resultOf(await rpc(booted.base, token, initialize('1999')));
    expect(later['protocolVersion']).toBe('2025-11-25');
    const tokens = API_ENDPOINTS.listMcpTokens.response.parse(
      (await call(booted.base, booted.owner, { method: 'GET', path: '/api/mcp/tokens' })).body,
    );
    expect(tokens[0]?.last_used_at).not.toBeNull();
  });

  it('answers ping, accepts notifications and responses with 202, and opens a stream only when asked for one', async () => {
    expect(await resultOf(await rpc(booted.base, token, { method: 'ping' }))).toStrictEqual({});
    const notification = await fetch(`${booted.base}/mcp`, {
      method: 'POST',
      headers: { ...STREAMABLE, authorization: `Bearer ${token}` },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }),
    });
    expect(notification.status).toBe(202);
    expect(await notification.text()).toBe('');
    const reply = await fetch(`${booted.base}/mcp`, {
      method: 'POST',
      headers: { ...STREAMABLE, authorization: `Bearer ${token}` },
      body: JSON.stringify({ jsonrpc: '2.0', id: 4, result: {} }),
    });
    expect(reply.status).toBe(202);
    const plainGet = await fetch(`${booted.base}/mcp`, {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(plainGet.status).toBe(406);
    const deleted = await fetch(`${booted.base}/mcp`, {
      method: 'DELETE',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(deleted.status).toBe(405);
  });

  it('refuses unsupported versions, malformed bodies, unknown methods and unknown tools', async () => {
    const version = await rpc(
      booted.base,
      token,
      { method: 'ping' },
      {
        'mcp-protocol-version': '2024-01-01',
      },
    );
    expect(version.status).toBe(400);
    expect((await errorOf(version)).message).toContain('Unsupported protocol version: 2024-01-01');
    const broken = await fetch(`${booted.base}/mcp`, {
      method: 'POST',
      headers: { ...STREAMABLE, authorization: `Bearer ${token}` },
      body: '{',
    });
    expect(broken.status).toBe(400);
    expect((await errorOf(broken)).code).toBe(-32700);
    const method = await rpc(booted.base, token, { method: 'prompts/list' });
    expect((await errorOf(method)).code).toBe(-32601);
    const tool = await rpc(booted.base, token, { method: 'tools/call', params: { name: 'nope' } });
    expect(await errorOf(tool)).toStrictEqual({
      code: -32602,
      message: 'Unknown tool: nope',
    });
    const nameless = await rpc(booted.base, token, { method: 'tools/call', params: {} });
    expect((await errorOf(nameless)).message).toContain('name');
  });

  it('negotiates every 2025-era version a client offers and answers a newer offer with its newest', async () => {
    const offered = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];
    for (const version of offered) {
      const result = await resultOf(
        await rpc(booted.base, token, initialize(version), { 'mcp-protocol-version': version }),
      );
      expect(result['protocolVersion']).toBe(version);
    }
    const newer = await resultOf(await rpc(booted.base, token, initialize(MODERN)));
    expect(newer['protocolVersion']).toBe('2025-11-25');
  });

  it('answers a 2025-era follow-up that names its negotiated version in the header', async () => {
    for (const version of ['2025-11-25', '2025-06-18', '2025-03-26']) {
      const listed = await resultOf(
        await rpc(
          booted.base,
          token,
          { method: 'tools/list' },
          { 'mcp-protocol-version': version },
        ),
      );
      expect(z.array(z.unknown()).parse(listed['tools']).length).toBeGreaterThan(0);
    }
  });

  it('answers server/discover with 2026-07-28 among the revisions it serves', async () => {
    const result = await resultOf(
      await rpc(
        booted.base,
        token,
        { method: 'server/discover', params: modernEnvelope() },
        modernHeaders('server/discover'),
      ),
    );
    expect(z.array(z.string()).parse(result['supportedVersions'])).toContain(MODERN);
    expect(result).toMatchObject({
      _meta: { [SERVER_INFO_META_KEY]: { name: 'smarteverything' } },
      capabilities: { tools: { listChanged: true } },
    });
  });

  it('lists the tools to a 2026-07-28 request that carries the version in its header and its envelope', async () => {
    const result = await resultOf(
      await rpc(
        booted.base,
        token,
        { method: 'tools/list', params: modernEnvelope() },
        modernHeaders('tools/list'),
      ),
    );
    const names = z
      .array(z.object({ name: z.string() }))
      .parse(result['tools'])
      .map((tool) => tool.name);
    expect(names).toContain('tool_search');
    expect(names).toContain('device_find');
  });

  it('refuses a 2026-07-28 header whose body names another version, and one without the envelope', async () => {
    const mismatched = await rpc(
      booted.base,
      token,
      {
        method: 'tools/list',
        params: modernEnvelope('2025-11-25'),
      },
      modernHeaders('tools/list'),
    );
    expect(mismatched.status).toBe(400);
    const bare = await rpc(
      booted.base,
      token,
      { method: 'tools/list' },
      modernHeaders('tools/list'),
    );
    expect(bare.status).toBe(400);
    expect((await errorOf(bare)).code).toBe(-32602);
  });

  it('lists only the core tools and discovery to a client without its own tool search', async () => {
    const listed = z
      .array(z.object({ name: z.string() }))
      .parse((await resultOf(await rpc(booted.base, token, { method: 'tools/list' })))['tools']);
    const names = listed.map((tool) => tool.name);
    expect(names).toContain('tool_search');
    expect(names).toContain('device_find');
    expect(names).not.toContain('automation_edit');
    expect(names.every((name) => listedFor('')(name))).toBe(true);
  });

  it('lists external tools with an object schema and honest annotations', async () => {
    const tools = z
      .array(
        z.object({
          name: z.string(),
          inputSchema: z.object({ type: z.literal('object') }),
          annotations: z.object({ readOnlyHint: z.boolean(), destructiveHint: z.boolean() }),
        }),
      )
      .parse(
        (await resultOf(await rpc(booted.base, token, { method: 'tools/list' }, SEARCHING)))[
          'tools'
        ],
      );
    const names = tools.map((tool) => tool.name);
    expect(names).toStrictEqual(MCP_TOOLS.map((tool) => tool.name).filter(listedToExternalMcp));
    expect(names).not.toContain('self_update');
    expect(
      tools.filter((tool) => tool.annotations.destructiveHint).map((tool) => tool.name),
    ).toStrictEqual([
      'room_edit',
      'group_edit',
      'transcript_edit',
      'scene_edit',
      'schedule_edit',
      'automation_edit',
      'automation_versions_edit',
      'automation_tests_edit',
      'secret_edit',
      'value_edit',
      'health_edit',
      'food_edit',
      'food_log',
      'person_edit',
      'talk_edit',
      'planner_edit',
      'project_edit',
      'chat_edit',
      'process_control',
      'computer_system_set',
      'computer_use',
      'computer_app_control',
      'file_edit',
      'operation_call',
    ]);
    expect(
      tools.some((tool) => tool.annotations.destructiveHint && tool.annotations.readOnlyHint),
    ).toBe(false);
  });

  it('lists exactly the registry listings, unchanged by the protocol layer', async () => {
    const listed = z
      .array(z.record(z.string(), z.unknown()))
      .parse(
        (await resultOf(await rpc(booted.base, token, { method: 'tools/list' }, SEARCHING)))[
          'tools'
        ],
      );
    expect(listed).toEqual(
      TOOLS.filter((tool) => listedToExternalMcp(tool.name)).map((tool) => tool.listing),
    );
  });

  it('answers a tool call as JSON text and a refusal as an error result with its code', async () => {
    const ok = await callTool(booted.base, token, 'home_read', {});
    expect(ok.isError).toBe(false);
    const refused = await callTool(booted.base, token, 'inbox_post', {});
    expect(refused.isError).toBe(true);
    expect(JSON.stringify(refused.content)).toContain('forbidden: inbox_post is only for a plugin');
    const update = await callTool(booted.base, token, 'self_update', { action: 'status' });
    expect(update.isError).toBe(true);
    expect(JSON.stringify(update.content)).toContain(
      'forbidden: Only the owner’s own AI chat can use self_update.',
    );
  });

  it('refuses a revoked personal token', async () => {
    const tokens = API_ENDPOINTS.listMcpTokens.response.parse(
      (await call(booted.base, booted.owner, { method: 'GET', path: '/api/mcp/tokens' })).body,
    );
    await call(booted.base, booted.owner, {
      method: 'DELETE',
      path: `/api/mcp/tokens/${tokens[0]?.id ?? ''}`,
    });
    const refused = await rpc(booted.base, token, { method: 'ping' });
    expect(refused.status).toBe(401);
    expect((await errorOf(refused)).message).toBe(
      'This personal token was revoked or never existed',
    );
  });
});
