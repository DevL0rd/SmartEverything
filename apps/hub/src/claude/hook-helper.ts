import { request as httpRequest, type IncomingMessage } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import process, { argv, stderr, stdin, stdout } from 'node:process';
import { parseArgs } from 'node:util';
import { floorDenied } from './hook-output';
import { LINK_PATHS } from './link-paths';

const RECONNECT_FIRST_MS = 1000;

const RECONNECT_LAST_MS = 30_000;

class HelperError extends Error {
  override readonly name = 'HelperError';
}

interface Endpoint {
  readonly host: string;
  readonly port: number;
  readonly token: string;
}

function stringField(text: string, field: string): string {
  const value: unknown = JSON.parse(text);
  if (typeof value === 'object' && value !== null && field in value) {
    const found: unknown = Object.entries(value).find(([key]) => key === field)?.[1];
    if (typeof found === 'string') {
      return found;
    }
  }
  throw new HelperError(`the JSON has no text field ${field}`);
}

async function tokenOf(data: string): Promise<string> {
  return (await readFile(join(data, 'claude', 'link.token'), 'utf8')).trim();
}

async function endpointOf(data: string): Promise<Endpoint> {
  const ready = await readFile(join(data, 'claude', 'link-endpoint.json'), 'utf8').catch(
    (cause: unknown) => {
      if (cause instanceof Error && 'code' in cause && cause.code === 'ENOENT') {
        return readFile(join(data, 'service-ready.json'), 'utf8');
      }
      throw cause;
    },
  );
  const url = new URL(stringField(ready, 'url'));
  if (url.protocol !== 'http:' || !['127.0.0.1', '[::1]', 'localhost'].includes(url.hostname)) {
    throw new HelperError('the hook endpoint must be this computer loopback HTTP listener');
  }
  const token = await tokenOf(data);
  return { host: url.hostname, port: Number(url.port), token };
}

async function readStdin(): Promise<string> {
  stdin.setEncoding('utf8');
  let text = '';
  for await (const chunk of stdin) {
    text += String(chunk);
  }
  return text;
}

interface Call {
  readonly method: 'GET' | 'POST';
  readonly path: string;
  readonly body: string | null;
  readonly onResponse: (response: IncomingMessage) => void;
}

function send(endpoint: Endpoint, call: Call): Promise<void> {
  const { method, path, body, onResponse } = call;
  return new Promise((resolve, reject) => {
    const outgoing = httpRequest(
      {
        host: endpoint.host,
        port: endpoint.port,
        method,
        path,
        headers: {
          authorization: `Bearer ${endpoint.token}`,
          ...(body === null
            ? {}
            : { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) }),
        },
      },
      (response) => {
        if (response.statusCode !== 200) {
          response.resume();
          reject(new HelperError(`SmartEverything answered HTTP ${String(response.statusCode)}`));
          return;
        }
        onResponse(response);
        response.once('end', resolve);
        response.once('error', reject);
      },
    );
    outgoing.once('error', reject);
    outgoing.end(body);
  });
}

async function post(data: string, path: string): Promise<string> {
  const body = await readStdin();
  const endpoint = await endpointOf(data);
  const chunks: Buffer[] = [];
  await send(endpoint, {
    method: 'POST',
    path,
    body,
    onResponse: (response) => {
      response.on('data', (chunk: Buffer) => chunks.push(chunk));
    },
  });
  return Buffer.concat(chunks).toString('utf8');
}

async function runHook(data: string): Promise<void> {
  stdout.write(await post(data, LINK_PATHS.hooks));
}

async function runDiscarding(data: string, path: string): Promise<void> {
  await post(data, path);
}

async function streamOnce(endpoint: Endpoint, session: string, poll = false): Promise<void> {
  const path = `${LINK_PATHS.stream}?session=${encodeURIComponent(session)}${poll ? '&poll=1' : ''}`;
  await send(endpoint, {
    method: 'GET',
    path,
    body: null,
    onResponse: (response) => {
      response.on('data', (chunk: Buffer) => {
        const text = chunk.toString('utf8');
        if (text.trim() !== '') {
          stdout.write(text);
        }
      });
    },
  });
}

async function runStream(data: string, session: string): Promise<void> {
  let wait = RECONNECT_FIRST_MS;
  for (;;) {
    try {
      await streamOnce(await endpointOf(data), session);
      wait = RECONNECT_FIRST_MS;
    } catch (cause) {
      stderr.write(
        `smarteverything link: stream ${cause instanceof Error ? cause.message : 'failed'}\n`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, wait));
    wait = Math.min(wait * 2, RECONNECT_LAST_MS);
  }
}

async function runFloor(data: string): Promise<void> {
  try {
    stdout.write(await post(data, LINK_PATHS.floor));
  } catch (cause) {
    stderr.write(
      `smarteverything link: floor ${cause instanceof Error ? cause.message : 'failed'}\n`,
    );
    stdout.write(JSON.stringify(floorDenied()));
  }
}

async function runHeaders(data: string, remote: boolean): Promise<void> {
  const token = remote
    ? (await readFile(join(data, 'claude', 'mcp.token'), 'utf8')).trim()
    : await tokenOf(data);
  stdout.write(JSON.stringify({ Authorization: `Bearer ${token}` }));
}

async function streamCommand(
  command: string,
  data: string,
  session: string | undefined,
): Promise<void> {
  if (session === undefined) throw new HelperError('--session <id> is required');
  if (command === 'poll') await streamOnce(await endpointOf(data), session, true);
  else await runStream(data, session);
}

async function main(): Promise<void> {
  const { positionals, values } = parseArgs({
    args: argv.slice(2),
    allowPositionals: true,
    options: { data: { type: 'string' }, session: { type: 'string' } },
  });
  const [command] = positionals;
  const data = values.data;
  if (data === undefined) {
    throw new HelperError('--data <folder> is required');
  }
  if (command === 'hook') {
    await runHook(data);
  } else if (command === 'observe') {
    await runDiscarding(data, LINK_PATHS.observed);
  } else if (command === 'floor') {
    await runFloor(data);
  } else if (command === 'headers' || command === 'mcp-headers') {
    await runHeaders(data, command === 'mcp-headers');
  } else if (command === 'report') {
    await runDiscarding(data, LINK_PATHS.reports);
  } else if (command === 'poll' || command === 'stream') {
    await streamCommand(command, data, values.session);
  } else {
    throw new HelperError('use hook, observe, floor, report, headers or stream --session <id>');
  }
}

main().catch((cause: unknown) => {
  stderr.write(`smarteverything link: ${cause instanceof Error ? cause.message : 'failed'}\n`);
  process.exitCode = 1;
});
