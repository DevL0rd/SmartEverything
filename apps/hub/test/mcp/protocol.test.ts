import { API_ENDPOINTS, MCP_TOOLS } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { TOOLS } from '../../src/extensions/mcp/tools';
import { PLUGIN_ONLY_TOOLS } from '../../src/extensions/mcp/tools/registry';
import { bootServer, verifiedPublicUrl, type Booted } from '../support/booted';
import { captureLogs } from '../support/logs';
import { call, temporaryDirectory } from '../support/server';
import { RPC_ERROR, callTool, initialize, resultOf, rpc } from './client';

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
    return RPC_ERROR.parse(await response.json()).error;
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
    expect(deleted.status).toBe(200);
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
      message: 'MCP error -32602: Unknown tool: nope',
    });
    const nameless = await rpc(booted.base, token, { method: 'tools/call', params: {} });
    expect((await errorOf(nameless)).message).toContain('name');
  });

  it('lists every tool with an object schema and honest annotations', async () => {
    const tools = z
      .array(
        z.object({
          name: z.string(),
          inputSchema: z.object({ type: z.literal('object') }),
          annotations: z.object({ readOnlyHint: z.boolean(), destructiveHint: z.boolean() }),
        }),
      )
      .parse((await resultOf(await rpc(booted.base, token, { method: 'tools/list' })))['tools']);
    expect(tools.map((tool) => tool.name)).toStrictEqual(
      MCP_TOOLS.map((tool) => tool.name).filter((name) => !PLUGIN_ONLY_TOOLS.has(name)),
    );
    expect(
      tools.filter((tool) => tool.annotations.destructiveHint).map((tool) => tool.name),
    ).toStrictEqual([
      'control_device_target',
      'press_remote_button',
      'control_devices',
      'run_scene',
      'edit_project_files',
      'clear_preview_data',
      'end_process',
      'set_computer_system',
      'use_computer',
      'edit_computer_files',
      'edit_claude_session',
    ]);
    expect(
      tools.some((tool) => tool.annotations.destructiveHint && tool.annotations.readOnlyHint),
    ).toBe(false);
  });

  it('lists exactly the registry listings, unchanged by the protocol layer', async () => {
    const listed = z
      .array(z.record(z.string(), z.unknown()))
      .parse((await resultOf(await rpc(booted.base, token, { method: 'tools/list' })))['tools']);
    expect(listed).toEqual(
      TOOLS.filter((tool) => !PLUGIN_ONLY_TOOLS.has(tool.name)).map((tool) => tool.listing),
    );
  });

  it('answers a tool call as JSON text and a refusal as an error result with its code', async () => {
    const ok = await callTool(booted.base, token, 'get_home', {});
    expect(ok.isError).toBe(false);
    const refused = await callTool(booted.base, token, 'ai_inbox_post', {});
    expect(refused.isError).toBe(true);
    expect(JSON.stringify(refused.content)).toContain(
      'forbidden: ai_inbox_post is only for a plugin',
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
