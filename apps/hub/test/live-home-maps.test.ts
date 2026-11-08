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

const MESSAGE = z.looseObject({
  type: z.string(),
  table: z.string().optional(),
  tables: z.array(z.string()).optional(),
  record: z.looseObject({}).nullable().optional(),
});

const SUMMARY = {
  id: 'home',
  revision: 3,
  name: 'Home',
  floors: 2,
  updatedAt: '2026-10-25T10:00:00.000Z',
};

const ROOM = { id: '3b9c1d52-7a40-4e1f-8c26-5d1e0f2a9b73', name: 'Study', position: 0 };

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
      startedAt: '2026-10-25T10:00:00.000Z',
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

interface Listener {
  readonly changes: () => readonly string[];
  readonly confirmed: () => readonly string[];
}

async function listener(tables: readonly string[]): Promise<Listener> {
  const token = createClientToken();
  test.store.clients.create({
    name: 'Phone',
    platform: 'android',
    role: 'member',
    tokenHash: hashClientToken(token),
  });
  const socket = new WebSocket(`ws://127.0.0.1:${String(port)}/live`, [...liveProtocols(token)]);
  sockets.push(socket);
  const changes: string[] = [];
  let confirmed: readonly string[] | null = null;
  socket.on('message', (data: Buffer) => {
    const message = MESSAGE.parse(JSON.parse(data.toString('utf8')));
    if (message.type === 'subscribed') confirmed = message.tables ?? [];
    if (message.type === 'change' && message.table !== undefined) changes.push(message.table);
  });
  await once(socket, 'open');
  socket.send(JSON.stringify({ type: 'subscribe', tables, streams: [] }));
  await until(() => confirmed !== null, 'the subscription to be confirmed');
  return { changes: () => changes, confirmed: () => confirmed ?? [] };
}

function publishMap(): void {
  test.store.feed.emit({
    type: 'change',
    table: 'home_maps',
    operation: 'UPDATE',
    record: SUMMARY,
    oldRecord: { ...SUMMARY, revision: 2 },
  });
}

function publishRoom(): void {
  test.store.feed.emit({
    type: 'change',
    table: 'rooms',
    operation: 'INSERT',
    record: ROOM,
    oldRecord: null,
  });
}

describe('the home map summary on the live stream', () => {
  it('reaches a connection that subscribed to home_maps, as the summary row', async () => {
    const watcher = await listener(['home_maps']);
    expect(watcher.confirmed()).toStrictEqual(['home_maps']);
    publishMap();
    await until(() => watcher.changes().includes('home_maps'), 'the map summary to arrive');
  });

  it('never reaches a connection that did not subscribe to home_maps, such as an older app', async () => {
    const older = await listener(['rooms']);
    const silent = await listener([]);
    const watcher = await listener(['home_maps', 'rooms']);
    publishMap();
    publishRoom();
    await until(() => older.changes().includes('rooms'), 'the later room change to arrive');
    await until(() => watcher.changes().includes('rooms'), 'the later room change to arrive');
    expect(watcher.changes()).toStrictEqual(['home_maps', 'rooms']);
    expect(older.changes()).toStrictEqual(['rooms']);
    expect(silent.changes()).toStrictEqual([]);
  });

  it('is dropped from a subscription that names it next to unknown tables only when unknown', async () => {
    const mixed = await listener(['home_maps', 'tables_from_a_newer_app']);
    expect(mixed.confirmed()).toStrictEqual(['home_maps']);
  });
});
