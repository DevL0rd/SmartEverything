import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { stderr, stdin, stdout } from 'node:process';
import { createInterface } from 'node:readline';
import { z } from 'zod';
import { SERVER_INFO, SERVER_INSTRUCTIONS } from '../extensions/mcp/instructions';
import { PROTOCOL_VERSIONS } from '../extensions/mcp/protocol';
import { SERVICE_READY, SERVICE_READY_FILE } from '../service/configuration';
import { assistantEnvironment } from './environment';

const MESSAGE = z.looseObject({
  jsonrpc: z.literal('2.0'),
  id: z.union([z.string(), z.number()]).optional(),
  method: z.string().optional(),
  params: z.record(z.string(), z.unknown()).optional(),
});

type Message = z.infer<typeof MESSAGE>;

const REPLY = z.looseObject({
  result: z.unknown().optional(),
  error: z.looseObject({ message: z.string().optional() }).optional(),
});

const CALL_TIMEOUT_MS = 120_000;

class HttpStatusError extends Error {
  override readonly name = 'HttpStatusError';

  constructor(readonly status: number) {
    super(`SmartEverything answered HTTP ${String(status)}`);
  }
}

class MethodNotFound extends Error {
  override readonly name = 'MethodNotFound';
}

interface Endpoint {
  readonly url: string;
  readonly key: string;
}

function dataDirectory(): string {
  const directory = assistantEnvironment().SMARTEVERYTHING_DATA;
  if (directory === null) {
    throw new Error('SMARTEVERYTHING_DATA is not set for the SmartEverything bridge');
  }
  return directory;
}

async function endpointOf(): Promise<Endpoint> {
  const directory = dataDirectory();
  const ready = SERVICE_READY.parse(
    JSON.parse(await readFile(join(directory, SERVICE_READY_FILE), 'utf8')),
  );
  const key = (await readFile(join(directory, 'assistant', 'claude-code.key'), 'utf8')).trim();
  return { url: ready.url, key };
}

async function call(
  endpoint: Endpoint,
  method: string,
  params: Record<string, unknown>,
): Promise<unknown> {
  const response = await fetch(`${endpoint.url}/mcp`, {
    method: 'POST',
    signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
    headers: {
      authorization: `Bearer ${endpoint.key}`,
      'content-type': 'application/json',
      accept: 'application/json',
      'mcp-protocol-version': PROTOCOL_VERSIONS[0],
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  if (!response.ok) {
    throw new HttpStatusError(response.status);
  }
  const reply = REPLY.parse(await response.json());
  if (reply.error !== undefined) {
    throw new Error(reply.error.message ?? 'SmartEverything request failed');
  }
  return reply.result;
}

class Bridge {
  private endpoint: Promise<Endpoint> | null = null;

  private current(): Promise<Endpoint> {
    this.endpoint ??= endpointOf().catch((cause: unknown) => {
      this.endpoint = null;
      throw cause;
    });
    return this.endpoint;
  }

  async forward(method: string, params: Record<string, unknown>): Promise<unknown> {
    try {
      return await call(await this.current(), method, params);
    } catch (cause) {
      if (!(cause instanceof HttpStatusError) || cause.status !== 401) {
        throw cause;
      }
      this.endpoint = null;
      return call(await this.current(), method, params);
    }
  }

  async answer(message: Message): Promise<unknown> {
    const method = message.method ?? '';
    switch (method) {
      case 'initialize':
        return {
          protocolVersion:
            PROTOCOL_VERSIONS.find((version) => version === message.params?.['protocolVersion']) ??
            PROTOCOL_VERSIONS[0],
          capabilities: { tools: {} },
          serverInfo: SERVER_INFO,
          instructions: SERVER_INSTRUCTIONS,
        };
      case 'ping':
        return {};
      case 'tools/list':
      case 'tools/call':
        return this.forward(method, message.params ?? {});
      default:
        throw new MethodNotFound(`Unsupported method ${method}`);
    }
  }
}

function send(message: Record<string, unknown>): void {
  stdout.write(`${JSON.stringify({ jsonrpc: '2.0', ...message })}\n`);
}

async function handle(bridge: Bridge, message: Message): Promise<void> {
  if (message.id === undefined) {
    return;
  }
  try {
    send({ id: message.id, result: await bridge.answer(message) });
  } catch (cause) {
    send({
      id: message.id,
      error: {
        code: cause instanceof MethodNotFound ? -32601 : -32603,
        message: cause instanceof Error ? cause.message : 'SmartEverything request failed',
      },
    });
  }
}

function parsedJson(line: string): unknown {
  try {
    return JSON.parse(line);
  } catch (cause) {
    if (!(cause instanceof SyntaxError)) {
      throw cause;
    }
    return null;
  }
}

const bridge = new Bridge();

createInterface({ input: stdin }).on('line', (line) => {
  if (line.trim() === '') {
    return;
  }
  const parsed = MESSAGE.safeParse(parsedJson(line));
  if (parsed.success) {
    void handle(bridge, parsed.data);
  } else {
    stderr.write('smarteverything: ignored a malformed message\n');
  }
});
