import { API_ENDPOINTS, MCP_TOOLS } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  INCOMING,
  isRequest,
  isSupportedVersion,
  negotiatedVersion,
} from '../../src/extensions/mcp/protocol';
import { TOOLS } from '../../src/extensions/mcp/tools';
import { bootServer, verifiedPublicUrl, type Booted } from '../support/booted';
import { captureLogs } from '../support/logs';
import { call, temporaryDirectory } from '../support/server';
import { RPC_ERROR, resultOf, rpc } from './client';

describe('the JSON-RPC message rules', () => {
  it('echoes a supported protocol version and offers the latest for any other', () => {
    expect(negotiatedVersion('2025-06-18')).toBe('2025-06-18');
    expect(negotiatedVersion('2025-03-26')).toBe('2025-03-26');
    expect(negotiatedVersion('2026-07-28')).toBe('2025-11-25');
    expect(negotiatedVersion(undefined)).toBe('2025-11-25');
  });

  it('accepts a missing version header and refuses an unknown one', () => {
    expect(isSupportedVersion(undefined)).toBe(true);
    expect(isSupportedVersion('2025-11-25')).toBe(true);
    expect(isSupportedVersion('2024-11-05')).toBe(false);
  });

  it('tells requests, notifications and responses apart and refuses batches', () => {
    const request = INCOMING.parse({ jsonrpc: '2.0', id: 1, method: 'ping' });
    const notification = INCOMING.parse({ jsonrpc: '2.0', method: 'notifications/initialized' });
    const response = INCOMING.parse({ jsonrpc: '2.0', id: 1, result: {} });
    expect([isRequest(request), isRequest(notification), isRequest(response)]).toStrictEqual([
      true,
      false,
      false,
    ]);
    expect(INCOMING.safeParse([{ jsonrpc: '2.0', id: 1, method: 'ping' }]).success).toBe(false);
    expect(INCOMING.safeParse({ jsonrpc: '1.0', id: 1, method: 'ping' }).success).toBe(false);
  });
});

describe('the served tool catalogue', () => {
  it('offers exactly the tools the app describes, with the same words and read-only hints', () => {
    const ANNOTATIONS = z.object({ readOnlyHint: z.boolean() });
    expect(
      TOOLS.map((tool) => ({
        name: tool.listing['name'],
        title: tool.listing['title'],
        description: tool.listing['description'],
        readOnly: ANNOTATIONS.parse(tool.listing['annotations']).readOnlyHint,
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
    const result = await resultOf(
      await rpc(booted.base, token, {
        method: 'initialize',
        params: { protocolVersion: '2025-11-25', capabilities: {} },
      }),
    );
    expect(result).toMatchObject({
      protocolVersion: '2025-11-25',
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: 'smarteverything', title: 'SmartEverything' },
    });
    const later = await resultOf(
      await rpc(booted.base, token, { method: 'initialize', params: { protocolVersion: '1999' } }),
    );
    expect(later['protocolVersion']).toBe('2025-11-25');
    const tokens = API_ENDPOINTS.listMcpTokens.response.parse(
      (await call(booted.base, booted.owner, { method: 'GET', path: '/api/mcp/tokens' })).body,
    );
    expect(tokens[0]?.last_used_at).not.toBeNull();
  });

  it('answers ping, accepts notifications and responses with 202, and opens no stream', async () => {
    expect(await resultOf(await rpc(booted.base, token, { method: 'ping' }))).toStrictEqual({});
    const notification = await fetch(`${booted.base}/mcp`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }),
    });
    expect(notification.status).toBe(202);
    expect(await notification.text()).toBe('');
    const reply = await fetch(`${booted.base}/mcp`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 4, result: {} }),
    });
    expect(reply.status).toBe(202);
    for (const method of ['GET', 'DELETE']) {
      const refused = await fetch(`${booted.base}/mcp`, {
        method,
        headers: { authorization: `Bearer ${token}` },
      });
      expect(refused.status).toBe(405);
      expect(refused.headers.get('allow')).toBe('POST');
    }
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
    expect((await errorOf(version)).message).toContain(
      'Unsupported MCP-Protocol-Version 2024-01-01',
    );
    const send = (body: string): Promise<Response> =>
      fetch(`${booted.base}/mcp`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body,
      });
    const broken = await send('{');
    expect(broken.status).toBe(400);
    expect((await errorOf(broken)).code).toBe(-32700);
    const batch = await send(JSON.stringify([{ jsonrpc: '2.0', id: 1, method: 'ping' }]));
    expect(batch.status).toBe(400);
    expect((await errorOf(batch)).code).toBe(-32600);
    const method = await rpc(booted.base, token, { method: 'resources/list' });
    expect(await errorOf(method)).toStrictEqual({
      code: -32601,
      message: 'This server does not answer resources/list',
    });
    const tool = await rpc(booted.base, token, { method: 'tools/call', params: { name: 'nope' } });
    expect(await errorOf(tool)).toStrictEqual({ code: -32602, message: 'Unknown tool: nope' });
    const nameless = await rpc(booted.base, token, { method: 'tools/call', params: {} });
    expect(await errorOf(nameless)).toStrictEqual({
      code: -32602,
      message: 'tools/call needs a tool name',
    });
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
    expect(tools.map((tool) => tool.name)).toStrictEqual(MCP_TOOLS.map((tool) => tool.name));
    expect(
      tools.filter((tool) => tool.annotations.destructiveHint).map((tool) => tool.name),
    ).toStrictEqual(['set_device', 'run_scene']);
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
