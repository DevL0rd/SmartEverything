import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer, type Server, type Socket } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  SESSION_AGENT_FILE,
  SESSION_AGENT_REQUEST,
  type SessionAgentOperation,
} from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SocketSessionAgent } from '../../src/node/session-agent/session-agent';
import { captureLogs } from '../support/logs';
import { until } from '../support/wait';

const TOKEN = 't'.repeat(40);
const CAPTURE = {
  mimeType: 'image/jpeg',
  data: Buffer.from('jpeg').toString('base64'),
  width: 2,
  height: 1,
  at: '2026-10-18T10:00:00.000Z',
} as const;

type Handle = (operation: SessionAgentOperation, socket: Socket, id: string) => void;

let directory: string;
let server: Server | null = null;
let sockets: Socket[] = [];

function reply(socket: Socket, id: string, fields: object): void {
  socket.write(`${JSON.stringify({ type: 'reply', id, ...fields })}\n`);
}

async function listen(handle: Handle): Promise<void> {
  const socket = join(directory, 'agent.sock');
  server = createServer((connection) => {
    sockets.push(connection);
    let buffer = '';
    connection.setEncoding('utf8');
    connection.on('data', (chunk: string) => {
      buffer += chunk;
      const end = buffer.indexOf('\n');
      if (end < 0) return;
      const request = SESSION_AGENT_REQUEST.parse(JSON.parse(buffer.slice(0, end)));
      buffer = buffer.slice(end + 1);
      if (request.token !== TOKEN) {
        reply(connection, request.id, { ok: false, code: 'unauthorized', message: 'wrong token' });
        return;
      }
      handle(request.operation, connection, request.id);
    });
  });
  await new Promise<void>((resolve) => {
    server?.listen(socket, resolve);
  });
  await writeFile(
    join(directory, SESSION_AGENT_FILE),
    JSON.stringify({ socket, token: TOKEN, pid: process.pid }),
  );
}

beforeEach(async () => {
  captureLogs();
  directory = await mkdtemp(join(tmpdir(), 'session-agent-'));
});

afterEach(async () => {
  for (const socket of sockets) socket.destroy();
  sockets = [];
  await new Promise<void>((resolve) => {
    if (server === null) resolve();
    else
      server.close(() => {
        resolve();
      });
  });
  server = null;
  await rm(directory, { recursive: true, force: true });
});

describe('the session agent client', () => {
  it('is not reachable when the app wrote no address', async () => {
    await expect(new SocketSessionAgent(directory).reachable()).resolves.toBe(false);
  });

  it('is not reachable and says so when the system has no place for the address', async () => {
    const agent = new SocketSessionAgent(null);
    await expect(agent.reachable()).resolves.toBe(false);
    await expect(agent.open({ kind: 'path', path: '/tmp/a' })).rejects.toMatchObject({
      code: 'not_supported',
    });
    expect(agent.watch(() => undefined)).toBeTypeOf('function');
  });

  it('is not reachable when the address is stale', async () => {
    await writeFile(
      join(directory, SESSION_AGENT_FILE),
      JSON.stringify({ socket: join(directory, 'gone.sock'), token: TOKEN, pid: 1 }),
    );
    await expect(new SocketSessionAgent(directory).reachable()).resolves.toBe(false);
  });

  it('answers a ping with the token from the address file', async () => {
    await listen((_operation, socket, id) => {
      reply(socket, id, { ok: true, capture: null, permissions: null });
    });
    await expect(new SocketSessionAgent(directory).reachable()).resolves.toBe(true);
  });

  it('sends the open target and turns a refusal into a failure with the app message', async () => {
    const seen: SessionAgentOperation[] = [];
    await listen((operation, socket, id) => {
      seen.push(operation);
      reply(socket, id, { ok: false, code: 'failed', message: 'No application opens that.' });
    });
    await expect(
      new SocketSessionAgent(directory).open({ kind: 'url', url: 'https://example.com/a' }),
    ).rejects.toMatchObject({ code: 'failed', message: 'No application opens that.' });
    expect(seen).toEqual([{ op: 'open', target: { kind: 'url', url: 'https://example.com/a' } }]);
  });

  it('returns the picture the app captured', async () => {
    await listen((operation, socket, id) => {
      reply(socket, id, {
        ok: true,
        capture: operation.op === 'capture' ? CAPTURE : null,
        permissions: null,
      });
    });
    await expect(new SocketSessionAgent(directory).capture('screen')).resolves.toEqual(CAPTURE);
  });

  it('returns the permissions the app reports', async () => {
    const held = [{ permission: 'mac_screen_recording', granted: true }];
    await listen((_operation, socket, id) => {
      reply(socket, id, { ok: true, capture: null, permissions: held });
    });
    await expect(new SocketSessionAgent(directory).permissions()).resolves.toEqual(held);
  });

  it('fails a permissions question the app answered with nothing', async () => {
    await listen((_operation, socket, id) => {
      reply(socket, id, { ok: true, capture: null, permissions: null });
    });
    await expect(new SocketSessionAgent(directory).permissions()).rejects.toMatchObject({
      code: 'failed',
    });
  });

  it('fails a capture the app answered without a picture', async () => {
    await listen((_operation, socket, id) => {
      reply(socket, id, { ok: true, capture: null, permissions: null });
    });
    await expect(new SocketSessionAgent(directory).capture('screen')).rejects.toMatchObject({
      code: 'failed',
    });
  });

  it('keeps a ringing connection open until the app says the ring ended', async () => {
    const ringing: Socket[] = [];
    await listen((operation, socket, id) => {
      if (operation.op === 'ring' && operation.on) ringing.push(socket);
      reply(socket, id, { ok: true, capture: null, permissions: null });
    });
    const agent = new SocketSessionAgent(directory);
    let ended = 0;
    await agent.ring(true, () => {
      ended += 1;
    });
    expect(ended).toBe(0);
    ringing[0]?.write(`${JSON.stringify({ type: 'event', event: 'ring_ended' })}\n`);
    await until(() => ended === 1, 'the ring end');
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(ended).toBe(1);
  });

  it('reports the ring as ended when the app goes away mid-ring', async () => {
    const ringing: Socket[] = [];
    await listen((operation, socket, id) => {
      if (operation.op === 'ring' && operation.on) ringing.push(socket);
      reply(socket, id, { ok: true, capture: null, permissions: null });
    });
    let ended = 0;
    await new SocketSessionAgent(directory).ring(true, () => {
      ended += 1;
    });
    ringing[0]?.destroy();
    await until(() => ended === 1, 'the ring end');
  });

  it('tells watchers when an action finds the app gone and when the address changes', async () => {
    const agent = new SocketSessionAgent(directory);
    let changes = 0;
    const stop = agent.watch(() => {
      changes += 1;
    });
    await expect(agent.open({ kind: 'path', path: '/tmp/a.txt' })).rejects.toMatchObject({
      code: 'not_supported',
    });
    expect(changes).toBe(1);
    await writeFile(join(directory, SESSION_AGENT_FILE), '{}');
    await until(() => changes >= 2, 'the address change');
    stop();
  });
});
