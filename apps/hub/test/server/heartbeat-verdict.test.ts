import { once } from 'node:events';
import { createServer } from 'node:http';
import { Worker } from 'node:worker_threads';
import {
  BEARER_PROTOCOL_PREFIX,
  createClientToken,
  hashClientToken,
} from '@smarteverything/domain';
import WebSocket, { WebSocketServer } from 'ws';
import { z } from 'zod';
import { afterEach, describe, expect, it } from 'vitest';
import { answersPing } from '../../src/server/live-reach';
import { SocketEndpoint } from '../../src/server/socket-endpoint';
import { pingWhenOpen } from '../../src/network/guarded-socket';
import { testLogger } from '../support/logs';
import { testStore } from '../support/store';

const PROBE_MS = 100;

const ANSWERING_CLIENT = `
const { parentPort, workerData } = require('node:worker_threads');
const WebSocket = require('ws');
const socket = new WebSocket(workerData.url, workerData.protocols);
socket.on('open', () => parentPort.postMessage('open'));
socket.on('error', () => parentPort.postMessage('error'));
`;

const BUSY_CLIENT = `
const { parentPort, workerData } = require('node:worker_threads');
const WebSocket = require('ws');
const socket = new WebSocket(workerData.url, workerData.protocols, { autoPong: false });
socket.on('open', () => parentPort.postMessage('open'));
socket.on('ping', () => {
  socket.send(JSON.stringify({ type: 'hello' }));
  setTimeout(() => socket.pong(), workerData.pongAfterMs);
});
`;

const servers: { close: () => unknown }[] = [];
const workers: Worker[] = [];

afterEach(async () => {
  await Promise.all(workers.splice(0).map((worker) => worker.terminate()));
  servers.splice(0).forEach((server) => {
    server.close();
  });
});

function stallEventLoop(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function answeringClient(
  url: string,
  protocols: readonly string[],
  code = ANSWERING_CLIENT,
): Promise<unknown> {
  const worker = new Worker(code, {
    eval: true,
    workerData: { url, protocols, pongAfterMs: PROBE_MS / 5 },
  });
  workers.push(worker);
  return once(worker, 'message');
}

async function hubSideOfAnsweringClient(): Promise<WebSocket> {
  const server = new WebSocketServer({ port: 0, host: '127.0.0.1' });
  servers.push(server);
  await once(server, 'listening');
  const address = server.address();
  const port = typeof address === 'object' && address !== null ? address.port : 0;
  const arrived = once(server, 'connection');
  const [accepted] = await Promise.all([
    arrived,
    answeringClient(`ws://127.0.0.1:${String(port)}`, []),
  ]);
  const hub: unknown = accepted[0];
  if (!(hub instanceof WebSocket)) throw new Error('the hub side is not a WebSocket');
  return hub;
}

describe('judging a ping after the hub itself was stalled', () => {
  it('counts an answer that arrived while the hub could not read it', async () => {
    const hub = await hubSideOfAnsweringClient();
    const answered = answersPing(hub, PROBE_MS);
    stallEventLoop(PROBE_MS * 4);
    expect(await answered).toBe(true);
    expect(hub.readyState).toBe(WebSocket.OPEN);
  });
});

describe('keeping peers through a hub stall longer than the heartbeat', () => {
  it('keeps a peer whose pong arrived while the hub was busy past the next beat', async () => {
    const test = await testStore();
    const token = createClientToken();
    test.store.clients.create(
      { name: 'Pixel', platform: 'android', role: 'owner', tokenHash: hashClientToken(token) },
      true,
    );
    const closed: string[] = [];
    const stalls: number[] = [];
    const endpoint = new SocketEndpoint({
      name: 'stall',
      store: test.store,
      protocol: 'stall.v1',
      path: '/stall',
      heartbeatMs: PROBE_MS,
      schema: z.strictObject({ type: z.literal('hello') }),
      log: testLogger('socket'),
      open: () => ({
        message: (): void => {
          if (stalls.length > 0) return;
          stalls.push(PROBE_MS * 3);
          stallEventLoop(PROBE_MS * 3);
        },
        frame: (): void => undefined,
        closed: (): void => {
          closed.push('peer');
        },
      }),
    });
    const http = createServer();
    servers.push(http, { close: () => { endpoint.stop(); } });
    http.on('upgrade', (request, socket, head) => {
      endpoint.upgrade(request, socket, head);
    });
    http.listen(0, '127.0.0.1');
    await once(http, 'listening');
    const address = http.address();
    const port = typeof address === 'object' && address !== null ? address.port : 0;
    await answeringClient(
      `ws://127.0.0.1:${String(port)}`,
      ['stall.v1', `${BEARER_PROTOCOL_PREFIX}${token}`],
      BUSY_CLIENT,
    );
    await new Promise((resolve) => setTimeout(resolve, PROBE_MS * 6));
    expect(stalls).toHaveLength(1);
    expect(closed).toEqual([]);
    expect(endpoint.peers()).toHaveLength(1);
  });
});

describe('pinging a socket that is not open', () => {
  it('skips a socket that is still connecting instead of throwing', () => {
    const failures: Error[] = [];
    const connecting = new WebSocket('ws://127.0.0.1:9');
    connecting.on('error', (cause) => {
      failures.push(cause);
    });
    expect(connecting.readyState).toBe(WebSocket.CONNECTING);
    expect(pingWhenOpen(connecting)).toBe(false);
    connecting.terminate();
    expect(failures).toEqual([]);
  });
});
