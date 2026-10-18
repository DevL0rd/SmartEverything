import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { WebSocketServer, type WebSocket } from 'ws';
import { z } from 'zod';
import {
  HARNESS_RUNTIME_RECEIPT,
  NODE_HARNESS_PROTOCOL,
  type HarnessRuntimeReceipt,
} from '@smarteverything/domain';
import { NodeHarnessRuntime } from '../../src/node/harness-runtime';
import { freePort, temporaryDirectory } from '../support/server';
import { testLogger } from '../support/logs';

interface FakeHarness {
  readonly hello: { readonly type: 'harness_hello'; readonly marker: string };
  readonly execute: Mock<(id: string) => Promise<HarnessRuntimeReceipt>>;
  readonly stop: Mock<() => Promise<void>>;
  readonly reconnectSubscriptions: Mock<() => Promise<void>>;
  readonly lose: Mock<() => Promise<void>>;
  readonly configure: Mock<() => Promise<void>>;
}

const fake = vi.hoisted(() => ({ harnesses: new Array<FakeHarness>() }));

vi.mock('@smarteverything/harness/process', async (importOriginal) => {
  const original = await importOriginal<Record<string, unknown>>();
  return {
    ...original,
    createComputerHarness: vi.fn((): Promise<FakeHarness> => {
      const harness: FakeHarness = {
        hello: { type: 'harness_hello', marker: String(fake.harnesses.length) },
        execute: vi.fn(),
        stop: vi.fn(() => Promise.resolve()),
        reconnectSubscriptions: vi.fn(() => Promise.resolve()),
        lose: vi.fn(() => Promise.resolve()),
        configure: vi.fn(() => Promise.resolve()),
      };
      fake.harnesses.push(harness);
      return Promise.resolve(harness);
    }),
  };
});

const FRAME = z.looseObject({ type: z.string() });
const CONNECT = z.looseObject({
  type: z.literal('harness_connect'),
  device_id: z.uuid(),
  runtime_instance: z.uuid(),
});
const SESSION = 'session-1';

interface Hub {
  readonly port: number;
  readonly frames: z.infer<typeof FRAME>[];
  readonly sockets: WebSocket[];
  readonly settings: { generation: string; hold: boolean; device: string };
  readonly welcome: () => void;
  readonly send: (frame: unknown) => void;
  readonly close: () => Promise<void>;
}

async function startHub(): Promise<Hub> {
  const port = await freePort();
  const server = new WebSocketServer({
    port,
    host: '127.0.0.1',
    handleProtocols: (protocols): string | false =>
      protocols.has(NODE_HARNESS_PROTOCOL) ? NODE_HARNESS_PROTOCOL : false,
  });
  const frames: z.infer<typeof FRAME>[] = [];
  const sockets: WebSocket[] = [];
  const settings = { generation: randomUUID(), hold: false, device: '' };
  let waiting: z.infer<typeof CONNECT> | null = null;
  const welcomeNow = (connect: z.infer<typeof CONNECT>): void => {
    sockets.at(-1)?.send(
      JSON.stringify({
        type: 'harness_welcome',
        protocol: 1,
        device_id: settings.device,
        generation: settings.generation,
        runtime_instance: connect.runtime_instance,
      }),
    );
  };
  server.on('connection', (socket) => {
    sockets.push(socket);
    socket.on('message', (raw: Buffer) => {
      const frame = FRAME.parse(JSON.parse(raw.toString('utf8')));
      frames.push(frame);
      if (frame.type !== 'harness_connect') return;
      const connect = CONNECT.parse(frame);
      settings.device = connect.device_id;
      if (settings.hold) waiting = connect;
      else welcomeNow(connect);
    });
  });
  return {
    port,
    frames,
    sockets,
    settings,
    welcome: (): void => {
      if (waiting !== null) welcomeNow(waiting);
      waiting = null;
    },
    send: (frame): void => {
      sockets.at(-1)?.send(typeof frame === 'string' ? frame : JSON.stringify(frame));
    },
    close: (): Promise<void> =>
      new Promise((resolve) => {
        for (const socket of sockets) socket.terminate();
        server.close(() => {
          resolve();
        });
      }),
  };
}

let hub: Hub;
let runtime: NodeHarnessRuntime;
let directory: { path: string; remove: () => Promise<void> };

beforeEach(async () => {
  fake.harnesses.length = 0;
  directory = await temporaryDirectory();
  hub = await startHub();
  runtime = new NodeHarnessRuntime({
    node: {
      hub_url: `http://127.0.0.1:${String(hub.port)}`,
      node_token: `sen_${'a'.repeat(43)}`,
      device_id: randomUUID(),
    },
    dataDirectory: directory.path,
    machineId: 'a'.repeat(32),
    name: 'desk',
    log: testLogger('node'),
  });
});

afterEach(async () => {
  await runtime.stop();
  await hub.close();
  await directory.remove();
});

function count(type: string): number {
  return hub.frames.filter((frame) => frame.type === type).length;
}

function control(id: string): unknown {
  return {
    type: 'harness_request',
    device_id: hub.settings.device,
    generation: hub.settings.generation,
    runtime_instance: instanceOfLastConnect(),
    id,
    request: { kind: 'interrupt', session_id: SESSION, expected_epoch: 1 },
  };
}

function instanceOfLastConnect(): string {
  return CONNECT.parse(hub.frames.findLast((frame) => frame.type === 'harness_connect'))
    .runtime_instance;
}

function receipt(id: string): HarnessRuntimeReceipt {
  return HARNESS_RUNTIME_RECEIPT.parse({
    operation_id: id,
    session_id: SESSION,
    epoch: 1,
    state: 'completed',
    durable_seq: -1,
  });
}

const WAIT = { timeout: 8000 };

describe('a computer harness runtime that outlives its socket', () => {
  it('keeps its harness and its runtime instance when the hub socket drops and returns', async () => {
    runtime.start();
    await vi.waitFor(() => {
      expect(count('harness_hello')).toBe(1);
    }, WAIT);
    const instance = instanceOfLastConnect();

    hub.sockets[0]?.terminate();

    await vi.waitFor(() => {
      expect(count('harness_hello')).toBe(2);
    }, WAIT);
    expect(instanceOfLastConnect()).toBe(instance);
    expect(fake.harnesses).toHaveLength(1);
    expect(fake.harnesses[0]?.stop).not.toHaveBeenCalled();
    expect(fake.harnesses[0]?.reconnectSubscriptions).toHaveBeenCalledTimes(2);
  });

  it('delivers a reply that finished while the socket was down once it is back', async () => {
    runtime.start();
    await vi.waitFor(() => {
      expect(count('harness_hello')).toBe(1);
    }, WAIT);
    const harness = fake.harnesses[0];
    if (harness === undefined) throw new Error('the harness was not built');
    let finish: (value: HarnessRuntimeReceipt) => void = () => undefined;
    harness.execute.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const id = randomUUID();
    hub.send(control(id));
    await vi.waitFor(() => {
      expect(harness.execute).toHaveBeenCalledTimes(1);
    }, WAIT);

    hub.settings.hold = true;
    hub.sockets[0]?.terminate();
    await vi.waitFor(() => {
      expect(count('harness_connect')).toBe(2);
    }, WAIT);
    finish(receipt(id));
    await Promise.resolve();
    expect(count('harness_reply')).toBe(0);

    hub.welcome();
    await vi.waitFor(() => {
      expect(count('harness_reply')).toBe(1);
    }, WAIT);
    expect(hub.frames.findLast((frame) => frame.type === 'harness_reply')).toMatchObject({ id });
  });

  it('runs a control that arrives with the welcome while subscriptions are still reconnecting', async () => {
    runtime.start();
    await vi.waitFor(() => {
      expect(count('harness_hello')).toBe(1);
    }, WAIT);
    const harness = fake.harnesses[0];
    if (harness === undefined) throw new Error('the harness was not built');
    const id = randomUUID();
    harness.execute.mockResolvedValue(receipt(id));
    harness.reconnectSubscriptions.mockReturnValue(new Promise(() => undefined));

    hub.settings.hold = true;
    hub.sockets[0]?.terminate();
    await vi.waitFor(() => {
      expect(count('harness_connect')).toBe(2);
    }, WAIT);
    hub.welcome();
    hub.send(control(id));

    await vi.waitFor(() => {
      expect(count('harness_reply')).toBe(1);
    }, WAIT);
    expect(hub.frames.findLast((frame) => frame.type === 'harness_reply')).toMatchObject({ id });
    expect(harness.execute).toHaveBeenCalledTimes(1);
  });

  it('builds a new harness and stops the old one when the hub names another generation', async () => {
    runtime.start();
    await vi.waitFor(() => {
      expect(count('harness_hello')).toBe(1);
    }, WAIT);

    hub.settings.generation = randomUUID();
    hub.sockets[0]?.terminate();

    await vi.waitFor(() => {
      expect(count('harness_hello')).toBe(2);
    }, WAIT);
    expect(fake.harnesses).toHaveLength(2);
    expect(fake.harnesses[0]?.stop).toHaveBeenCalledTimes(1);
    expect(fake.harnesses[1]?.stop).not.toHaveBeenCalled();
  });

  it('rejects one bad frame without dropping the socket or the harness', async () => {
    runtime.start();
    await vi.waitFor(() => {
      expect(count('harness_hello')).toBe(1);
    }, WAIT);
    const harness = fake.harnesses[0];
    if (harness === undefined) throw new Error('the harness was not built');
    const id = randomUUID();
    harness.execute.mockResolvedValue(receipt(id));

    hub.send('not json');
    hub.send({ type: 'harness_nonsense' });
    hub.send(control(id));

    await vi.waitFor(() => {
      expect(count('harness_reply')).toBe(1);
    }, WAIT);
    expect(count('harness_connect')).toBe(1);
    expect(harness.stop).not.toHaveBeenCalled();
  });
});
