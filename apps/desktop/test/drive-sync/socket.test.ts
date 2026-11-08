import { randomUUID } from 'node:crypto';
import { SYNC_HELLO, type SyncHubMessage } from '@smarteverything/domain/drive-sync';
import { Logger } from '@smarteverything/logging';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { WebSocketServer, type RawData, type WebSocket } from 'ws';
import {
  ChannelClosedError,
  DRIVE_SYNC_PROTOCOL,
  SyncSocket,
  type ChannelClosure,
  type SyncSocketSink,
} from '../../src/drive-sync/socket.js';
import { startFakeHub, TestTransport, until, type FakeHub, type HubPeer } from './hub-harness.js';

const log = new Logger('desktop.drive-sync');

interface Seen {
  readonly opened: string[];
  readonly messages: SyncHubMessage[];
  readonly closures: ChannelClosure[];
}

let hub: FakeHub;
let peer: HubPeer;
let transport: TestTransport;
let seen: Seen;
let sockets: SyncSocket[] = [];

function sinkOf(): SyncSocketSink {
  return {
    opened: (rootId) => seen.opened.push(rootId),
    message: (_rootId, message) => seen.messages.push(message),
    closed: (_rootId, closure) => seen.closures.push(closure),
  };
}

function open(hubUrl: string, token: string, clientId: string): SyncSocket {
  const created = new SyncSocket({ hubUrl, token, clientId, transport, sink: sinkOf(), log });
  sockets.push(created);
  return created;
}

function openOnHub(): SyncSocket {
  return open(hub.url, peer.token, peer.clientId);
}

function flush(): Promise<void> {
  return new Promise((resolve) => {
    setImmediate(resolve);
  });
}

beforeEach(async () => {
  hub = await startFakeHub();
  peer = hub.peer('Desk');
  transport = new TestTransport();
  seen = { opened: [], messages: [], closures: [] };
  sockets = [];
});

afterEach(async () => {
  for (const created of sockets) created.stop();
  transport.closeAll();
  await hub.stop();
});

describe('hello and index', () => {
  it('says hello for the root and receives the hub index', async () => {
    const socket = openOnHub();
    socket.attach({ rootId: hub.rootId, hello: () => ({ indexId: null, afterSeq: 0 }) });
    await until(() => seen.messages.some((message) => message.type === 'index' && message.last));
    expect(seen.opened).toEqual([hub.rootId]);
    expect(hub.store.driveSyncClients.find(peer.clientId, hub.rootId)?.enabled).toBe(true);
    expect(socket.isOpen(hub.rootId)).toBe(true);
  });
});

describe('client state', () => {
  it('reaches the hub and is sent again after a reconnect', async () => {
    const socket = openOnHub();
    socket.attach({ rootId: hub.rootId, hello: () => ({ indexId: null, afterSeq: 0 }) });
    await until(() => seen.opened.length === 1);
    await socket.report(hub.rootId, { need: 42, have: 1, errors: [] });
    await until(() => hub.store.driveSyncClients.find(peer.clientId, hub.rootId)?.needBytes === 42);
    hub.store.driveSyncClients.report(peer.clientId, hub.rootId, {
      lastSeq: 0,
      needBytes: 0,
      errors: [],
    });
    transport.routeChanged();
    await until(() => hub.store.driveSyncClients.find(peer.clientId, hub.rootId)?.needBytes === 42);
    expect(seen.opened).toHaveLength(2);
  });

  it('keeps the latest report for a connection that is not open yet', async () => {
    transport.readyNow = false;
    const socket = openOnHub();
    socket.attach({ rootId: hub.rootId, hello: () => ({ indexId: null, afterSeq: 0 }) });
    await socket.report(hub.rootId, { need: 7, have: 0, errors: [] });
    transport.readyNow = true;
    transport.routeChanged();
    await until(() => hub.store.driveSyncClients.find(peer.clientId, hub.rootId)?.needBytes === 7);
  });
});

describe('reconnecting', () => {
  it('reconnects with a fresh hello when the route changes', async () => {
    let hellos = 0;
    const socket = openOnHub();
    socket.attach({
      rootId: hub.rootId,
      hello: () => {
        hellos += 1;
        return { indexId: null, afterSeq: 0 };
      },
    });
    await until(() => seen.opened.length === 1);
    transport.routeChanged();
    await until(() => seen.opened.length === 2);
    expect(hellos).toBe(2);
    expect(seen.closures).toEqual([
      { code: 1001, reason: 'The route to the hub changed', refused: false },
    ]);
    expect(hub.upgrades()).toBe(2);
  });

  it('stays down after a dropped connection until a route event arrives', async () => {
    const socket = openOnHub();
    socket.attach({ rootId: hub.rootId, hello: () => ({ indexId: null, afterSeq: 0 }) });
    await until(() => seen.opened.length === 1);
    hub.dropSockets();
    await until(() => seen.closures.length === 1);
    expect(seen.closures[0]?.refused).toBe(false);
    await flush();
    await flush();
    expect(hub.upgrades()).toBe(1);
    expect(socket.isOpen(hub.rootId)).toBe(false);
    transport.routeChanged();
    await until(() => seen.opened.length === 2);
    expect(hub.upgrades()).toBe(2);
  });

  it('does not reconnect a refused channel on route events, only on an explicit reconnect', async () => {
    const socket = openOnHub();
    socket.attach({ rootId: hub.rootId, hello: () => ({ indexId: null, afterSeq: 0 }) });
    await until(() => seen.opened.length === 1);
    hub.revoke(peer.deviceId);
    await until(() => seen.closures.length === 1);
    expect(seen.closures[0]).toMatchObject({ code: 4001, refused: true });
    transport.routeChanged();
    await flush();
    expect(hub.upgrades()).toBe(1);
    socket.reconnect();
    await until(() => seen.opened.length === 2);
    expect(hub.upgrades()).toBe(2);
  });

  it('waits for the route to be ready before opening', async () => {
    transport.readyNow = false;
    const socket = openOnHub();
    socket.attach({ rootId: hub.rootId, hello: () => ({ indexId: null, afterSeq: 0 }) });
    await flush();
    expect(transport.sockets).toHaveLength(0);
    transport.readyNow = true;
    transport.routeChanged();
    await until(() => seen.opened.length === 1);
  });

  it('reports a policy refusal from the hub as refused', async () => {
    const socket = openOnHub();
    socket.attach({ rootId: randomUUID(), hello: () => ({ indexId: null, afterSeq: 0 }) });
    await until(() => seen.closures.length === 1);
    expect(seen.closures[0]).toMatchObject({ code: 1008, refused: true });
    transport.routeChanged();
    await flush();
    expect(hub.upgrades()).toBe(1);
  });
});

describe('sending', () => {
  it('rejects a send on a channel that is not open', async () => {
    const socket = openOnHub();
    await expect(
      socket.send(hub.rootId, { type: 'client_state', need: 0, have: 0, errors: [] }),
    ).rejects.toBeInstanceOf(ChannelClosedError);
    transport.readyNow = false;
    socket.attach({ rootId: hub.rootId, hello: () => ({ indexId: null, afterSeq: 0 }) });
    await expect(
      socket.send(hub.rootId, { type: 'client_state', need: 0, have: 0, errors: [] }),
    ).rejects.toBeInstanceOf(ChannelClosedError);
  });

  it('stops reporting a root once it is detached', async () => {
    const socket = openOnHub();
    socket.attach({ rootId: hub.rootId, hello: () => ({ indexId: null, afterSeq: 0 }) });
    await until(() => seen.opened.length === 1);
    socket.detach(hub.rootId);
    await flush();
    expect(seen.closures).toEqual([]);
    expect(socket.isOpen(hub.rootId)).toBe(false);
  });
});

describe('against a raw hub', () => {
  let raw: WebSocketServer;
  let received: unknown[];

  function textOf(data: RawData): string {
    if (Array.isArray(data)) return Buffer.concat(data).toString('utf8');
    if (data instanceof ArrayBuffer) return Buffer.from(data).toString('utf8');
    return data.toString('utf8');
  }

  async function listen(onConnect: (socket: WebSocket) => void): Promise<string> {
    received = [];
    raw = new WebSocketServer({
      port: 0,
      handleProtocols: (protocols): string | false =>
        protocols.has(DRIVE_SYNC_PROTOCOL) ? DRIVE_SYNC_PROTOCOL : false,
    });
    raw.on('connection', (socket) => {
      socket.on('message', (data) => received.push(JSON.parse(textOf(data))));
      onConnect(socket);
    });
    await new Promise<void>((resolve) => {
      raw.once('listening', resolve);
    });
    const address = raw.address();
    if (address === null || typeof address === 'string') throw new Error('no port');
    return `http://127.0.0.1:${String(address.port)}`;
  }

  afterEach(async () => {
    for (const client of raw.clients) client.terminate();
    await new Promise<void>((resolve) => {
      raw.close(() => {
        resolve();
      });
    });
  });

  it('opens one channel per root, each with its own hello', async () => {
    const url = await listen(() => undefined);
    const clientId = randomUUID();
    const first = randomUUID();
    const second = randomUUID();
    const indexId = randomUUID();
    const socket = open(url, 'token', clientId);
    socket.attach({ rootId: first, hello: () => ({ indexId, afterSeq: 5 }) });
    socket.attach({ rootId: second, hello: () => ({ indexId: null, afterSeq: 0 }) });
    await until(() => received.length === 2);
    const hellos = received.map((frame) => SYNC_HELLO.parse(frame));
    expect(hellos).toEqual(
      expect.arrayContaining([
        { type: 'hello', clientId, rootId: first, indexId, afterSeq: 5 },
        { type: 'hello', clientId, rootId: second, indexId: null, afterSeq: 0 },
      ]),
    );
    expect(socket.isOpen(first) && socket.isOpen(second)).toBe(true);
  });

  it('refuses a hub that sends a frame outside the protocol and does not reconnect', async () => {
    const url = await listen((socket) => {
      socket.send('this is not a sync message');
    });
    const socket = open(url, 'token', randomUUID());
    socket.attach({ rootId: randomUUID(), hello: () => ({ indexId: null, afterSeq: 0 }) });
    await until(() => seen.closures.length === 1);
    expect(seen.closures[0]).toMatchObject({ code: 1002, refused: true });
    const before = transport.sockets.length;
    transport.routeChanged();
    await flush();
    expect(transport.sockets).toHaveLength(before);
  });

  it('passes valid hub messages to the sink', async () => {
    const rootId = randomUUID();
    const url = await listen((socket) => {
      socket.send(
        JSON.stringify({ type: 'accept', opId: 'op-1', rev: 3, seq: 9 } satisfies SyncHubMessage),
      );
    });
    const socket = open(url, 'token', randomUUID());
    socket.attach({ rootId, hello: () => ({ indexId: null, afterSeq: 0 }) });
    await until(() => seen.messages.length === 1);
    expect(seen.messages[0]).toEqual({ type: 'accept', opId: 'op-1', rev: 3, seq: 9 });
  });
});
