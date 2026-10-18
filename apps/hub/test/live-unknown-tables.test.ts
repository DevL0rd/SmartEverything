import { createClientToken, hashClientToken, liveProtocols } from '@smarteverything/domain';
import type { HubStatus } from '@smarteverything/domain';
import { once } from 'node:events';
import { createServer, type Server } from 'node:http';
import WebSocket from 'ws';
import { z } from 'zod';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LiveHub } from '../src/server/live';
import { testLogger } from './support/logs';
import { testStore, type TestStore } from './support/store';
import { until } from './support/wait';

const SUBSCRIBED = z.looseObject({ type: z.literal('subscribed'), tables: z.array(z.string()) });

let test: TestStore;
let hub: LiveHub;
let http: Server;
let port = 0;
const sockets: WebSocket[] = [];

beforeEach(async () => {
  test = await testStore();
  hub = new LiveHub({
    store: test.store,
    status: (): HubStatus => ({
      version: 'test',
      startedAt: '2026-10-08T10:00:00.000Z',
      cameras: 'running',
    }),
    log: testLogger('live'),
  });
  http = createServer();
  http.on('upgrade', (request, socket, head) => {
    hub.upgrade(request, socket, head);
  });
  await new Promise<void>((resolve) => http.listen(0, '127.0.0.1', resolve));
  const address = http.address();
  port = typeof address === 'object' && address !== null ? address.port : 0;
});

afterEach(async () => {
  sockets.splice(0).forEach((socket) => {
    socket.terminate();
  });
  hub.stop();
  http.close();
  await test.close();
});

describe('a subscription naming a table this hub does not have', () => {
  it('stays connected and is confirmed for the tables the hub knows', async () => {
    const token = createClientToken();
    test.store.clients.create({
      name: 'Phone',
      platform: 'android',
      role: 'member',
      tokenHash: hashClientToken(token),
    });
    const socket = new WebSocket(`ws://127.0.0.1:${String(port)}/live`, [...liveProtocols(token)]);
    sockets.push(socket);
    const received: unknown[] = [];
    let closed = false;
    socket.on('message', (data: Buffer) => {
      received.push(JSON.parse(data.toString('utf8')));
    });
    socket.on('close', () => {
      closed = true;
    });
    await once(socket, 'open');
    socket.send(
      JSON.stringify({ type: 'subscribe', tables: ['rooms', 'from_a_newer_app'], streams: [] }),
    );
    await until(
      () => received.some((message) => SUBSCRIBED.safeParse(message).success),
      'confirmation',
    );
    const confirmed = received
      .map((message) => SUBSCRIBED.safeParse(message))
      .find((read) => read.success);
    expect(confirmed?.data.tables).toStrictEqual(['rooms']);
    expect(closed).toBe(false);
  });
});
