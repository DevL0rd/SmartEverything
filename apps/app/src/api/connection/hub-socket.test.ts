import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NativeHubSocketEvent, NativeHubSocketOpen } from '@smarteverything/domain';
import type { HubRouteLease } from './active-route';

const CONNECTION = { url: 'https://hub.local:7880', token: `set_${'a'.repeat(64)}` };
const opened: NativeHubSocketOpen[] = [];
const sent: unknown[] = [];
const sockets: ((event: NativeHubSocketEvent) => void)[] = [];
const subscribers: (() => void)[] = [];
let current = true;
let network = 0;
const REMOTE = 'https://hub.example.com';

function lease(media = false): HubRouteLease {
  if (media)
    return {
      baseUrl: REMOTE,
      scopeId: 'scope',
      generation: 1,
      endpoint: { kind: 'remote', url: REMOTE },
      fetch: () => Promise.reject(new Error('unused')),
      isCurrent: (): boolean => current,
      failed: (): void => undefined,
    };
  return {
    nativeNetworkGeneration: network,
    baseUrl: CONNECTION.url,
    scopeId: 'scope',
    generation: 1,
    endpoint: { kind: 'lan', url: CONNECTION.url },
    fetch: () => Promise.reject(new Error('unused')),
    isCurrent: (): boolean => current,
    failed: (): void => undefined,
  };
}

vi.mock('expo-crypto', () => ({ randomUUID: (): string => 'socket-1' }));
vi.mock('./connection', () => ({
  connectionState: { get: (): unknown => ({ status: 'paired', connection: CONNECTION }) },
}));
vi.mock('./active-route', () => ({
  routeFor: (): unknown => ({
    scopeId: 'scope',
    ready: (): Promise<void> => Promise.resolve(),
    lease,
    state: {
      subscribe: (listener: () => void): (() => void) => {
        subscribers.push(listener);
        return () => undefined;
      },
    },
  }),
}));
let bridged = true;
const bridge = {
  subscribeSockets: (listener: (event: NativeHubSocketEvent) => void): (() => void) => {
    sockets.push(listener);
    return () => undefined;
  },
  openSocket: (request: NativeHubSocketOpen): Promise<void> => {
    opened.push(request);
    return Promise.resolve();
  },
  sendSocket: (request: unknown): Promise<void> => {
    sent.push(request);
    return Promise.resolve();
  },
  closeSocket: (): Promise<void> => Promise.resolve(),
};
vi.mock('./route-platform', () => ({
  hubNetwork: (): unknown => ({}),
  socketBridge: (): unknown => (bridged ? bridge : undefined),
}));

const { openHubSocket } = await import('./hub-socket');

beforeEach(() => {
  opened.length = 0;
  sent.length = 0;
  sockets.length = 0;
  subscribers.length = 0;
  current = true;
  bridged = true;
});

async function connected(): Promise<ReturnType<typeof openHubSocket>> {
  const socket = openHubSocket(CONNECTION, '/live', []);
  await vi.waitFor(() => {
    expect(opened).toHaveLength(1);
  });
  sockets[0]?.({ id: 'socket-1', kind: 'open', protocol: '' });
  return socket;
}

describe('a routed hub socket through the desktop bridge', () => {
  it('can send while open and keeps working when the route is reselected', async () => {
    const socket = await connected();
    expect(socket.sendable()).toBe(true);
    subscribers.forEach((listener) => {
      listener();
    });
    expect(socket.sendable()).toBe(true);
    socket.send('hello');
    expect(sent).toEqual([{ id: 'socket-1', data: 'hello' }]);
  });

  it('tells the owner it closed when its route is withdrawn, and is no longer sendable', async () => {
    const socket = await connected();
    const closes: number[] = [];
    socket.onclose = (event): void => {
      closes.push(event.code);
    };
    current = false;
    subscribers.forEach((listener) => {
      listener();
    });
    expect(socket.sendable()).toBe(false);
    expect(closes).toEqual([1001]);
  });

  it('tells the owner when the route is withdrawn before the socket opens', async () => {
    const socket = openHubSocket(CONNECTION, '/live', []);
    const closes: number[] = [];
    socket.onclose = (event): void => {
      closes.push(event.code);
    };
    await vi.waitFor(() => {
      expect(opened).toHaveLength(1);
    });
    current = false;
    sockets[0]?.({ id: 'socket-1', kind: 'open', protocol: '' });
    expect(closes).toEqual([1001]);
    expect(socket.sendable()).toBe(false);
  });

  it('delivers a native close to the owner exactly once', async () => {
    const socket = await connected();
    const closes: number[] = [];
    socket.onclose = (event): void => {
      closes.push(event.code);
    };
    sockets[0]?.({ id: 'socket-1', kind: 'close', code: 1006, reason: 'lost' });
    sockets[0]?.({ id: 'socket-1', kind: 'close', code: 1006, reason: 'lost' });
    expect(closes).toEqual([1006]);
  });
});

interface FakeRecord {
  url: string;
  protocols: string[];
  sent: unknown[];
  socket: FakeSocket;
}
const created: FakeRecord[] = [];
class FakeSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSED = 3;
  binaryType = '';
  onopen: (() => void) | null = null;
  onclose: ((event: { code: number; reason: string }) => void) | null = null;
  readonly record: FakeRecord;
  constructor(url: string, protocols: string[]) {
    this.record = { url, protocols, sent: [], socket: this };
    created.push(this.record);
  }
  send(data: unknown): void {
    this.record.sent.push(data);
  }
  close(): void {
    return undefined;
  }
}

async function platformAttempt(index: number): Promise<FakeRecord> {
  openHubSocket(CONNECTION, '/live', ['proto']);
  await vi.waitFor(() => {
    expect(created).toHaveLength(index + 1);
  });
  const record = created[index];
  if (record === undefined) throw new Error('no socket');
  return record;
}

describe('a routed hub socket that cannot open on the LAN', () => {
  it('moves to the remote endpoint after two failed opens and comes back after a network change', async () => {
    bridged = false;
    created.length = 0;
    network = 7;
    vi.stubGlobal('WebSocket', FakeSocket);
    (await platformAttempt(0)).socket.onclose?.({ code: 1006, reason: 'Trust anchor not found' });
    (await platformAttempt(1)).socket.onclose?.({ code: 1006, reason: 'Trust anchor not found' });
    const remote = await platformAttempt(2);
    expect(created.map((record) => record.url)).toEqual([
      'wss://hub.local:7880/live',
      'wss://hub.local:7880/live',
      'wss://hub.example.com/live',
    ]);
    remote.socket.onopen?.();
    expect((await platformAttempt(3)).url).toBe('wss://hub.example.com/live');
    network = 8;
    expect((await platformAttempt(4)).url).toBe('wss://hub.local:7880/live');
    vi.unstubAllGlobals();
  });
});

describe('a routed hub socket without a bridge', () => {
  it('opens the platform WebSocket on the endpoint url, which reaches the pinned hub itself', async () => {
    bridged = false;
    created.length = 0;
    network = 1;
    vi.stubGlobal('WebSocket', FakeSocket);
    const socket = openHubSocket(CONNECTION, '/live', ['proto']);
    await vi.waitFor(() => {
      expect(created).toHaveLength(1);
    });
    expect(created[0]?.url).toBe('wss://hub.local:7880/live');
    expect(created[0]?.protocols).toEqual(['proto']);
    expect(opened).toHaveLength(0);
    socket.close();
    vi.unstubAllGlobals();
  });
});
