import { afterEach, describe, expect, it, vi } from 'vitest';

type Handler = (event: unknown, value: unknown) => unknown;
interface Sent {
  readonly window: number;
  readonly channel: string;
  readonly state: unknown;
}
const shared = vi.hoisted(() => ({
  handlers: new Map<string, Handler>(),
  sent: new Array<Sent>(),
  network: { emit: (_state: unknown): void => undefined, stops: 0 },
  discovery: { emit: (_state: unknown): void => undefined, stops: 0 },
}));

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, handler: Handler): void => {
      shared.handlers.set(channel, handler);
    },
    removeHandler: (channel: string): void => {
      shared.handlers.delete(channel);
    },
  },
}));

vi.mock('../src/hub-network/network.js', () => ({
  HubNetworkChanges: class {
    constructor(emit: (state: unknown) => void) {
      shared.network.emit = emit;
    }
    start(): Promise<unknown> {
      return Promise.resolve({ generation: 1, state: 'watching', detail: '' });
    }
    stop(): void {
      shared.network.stops += 1;
    }
  },
}));

vi.mock('../src/hub-network/discovery.js', () => ({
  HubDiscovery: class {
    constructor(emit: (state: unknown) => void) {
      shared.discovery.emit = emit;
    }
    start(): unknown {
      return { generation: 1, state: 'searching', detail: '', candidates: [] };
    }
    stop(): void {
      shared.discovery.stops += 1;
    }
  },
}));

const { registerHubNetworkIpc } = await import('../src/hub-network/ipc.js');

const START_URL = 'app://smarteverything/';
const closers: (() => void)[] = [];

afterEach(() => {
  for (const close of closers.splice(0)) close();
  shared.sent.length = 0;
  shared.network.stops = 0;
  shared.discovery.stops = 0;
});

function openWindow(id: number): {
  readonly invoke: (channel: string) => Promise<unknown>;
  readonly destroy: () => void;
} {
  const destroyed: (() => void)[] = [];
  const frame = { url: START_URL };
  const contents = {
    id,
    mainFrame: frame,
    isDestroyed: (): boolean => false,
    getURL: (): string => START_URL,
    send: (channel: string, state: unknown): void => {
      shared.sent.push({ window: id, channel, state });
    },
    once: (_event: string, listener: () => void): void => {
      destroyed.push(listener);
    },
    on: (): void => undefined,
  };
  return {
    destroy: (): void => {
      for (const listener of destroyed) listener();
    },
    invoke: (channel: string): Promise<unknown> => {
      const handler = shared.handlers.get(channel);
      if (handler === undefined) throw new Error(`no handler for ${channel}`);
      return Promise.resolve(handler({ senderFrame: frame, sender: contents }, undefined));
    },
  };
}

async function register(): Promise<void> {
  const registration = await registerHubNetworkIpc(START_URL, false);
  closers.push(registration.close);
}

function windowsReceiving(channel: string): number[] {
  return shared.sent.filter((item) => item.channel === channel).map((item) => item.window);
}

describe('hub network events with several windows', () => {
  it('delivers a network change to every watching window and stops watching with the last one', async () => {
    await register();
    const first = openWindow(1);
    const second = openWindow(2);
    await first.invoke('desktop:hub-network-start');
    await second.invoke('desktop:hub-network-start');
    shared.network.emit({ generation: 2, state: 'watching', detail: 'Network changed' });
    expect(windowsReceiving('desktop:hub-network')).toStrictEqual([1, 2]);
    first.destroy();
    expect(shared.network.stops).toBe(0);
    second.destroy();
    expect(shared.network.stops).toBe(1);
  });

  it('delivers discovery to every searching window and keeps it running for the others', async () => {
    await register();
    const first = openWindow(1);
    const second = openWindow(2);
    await first.invoke('desktop:hub-discovery-start');
    await second.invoke('desktop:hub-discovery-start');
    shared.discovery.emit({ generation: 1, state: 'searching', detail: '', candidates: [] });
    expect(windowsReceiving('desktop:hub-discovery')).toStrictEqual([1, 2]);
    const stopsBefore = shared.discovery.stops;
    first.destroy();
    expect(shared.discovery.stops).toBe(stopsBefore);
    second.destroy();
    expect(shared.discovery.stops).toBe(stopsBefore + 1);
  });
});
