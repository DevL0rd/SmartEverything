import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import {
  DEFAULT_COMPUTER_AI_SETTINGS,
  NODE_AI_PROTOCOL,
  NODE_RUNTIME_FRAME,
  type ComputerRuntimeReply,
  type NodeHello,
} from '@smarteverything/domain';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WebSocketServer, type WebSocket } from 'ws';
import { NodeAiRuntime } from '../../src/node/ai-runtime';
import type { ComputerRuntimeHost } from '../../src/computers/runtime-host';
import { testLogger } from '../support/logs';

const HELLO: NodeHello = {
  machineId: 'a'.repeat(32),
  hostname: 'desk',
  os: { name: 'Linux', kernel: '7.0' },
  hardware: { vendor: null, product: null, portable: false },
  cpu: { model: 'cpu', threads: 4, hybrid: false, kinds: [] },
  memoryBytes: 1024,
  interfaces: [],
  bootedAt: '2026-10-01T00:00:00.000Z',
  features: [],
  role: 'pc',
  power: [],
  actions: [],
  permissions: [],
};

const cleanup: (() => void)[] = [];

afterEach(() => {
  for (const close of cleanup.splice(0)) close();
});

describe('a node runtime', () => {
  it('reports a thrown non-API error to the hub as upstream_failed with its message', async () => {
    const deviceId = randomUUID();
    const generation = randomUUID();
    const hub = new WebSocketServer({
      port: 0,
      host: '127.0.0.1',
      handleProtocols: (protocols): string | false =>
        protocols.has(NODE_AI_PROTOCOL) ? NODE_AI_PROTOCOL : false,
    });
    cleanup.push((): void => {
      hub.close();
    });
    await once(hub, 'listening');
    const address = hub.address();
    if (typeof address !== 'object' || address === null) throw new Error('expected a port');
    const replied = new Promise<unknown>((resolve): void => {
      hub.on('connection', (socket: WebSocket): void => {
        socket.on('message', (raw): void => {
          const frame = NODE_RUNTIME_FRAME.parse(
            JSON.parse(Buffer.isBuffer(raw) ? raw.toString() : ''),
          );
          if (frame.type === 'hello')
            socket.send(
              JSON.stringify({
                type: 'welcome',
                device_id: deviceId,
                generation,
                runtimes: [{ runtime: 'claude', settings: DEFAULT_COMPUTER_AI_SETTINGS }],
              }),
            );
          else if (frame.type === 'reply') resolve(frame);
        });
      });
    });
    const connected = new Promise<void>((resolve): void => {
      const runtime = new NodeAiRuntime({
        hubUrl: `http://127.0.0.1:${String(address.port)}`,
        token: `sen_${'a'.repeat(43)}`,
        deviceId,
        hello: HELLO,
        log: testLogger('node'),
        createComputer: (): null => null,
        createRuntimeHosts: (): Promise<[ComputerRuntimeHost]> =>
          Promise.resolve([
            {
              runtime: 'claude',
              read: (): Promise<never> => Promise.reject(new TypeError('The disk exploded.')),
              execute: (): Promise<ComputerRuntimeReply> =>
                Promise.resolve({
                  runtime: 'claude',
                  reply: { operation: 'configure', value: DEFAULT_COMPUTER_AI_SETTINGS },
                }),
              onEvent: (): (() => void) => () => undefined,
              stop: (): void => undefined,
            },
          ]),
        changed: (online): void => {
          if (online) resolve();
        },
      });
      runtime.start();
      cleanup.push((): void => {
        runtime.stop();
      });
    });
    await connected;
    const [socket] = [...hub.clients];
    socket?.send(
      JSON.stringify({
        type: 'request',
        id: randomUUID(),
        device_id: deviceId,
        generation,
        request: { runtime: 'claude', request: { operation: 'status' } },
      }),
    );

    expect(await replied).toMatchObject({
      type: 'reply',
      result: { ok: false, failure: { code: 'upstream_failed', message: 'The disk exploded.' } },
    });
  });

  it('keeps its runtime hosts across a reconnect and stops them only when it stops', async () => {
    const deviceId = randomUUID();
    const hub = new WebSocketServer({
      port: 0,
      host: '127.0.0.1',
      handleProtocols: (protocols): string | false =>
        protocols.has(NODE_AI_PROTOCOL) ? NODE_AI_PROTOCOL : false,
    });
    cleanup.push((): void => {
      hub.close();
    });
    await once(hub, 'listening');
    const address = hub.address();
    if (typeof address !== 'object' || address === null) throw new Error('expected a port');
    hub.on('connection', (socket: WebSocket): void => {
      socket.on('message', (raw): void => {
        const frame = NODE_RUNTIME_FRAME.parse(
          JSON.parse(Buffer.isBuffer(raw) ? raw.toString() : ''),
        );
        if (frame.type === 'hello')
          socket.send(
            JSON.stringify({
              type: 'welcome',
              device_id: deviceId,
              generation: randomUUID(),
              runtimes: [{ runtime: 'claude', settings: DEFAULT_COMPUTER_AI_SETTINGS }],
            }),
          );
      });
    });
    const calls = { created: 0, configured: 0, stopped: 0, subscribed: 0 };
    let online = 0;
    const runtime = new NodeAiRuntime({
      hubUrl: `http://127.0.0.1:${String(address.port)}`,
      token: `sen_${'a'.repeat(43)}`,
      deviceId,
      hello: HELLO,
      log: testLogger('node'),
      createComputer: (): null => null,
      createRuntimeHosts: (): Promise<[ComputerRuntimeHost]> => {
        calls.created += 1;
        return Promise.resolve([
          {
            runtime: 'claude',
            read: (): Promise<never> => Promise.reject(new TypeError('not used')),
            execute: (): Promise<ComputerRuntimeReply> => {
              calls.configured += 1;
              return Promise.resolve({
                runtime: 'claude',
                reply: { operation: 'configure', value: DEFAULT_COMPUTER_AI_SETTINGS },
              });
            },
            onEvent: (): (() => void) => {
              calls.subscribed += 1;
              return () => undefined;
            },
            stop: (): void => {
              calls.stopped += 1;
            },
          },
        ]);
      },
      changed: (connected): void => {
        if (connected) online += 1;
      },
    });
    cleanup.push((): void => {
      runtime.stop();
    });
    runtime.start();
    await vi.waitFor(() => {
      expect(online).toBe(1);
    });
    for (const socket of hub.clients) socket.terminate();
    await vi.waitFor(
      () => {
        expect(online).toBe(2);
      },
      { timeout: 4000 },
    );

    expect(calls).toEqual({ created: 1, configured: 2, stopped: 0, subscribed: 2 });
    runtime.stop();
    await vi.waitFor(() => {
      expect(calls.stopped).toBe(1);
    });
  });
  it('applies the stored settings before it listens to a runtime host, so no stale capabilities reach the hub', async () => {
    const deviceId = randomUUID();
    const hub = new WebSocketServer({
      port: 0,
      host: '127.0.0.1',
      handleProtocols: (protocols): string | false =>
        protocols.has(NODE_AI_PROTOCOL) ? NODE_AI_PROTOCOL : false,
    });
    cleanup.push((): void => {
      hub.close();
    });
    await once(hub, 'listening');
    const address = hub.address();
    if (typeof address !== 'object' || address === null) throw new Error('expected a port');
    hub.on('connection', (socket: WebSocket): void => {
      socket.on('message', (raw): void => {
        const frame = NODE_RUNTIME_FRAME.parse(
          JSON.parse(Buffer.isBuffer(raw) ? raw.toString() : ''),
        );
        if (frame.type === 'hello')
          socket.send(
            JSON.stringify({
              type: 'welcome',
              device_id: deviceId,
              generation: randomUUID(),
              runtimes: [{ runtime: 'claude', settings: DEFAULT_COMPUTER_AI_SETTINGS }],
            }),
          );
      });
    });
    const order: string[] = [];
    let online = false;
    const runtime = new NodeAiRuntime({
      hubUrl: `http://127.0.0.1:${String(address.port)}`,
      token: `sen_${'a'.repeat(43)}`,
      deviceId,
      hello: HELLO,
      log: testLogger('node'),
      createComputer: (): null => null,
      createRuntimeHosts: (): Promise<[ComputerRuntimeHost]> =>
        Promise.resolve([
          {
            runtime: 'claude',
            read: (): Promise<never> => Promise.reject(new TypeError('not used')),
            execute: (): Promise<ComputerRuntimeReply> => {
              order.push('configure');
              return Promise.resolve({
                runtime: 'claude',
                reply: { operation: 'configure', value: DEFAULT_COMPUTER_AI_SETTINGS },
              });
            },
            onEvent: (): (() => void) => {
              order.push('listen');
              return () => undefined;
            },
            stop: (): void => undefined,
          },
        ]),
      changed: (connected): void => {
        online = connected;
      },
    });
    cleanup.push((): void => {
      runtime.stop();
    });
    runtime.start();
    await vi.waitFor(() => {
      expect(online).toBe(true);
    });

    expect(order).toEqual(['configure', 'listen']);
  });
  it('keeps taking new mutations past its receipt window and replays only the recent ones', async () => {
    const deviceId = randomUUID();
    const generation = randomUUID();
    const hub = new WebSocketServer({
      port: 0,
      host: '127.0.0.1',
      handleProtocols: (protocols): string | false =>
        protocols.has(NODE_AI_PROTOCOL) ? NODE_AI_PROTOCOL : false,
    });
    cleanup.push((): void => {
      hub.close();
    });
    await once(hub, 'listening');
    const address = hub.address();
    if (typeof address !== 'object' || address === null) throw new Error('expected a port');
    const replies = new Map<string, boolean>();
    hub.on('connection', (socket: WebSocket): void => {
      socket.on('message', (raw): void => {
        const frame = NODE_RUNTIME_FRAME.parse(
          JSON.parse(Buffer.isBuffer(raw) ? raw.toString() : ''),
        );
        if (frame.type === 'hello')
          socket.send(
            JSON.stringify({
              type: 'welcome',
              device_id: deviceId,
              generation,
              runtimes: [{ runtime: 'claude', settings: DEFAULT_COMPUTER_AI_SETTINGS }],
            }),
          );
        else if (frame.type === 'reply') replies.set(frame.id, frame.result.ok);
      });
    });
    let executed = 0;
    const runtime = new NodeAiRuntime({
      hubUrl: `http://127.0.0.1:${String(address.port)}`,
      token: `sen_${'a'.repeat(43)}`,
      deviceId,
      hello: HELLO,
      log: testLogger('node'),
      createComputer: (): null => null,
      createRuntimeHosts: (): Promise<[ComputerRuntimeHost]> =>
        Promise.resolve([
          {
            runtime: 'claude',
            read: (): Promise<never> => Promise.reject(new TypeError('not used')),
            execute: (): Promise<ComputerRuntimeReply> => {
              executed += 1;
              return Promise.resolve({
                runtime: 'claude',
                reply: { operation: 'configure', value: DEFAULT_COMPUTER_AI_SETTINGS },
              });
            },
            onEvent: (): (() => void) => () => undefined,
            stop: (): void => undefined,
          },
        ]),
      changed: (): void => undefined,
    });
    cleanup.push((): void => {
      runtime.stop();
    });
    runtime.start();
    await vi.waitFor(() => {
      expect(hub.clients.size).toBe(1);
      expect(executed).toBe(1);
    });
    const [socket] = [...hub.clients];
    const ids = Array.from({ length: 10_050 }, () => randomUUID());
    const send = (id: string): void => {
      socket?.send(
        JSON.stringify({
          type: 'request',
          id,
          device_id: deviceId,
          generation,
          request: {
            runtime: 'claude',
            request: { operation: 'configure', settings: DEFAULT_COMPUTER_AI_SETTINGS },
          },
        }),
      );
    };
    ids.forEach(send);
    await vi.waitFor(
      () => {
        expect(replies.size).toBe(ids.length);
      },
      { timeout: 20_000 },
    );
    expect([...replies.values()].every(Boolean)).toBe(true);
    const afterAll = executed;

    send(ids.at(-1) ?? '');
    send(ids[0] ?? '');
    await vi.waitFor(() => {
      expect(executed).toBe(afterAll + 1);
    });
  });
});
