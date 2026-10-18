import { createServer, type Server } from 'node:http';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ToolSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';

const LISTING = ToolSchema.parse({
  name: 'echo',
  description: 'Echoes.',
  inputSchema: { type: 'object', properties: { text: { type: 'string' } } },
  annotations: { readOnlyHint: true },
});

let open: Server | null = null;

afterEach(() => {
  open?.close();
  open = null;
});

async function serve(handle: (server: Server) => void): Promise<string> {
  const server = createServer();
  handle(server);
  open = server;
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('The test server has no port');
  }
  return `http://127.0.0.1:${String(address.port)}`;
}

describe('@modelcontextprotocol/sdk contract', () => {
  it('answers list and call handlers set on the low-level server, with the listing unchanged', async () => {
    const mcp = new McpServer(
      { name: 'home', version: '1.0.0' },
      { capabilities: { tools: { listChanged: true } }, instructions: 'Ask.' },
    );
    mcp.server.setRequestHandler(ListToolsRequestSchema, () => ({ tools: [LISTING] }));
    mcp.server.setRequestHandler(CallToolRequestSchema, ({ params }) => ({
      content: [{ type: 'text', text: JSON.stringify(params.arguments) }],
      isError: false,
    }));
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 'contract', version: '1.0.0' });
    await mcp.connect(serverSide);
    await client.connect(clientSide);

    expect(client.getInstructions()).toBe('Ask.');
    expect(client.getServerCapabilities()).toMatchObject({ tools: { listChanged: true } });
    expect((await client.listTools()).tools).toStrictEqual([LISTING]);
    const answer = await client.callTool({ name: 'echo', arguments: { text: 'hi' } });
    expect(answer).toMatchObject({ content: [{ type: 'text', text: '{"text":"hi"}' }] });
    await client.close();
  });

  it('answers a stateless request with JSON and refuses a client that cannot read both formats', async () => {
    const base = await serve((server) => {
      server.on('request', (request, response) => {
        const transport = new StreamableHTTPServerTransport({ enableJsonResponse: true });
        transport.onmessage = (message): void => {
          if ('id' in message && 'method' in message) {
            void transport.send({ jsonrpc: '2.0', id: message.id, result: {} });
          }
        };
        void transport.handleRequest(request, response);
      });
    });
    const headers = { 'content-type': 'application/json' };
    const ping = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' });
    const accepted = await fetch(`${base}/mcp`, {
      method: 'POST',
      headers: { ...headers, accept: 'application/json, text/event-stream' },
      body: ping,
    });
    expect(accepted.status).toBe(200);
    expect(accepted.headers.get('content-type')).toContain('application/json');
    expect(await accepted.json()).toStrictEqual({ jsonrpc: '2.0', id: 1, result: {} });
    const refused = await fetch(`${base}/mcp`, { method: 'POST', headers, body: ping });
    expect(refused.status).toBe(406);
    const unsupported = await fetch(`${base}/mcp`, {
      method: 'POST',
      headers: {
        ...headers,
        accept: 'application/json, text/event-stream',
        'mcp-protocol-version': '2024-01-01',
      },
      body: ping,
    });
    expect(unsupported.status).toBe(400);
  });

  it('pushes a notification down the standalone stream a client opened with GET', async () => {
    const transport = new StreamableHTTPServerTransport();
    const base = await serve((server) => {
      server.on('request', (request, response) => {
        void transport.handleRequest(request, response);
      });
    });
    const stream = await fetch(`${base}/mcp`, { headers: { accept: 'text/event-stream' } });
    expect(stream.status).toBe(200);
    await transport.send({ jsonrpc: '2.0', method: 'notifications/tools/list_changed' });
    const reader = z.instanceof(ReadableStream).parse(stream.body).getReader();
    const chunk = await reader.read();
    const text = new TextDecoder().decode(z.instanceof(Uint8Array).parse(chunk.value));
    expect(text).toContain('notifications/tools/list_changed');
    await reader.cancel();
    await transport.close();
  });
});
