import { createServer, type Server } from 'node:http';
import { NodeStreamableHTTPServerTransport } from '@modelcontextprotocol/node';
import { McpServer } from '@modelcontextprotocol/server';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';

let open: Server | null = null;

afterEach(() => {
  open?.close();
  open = null;
});

describe('@modelcontextprotocol/node contract', () => {
  it('pushes a tools/list_changed notification down the standalone stream a client opened with GET', async () => {
    const mcp = new McpServer(
      { name: 'home', version: '1.0.0' },
      { capabilities: { tools: { listChanged: true } } },
    );
    const transport = new NodeStreamableHTTPServerTransport();
    await mcp.connect(transport);
    const server = createServer((request, response) => {
      void transport.handleRequest(request, response);
    });
    open = server;
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (address === null || typeof address === 'string') {
      throw new Error('The test server has no port');
    }
    const stream = await fetch(`http://127.0.0.1:${String(address.port)}/mcp`, {
      headers: { accept: 'text/event-stream' },
    });
    expect(stream.status).toBe(200);
    await mcp.server.sendToolListChanged();
    const reader = z.instanceof(ReadableStream).parse(stream.body).getReader();
    const chunk = await reader.read();
    const text = new TextDecoder().decode(z.instanceof(Uint8Array).parse(chunk.value));
    expect(text).toContain('notifications/tools/list_changed');
    await reader.cancel();
    await mcp.close();
  });
});
