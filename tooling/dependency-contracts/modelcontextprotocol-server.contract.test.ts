import { createServer, type Server } from 'node:http';
import {
  CLIENT_CAPABILITIES_META_KEY,
  CLIENT_INFO_META_KEY,
  InMemoryServerEventBus,
  McpServer,
  PROTOCOL_VERSION_META_KEY,
  createMcpHandler,
  specTypeSchemas,
} from '@modelcontextprotocol/server';
import { toNodeHandler } from '@modelcontextprotocol/node';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';

const VALIDATED_LISTING = specTypeSchemas.Tool['~standard'].validate({
  name: 'echo',
  description: 'Echoes.',
  inputSchema: { type: 'object', properties: { text: { type: 'string' } } },
  annotations: { readOnlyHint: true },
});
if (VALIDATED_LISTING.issues !== undefined) {
  throw new Error('The echo listing is not a valid tool');
}
const LISTING = VALIDATED_LISTING.value;

const MODERN = '2026-07-28';
const LEGACY_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'] as const;

const RESULT = z.object({ result: z.record(z.string(), z.unknown()) });
const FAILURE = z.object({ error: z.object({ code: z.number() }) });

let open: Server | null = null;

afterEach(() => {
  open?.close();
  open = null;
});

function echoServer(): McpServer {
  const mcp = new McpServer(
    { name: 'home', version: '1.0.0' },
    { capabilities: { tools: { listChanged: true } }, instructions: 'Ask.' },
  );
  mcp.server.setRequestHandler('tools/list', () => ({ tools: [LISTING] }));
  return mcp;
}

async function serve(): Promise<string> {
  const handler = createMcpHandler(echoServer);
  const server = createServer((request, response) => {
    void toNodeHandler(handler)(
      {
        ...(request.method === undefined ? {} : { method: request.method }),
        ...(request.url === undefined ? {} : { url: request.url }),
        headers: request.headers,
        [Symbol.asyncIterator]: () => request[Symbol.asyncIterator](),
      },
      response,
    );
  });
  open = server;
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('The test server has no port');
  }
  return `http://127.0.0.1:${String(address.port)}/mcp`;
}

async function post(
  url: string,
  headers: Readonly<Record<string, string>>,
  method: string,
  params: Readonly<Record<string, unknown>>,
): Promise<Response> {
  return fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      ...headers,
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
}

async function resultOf(response: Response): Promise<Record<string, unknown>> {
  expect(response.status).toBe(200);
  const text = await response.text();
  const body = (response.headers.get('content-type') ?? '').includes('text/event-stream')
    ? (text.split('\n').find((line) => line.startsWith('data:')) ?? '').slice('data:'.length)
    : text;
  return RESULT.parse(JSON.parse(body)).result;
}

function envelope(version: string): Record<string, unknown> {
  return {
    _meta: {
      [PROTOCOL_VERSION_META_KEY]: version,
      [CLIENT_INFO_META_KEY]: { name: 'contract', version: '1.0.0' },
      [CLIENT_CAPABILITIES_META_KEY]: {},
    },
  };
}

function initialize(version: string): Record<string, unknown> {
  return {
    protocolVersion: version,
    capabilities: {},
    clientInfo: { name: 'contract', version: '1.0.0' },
  };
}

describe('@modelcontextprotocol/server contract', () => {
  it('answers server/discover and tools/list for a 2026-07-28 request that carries its envelope', async () => {
    const url = await serve();
    const headers = { 'mcp-protocol-version': MODERN };
    const discovered = await resultOf(
      await post(
        url,
        { ...headers, 'mcp-method': 'server/discover' },
        'server/discover',
        envelope(MODERN),
      ),
    );
    expect(discovered['supportedVersions']).toStrictEqual([MODERN]);
    expect(discovered).toMatchObject({ capabilities: { tools: { listChanged: true } } });
    const listed = await resultOf(
      await post(url, { ...headers, 'mcp-method': 'tools/list' }, 'tools/list', envelope(MODERN)),
    );
    expect(listed['tools']).toStrictEqual([LISTING]);
  });

  it('negotiates each 2025-era version from initialize and answers a newer offer with its newest', async () => {
    const url = await serve();
    for (const version of LEGACY_VERSIONS) {
      const result = await resultOf(
        await post(url, { 'mcp-protocol-version': version }, 'initialize', initialize(version)),
      );
      expect(result['protocolVersion']).toBe(version);
    }
    const newer = await resultOf(await post(url, {}, 'initialize', initialize(MODERN)));
    expect(newer['protocolVersion']).toBe('2025-11-25');
  });

  it('serves a 2025-era tools/list that names its negotiated version in the header', async () => {
    const url = await serve();
    for (const version of LEGACY_VERSIONS) {
      const listed = await resultOf(
        await post(url, { 'mcp-protocol-version': version }, 'tools/list', {}),
      );
      expect(listed['tools']).toStrictEqual([LISTING]);
    }
  });

  it('refuses a 2026-07-28 header without its envelope and a version it does not serve', async () => {
    const url = await serve();
    const bare = await post(
      url,
      { 'mcp-protocol-version': MODERN, 'mcp-method': 'tools/list' },
      'tools/list',
      {},
    );
    expect(bare.status).toBe(400);
    expect(FAILURE.parse(await bare.json()).error.code).toBe(-32602);
    const unknown = await post(url, { 'mcp-protocol-version': '2024-01-01' }, 'tools/list', {});
    expect(unknown.status).toBe(400);
  });

  it('answers a stateless 2025-era GET and DELETE with 405', async () => {
    const url = await serve();
    expect((await fetch(url, { headers: { accept: 'text/event-stream' } })).status).toBe(405);
    expect((await fetch(url, { method: 'DELETE' })).status).toBe(405);
  });

  it('delivers a published change event to every subscriber until it unsubscribes', () => {
    const bus = new InMemoryServerEventBus();
    const heard: string[] = [];
    const stop = bus.subscribe((event) => heard.push(event.kind));
    bus.publish({ kind: 'tools_list_changed' });
    stop();
    bus.publish({ kind: 'prompts_list_changed' });
    expect(heard).toStrictEqual(['tools_list_changed']);
  });
});
