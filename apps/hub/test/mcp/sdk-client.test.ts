import { listedFor } from '../../src/extensions/mcp/server';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { API_ENDPOINTS, MCP_TOOLS } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PLUGIN_ONLY_TOOLS } from '../../src/extensions/mcp/tools/registry';
import { bootServer, verifiedPublicUrl, type Booted } from '../support/booted';
import { captureLogs } from '../support/logs';
import { call, temporaryDirectory } from '../support/server';

describe('the official MCP client', () => {
  let directory: { path: string; remove: () => Promise<void> };
  let booted: Booted;
  let client: Client;

  beforeEach(async () => {
    captureLogs();
    directory = await temporaryDirectory();
    booted = await bootServer(directory.path);
    await verifiedPublicUrl(booted);
    const created = await call(booted.base, booted.owner, {
      method: 'POST',
      path: '/api/mcp/tokens',
      body: { name: 'SDK client' },
    });
    const { token } = API_ENDPOINTS.createMcpToken.response.parse(created.body);
    client = new Client({ name: 'sdk-client', version: '1.0.0' });
    await client.connect(
      new StreamableHTTPClientTransport(new URL(`${booted.base}/mcp`), {
        requestInit: { headers: { authorization: `Bearer ${token}` } },
      }),
    );
  });

  afterEach(async () => {
    await client.close();
    await booted.server.stop();
    await directory.remove();
  });

  it('negotiates, lists the tools and calls one', async () => {
    expect(client.getServerVersion()).toMatchObject({ name: 'smarteverything' });
    expect(client.getServerCapabilities()).toMatchObject({ tools: { listChanged: true } });
    const { tools } = await client.listTools();
    expect(tools.map((tool) => tool.name)).toStrictEqual(
      MCP_TOOLS.map((tool) => tool.name).filter(
        (name) => !PLUGIN_ONLY_TOOLS.has(name) && listedFor('')(name),
      ),
    );
    const answer = await client.callTool({ name: 'tool_search', arguments: { query: 'weather' } });
    expect(answer.isError).toBe(false);
    const docs = await client.readResource({ uri: 'smarteverything://docs/tools' });
    expect(docs.contents).toHaveLength(1);
  });

  it('hears about a tool switched off over the notification stream', async () => {
    const heard = new Promise<void>((resolve) => {
      client.setNotificationHandler('notifications/tools/list_changed', () => {
        resolve();
      });
    });
    await call(booted.base, booted.owner, {
      method: 'PUT',
      path: '/api/mcp/tools',
      body: { disabled: ['voice_speak'] },
    });
    await heard;
    const { tools } = await client.listTools();
    expect(tools.map((tool) => tool.name)).not.toContain('voice_speak');
  });
});
