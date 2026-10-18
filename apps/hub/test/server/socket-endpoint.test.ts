import { createServer, type Server } from 'node:http';
import {
  ApiError,
  BEARER_PROTOCOL_PREFIX,
  TalkFrameError,
  createClientToken,
  hashClientToken,
} from '@smarteverything/domain';
import WebSocket, { WebSocketServer, type RawData } from 'ws';
import { z } from 'zod';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CameraSockets } from '../../src/server/camera-socket';
import {
  SocketEndpoint,
  type SocketPeer,
  type SocketSession,
} from '../../src/server/socket-endpoint';
import { captureLogs, testLogger, type CapturedLogs } from '../support/logs';
import { testStore, type TestStore } from '../support/store';
import { pause, until } from '../support/wait';

const PROTOCOL = 'test.v1';
const MESSAGE = z.strictObject({ type: z.literal('hello') });
type Message = z.infer<typeof MESSAGE>;

interface Bench {
  readonly seen: Message[];
  readonly frames: Buffer[];
  readonly peers: SocketPeer[];
  closed: number;
  fail: boolean;
}

let test: TestStore;
let logs: CapturedLogs;
let token: string;
let server: Server;
let endpoint: SocketEndpoint<Message>;
let bench: Bench;
let heartbeatMs: number;
let base: string;
const sockets: WebSocket[] = [];

function session(peer: SocketPeer): SocketSession<Message> {
  bench.peers.push(peer);
  return {
    message: (message): void => {
      bench.seen.push(message);
    },
    frame: (frame): void => {
      if (bench.fail) {
        throw new TalkFrameError('not a frame');
      }
      bench.frames.push(frame);
    },
    closed: (): void => {
      bench.closed += 1;
    },
  };
}

function textOf(data: RawData): string {
  return new TextDecoder().decode(Array.isArray(data) ? Buffer.concat(data) : data);
}

async function listen(target: Server): Promise<string> {
  await new Promise<void>((resolve) => {
    target.listen(0, '127.0.0.1', resolve);
  });
  const address = target.address();
  if (address === null || typeof address === 'string') {
    throw new Error('The test server did not get a TCP port.');
  }
  return `ws://127.0.0.1:${String(address.port)}`;
}

async function connect(options: WebSocket.ClientOptions = {}): Promise<WebSocket> {
  const socket = new WebSocket(base, [PROTOCOL, `${BEARER_PROTOCOL_PREFIX}${token}`], options);
  sockets.push(socket);
  await new Promise<void>((resolve, reject) => {
    socket.once('open', resolve);
    socket.once('error', reject);
  });
  return socket;
}

async function start(): Promise<void> {
  endpoint = new SocketEndpoint({
    name: 'test',
    store: test.store,
    protocol: PROTOCOL,
    path: '/test',
    heartbeatMs,
    schema: MESSAGE,
    log: testLogger('socket'),
    open: session,
  });
  server.on('upgrade', (request, socket, head) => {
    try {
      endpoint.upgrade(request, socket, head);
    } catch (cause) {
      if (!(cause instanceof ApiError)) {
        throw cause;
      }
      socket.end('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');
    }
  });
  base = await listen(server);
}

function audioFrame(index: number): Buffer {
  return Buffer.from([1, index % 256]);
}

describe('socket endpoint', () => {
  beforeEach(async () => {
    logs = captureLogs();
    test = await testStore();
    token = createClientToken();
    test.store.clients.create(
      { name: 'Pixel', platform: 'android', role: 'owner', tokenHash: hashClientToken(token) },
      true,
    );
    bench = { seen: [], frames: [], peers: [], closed: 0, fail: false };
    heartbeatMs = 60_000;
    server = createServer();
  });

  afterEach(async () => {
    sockets.forEach((socket) => {
      socket.terminate();
    });
    sockets.length = 0;
    endpoint.stop();
    server.close();
    await test.close();
  });

  it('keeps the socket open through a burst of 200 frames and delivers all of them', async () => {
    await start();
    const socket = await connect();
    for (let index = 0; index < 200; index += 1) {
      socket.send(audioFrame(index));
    }
    await until(() => bench.frames.length === 200, 'all frames');
    expect(socket.readyState).toBe(WebSocket.OPEN);
    expect(bench.closed).toBe(0);
  });

  it('ignores a message type it does not know and keeps delivering known ones', async () => {
    await start();
    const socket = await connect();
    socket.send(JSON.stringify({ type: 'future' }));
    socket.send('not json');
    socket.send(JSON.stringify({ type: 'hello' }));
    await until(() => bench.seen.length === 1, 'the known message');
    expect(socket.readyState).toBe(WebSocket.OPEN);
    expect(logs.events().filter((event) => event === 'test.ignored')).toHaveLength(1);
  });

  it('ignores a malformed frame without closing', async () => {
    await start();
    const socket = await connect();
    bench.fail = true;
    socket.send(audioFrame(0));
    socket.send(audioFrame(1));
    await until(() => logs.events().includes('test.ignored'), 'the ignored frame');
    bench.fail = false;
    socket.send(audioFrame(2));
    await until(() => bench.frames.length === 1, 'the next good frame');
    expect(socket.readyState).toBe(WebSocket.OPEN);
    expect(logs.events().filter((event) => event === 'test.ignored')).toHaveLength(1);
  });

  it('refuses an upgrade without the device token', async () => {
    await start();
    const socket = new WebSocket(base, [PROTOCOL]);
    sockets.push(socket);
    const failure = await new Promise<Error>((resolve) => {
      socket.once('error', resolve);
    });
    expect(failure).toBeInstanceOf(Error);
    expect(bench.peers).toHaveLength(0);
  });

  it('drops frames for a slow client but keeps it connected and keeps sending text', async () => {
    await start();
    const socket = await connect();
    const received: RawData[] = [];
    const texts: string[] = [];
    socket.on('message', (data, binary) => {
      if (binary) {
        received.push(data);
      } else {
        texts.push(textOf(data));
      }
    });
    await until(() => bench.peers.length === 1, 'the peer');
    const peer = bench.peers[0];
    const big = Buffer.alloc(64 * 1024, 7);
    socket.pause();
    const sent = 1000;
    for (let index = 0; index < sent; index += 1) {
      peer?.frame(big);
    }
    peer?.text({ type: 'done' });
    expect(logs.events().filter((event) => event === 'test.client_too_slow')).toHaveLength(1);
    socket.resume();
    await until(() => texts.length === 1, 'the text after the frames');
    expect(received.length).toBeGreaterThan(0);
    expect(received.length).toBeLessThan(sent);
    expect(socket.readyState).toBe(WebSocket.OPEN);
  });

  it('ends a connection that stops answering pings', async () => {
    heartbeatMs = 20;
    await start();
    const quiet = await connect({ autoPong: false });
    const closed = new Promise<void>((resolve) => {
      quiet.once('close', () => {
        resolve();
      });
    });
    await closed;
    await until(() => bench.closed === 1, 'the session to close');
  });

  it('keeps a connection that answers pings', async () => {
    heartbeatMs = 20;
    await start();
    const socket = await connect();
    await pause(150);
    expect(socket.readyState).toBe(WebSocket.OPEN);
  });

  it('closes a peer with the given code', async () => {
    await start();
    const socket = await connect();
    const closed = new Promise<number>((resolve) => {
      socket.once('close', (code) => {
        resolve(code);
      });
    });
    await until(() => endpoint.peers().length === 1, 'the peer');
    endpoint.peers()[0]?.close(4001, 'token withdrawn');
    expect(await closed).toBe(4001);
    await until(() => endpoint.peers().length === 0, 'the peer to go');
    expect(bench.closed).toBe(1);
  });
});

describe('camera relay', () => {
  let upstream: Server;
  let relayServer: Server;
  let cameras: CameraSockets;

  beforeEach(() => {
    upstream = createServer();
    relayServer = createServer();
    cameras = new CameraSockets(testLogger('streams'));
  });

  afterEach(() => {
    cameras.stop();
    relayServer.close();
    upstream.close();
  });

  it('sends a message that arrived before the upstream opened as text', async () => {
    const upstreamSockets = new WebSocketServer({ noServer: true });
    upstream.on('upgrade', (request, socket, head) => {
      setTimeout(() => {
        upstreamSockets.handleUpgrade(request, socket, head, (ws) => {
          upstreamSockets.emit('connection', ws);
        });
      }, 80);
    });
    const received: { text: string; binary: boolean }[] = [];
    upstreamSockets.on('connection', (ws) => {
      ws.on('message', (data, binary) => {
        received.push({ text: textOf(data), binary });
      });
    });
    const upstreamUrl = await listen(upstream);
    relayServer.on('upgrade', (request, socket, head) => {
      cameras.relay(request, socket, head, { url: upstreamUrl, authorization: 'Bearer x' });
    });
    const relayUrl = await listen(relayServer);
    const client = new WebSocket(relayUrl);
    sockets.push(client);
    await new Promise<void>((resolve) => {
      client.once('open', resolve);
    });
    client.send(JSON.stringify({ type: 'mse' }));
    await until(() => received.length === 1, 'the first message upstream');
    expect(received[0]).toEqual({ text: '{"type":"mse"}', binary: false });
    upstreamSockets.close();
  });
});
