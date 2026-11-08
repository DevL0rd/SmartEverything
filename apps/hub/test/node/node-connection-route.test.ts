import { once } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import WebSocket, { WebSocketServer } from 'ws';
import type { NodeHubTransport } from '../../src/client-network/node-transport';
import type { NodeRouteState } from '../../src/client-network/route-authority';
import { NodeConnection } from '../../src/node/node-connection';
import { captureLogs, testLogger, type CapturedLogs } from '../support/logs';

let hub: WebSocketServer;
let connection: NodeConnection;
let origin: string;
let logs: CapturedLogs;
const served: WebSocket[] = [];

beforeEach(async () => {
  logs = captureLogs();
  served.length = 0;
  hub = new WebSocketServer({ port: 0, host: '127.0.0.1' });
  hub.on('connection', (socket: WebSocket) => {
    served.push(socket);
  });
  await once(hub, 'listening');
  const address = hub.address();
  if (address === null || typeof address !== 'object') throw new Error('expected a port');
  origin = `http://127.0.0.1:${String(address.port)}`;
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date', 'performance'] });
});

afterEach(() => {
  connection.stop();
  for (const socket of served) socket.terminate();
  hub.close();
  vi.useRealTimers();
});

function routedConnection(): {
  readonly refresh: ReturnType<typeof vi.fn<() => Promise<void>>>;
  readonly route: (ready: boolean, notify?: boolean) => void;
} {
  let ready = true;
  const listeners = new Set<(state: NodeRouteState) => void>();
  const refresh = vi.fn(() => Promise.resolve());
  const transport: NodeHubTransport = {
    fetch,
    byteStream: () => Promise.reject(new Error('not used')),
    settled: () => Promise.resolve(),
    refresh,
    ready: () => ready,
    socket: (url, protocols, options) => new WebSocket(url, protocols, options),
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
  connection = new NodeConnection({
    hubUrl: origin,
    path: '/socket',
    protocol: 'route-test',
    token: 'token',
    transport,
    log: testLogger('node'),
    failure: 'node.connection_failed',
    opened: (): void => {
      connection.welcomed();
      connection.healthy();
    },
    message: (): void => undefined,
    closed: (): void => undefined,
  });
  return {
    refresh,
    route: (next, notify = true): void => {
      ready = next;
      if (!notify) return;
      const state: NodeRouteState = {
        endpoint: ready ? { kind: 'remote', url: origin } : null,
        routeGeneration: 1,
        networkGeneration: 0,
        localSupported: true,
        detail: 'test route',
      };
      for (const listener of listeners) listener(state);
    },
  };
}

async function reached(count: number): Promise<void> {
  await vi.waitFor(() => {
    expect(served).toHaveLength(count);
    expect(connection.socket?.readyState).toBe(WebSocket.OPEN);
  });
}

describe('node connection route recovery', () => {
  it('reconnects after an outage even when no new route event arrives', async () => {
    const routing = routedConnection();
    connection.start();
    await reached(1);
    routing.route(false);
    await vi.advanceTimersByTimeAsync(1000);
    expect(routing.refresh).toHaveBeenCalledTimes(1);
    expect(served).toHaveLength(1);
    routing.refresh.mockImplementationOnce(() => {
      routing.route(true, false);
      return Promise.resolve();
    });
    await vi.advanceTimersByTimeAsync(2000);
    await reached(2);
    expect(logs.events()).toContain('node.connect_deferred');
  });

  it('recovers when started while no enrolled endpoint is reachable', async () => {
    const routing = routedConnection();
    routing.route(false, false);
    routing.refresh.mockImplementationOnce(() => {
      routing.route(true, false);
      return Promise.resolve();
    });
    connection.start();
    expect(served).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1000);
    await reached(1);
  });

  it('does not duplicate a connection when refresh publishes a restored route', async () => {
    const routing = routedConnection();
    routing.route(false, false);
    routing.refresh.mockImplementationOnce(() => {
      routing.route(true);
      return Promise.resolve();
    });
    connection.start();
    await vi.advanceTimersByTimeAsync(1000);
    await reached(1);
    await vi.advanceTimersByTimeAsync(5000);
    expect(served).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(1);
  });

  it('keeps the existing backoff after a route refresh error', async () => {
    const routing = routedConnection();
    routing.route(false, false);
    routing.refresh.mockRejectedValueOnce(new Error('probe failed'));
    routing.refresh.mockImplementationOnce(() => {
      routing.route(true, false);
      return Promise.resolve();
    });
    connection.start();
    await vi.advanceTimersByTimeAsync(1000);
    expect(logs.events()).toContain('node.route_refresh_failed');
    await vi.advanceTimersByTimeAsync(1999);
    expect(routing.refresh).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await reached(1);
  });

  it('does not open a socket when stopped during route refresh', async () => {
    const routing = routedConnection();
    let release: () => void = () => undefined;
    routing.route(false, false);
    routing.refresh.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    connection.start();
    await vi.advanceTimersByTimeAsync(1000);
    connection.stop();
    routing.route(true, false);
    release();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(served).toHaveLength(0);
    expect(vi.getTimerCount()).toBe(0);
  });
});
