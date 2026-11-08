import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Agent, getGlobalDispatcher, setGlobalDispatcher, type Dispatcher } from 'undici';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  HUB_IDENTITY_PATH,
  NATIVE_HUB_ROUTE_CONFIGURATION,
  NODE_CONNECTION_PATH,
  type NativeHubRouteConfiguration,
} from '@smarteverything/domain';
import { nodeHubTransport, type NodeHubTransport } from '../../src/client-network/node-transport';
import { NodeRouteAuthority } from '../../src/client-network/route-authority';
import { NodeRouteStore } from '../../src/client-network/route-store';
import { probeNodeRoute } from '../../src/client-network/route-probes';
import { streamHubFetch } from '../../src/client-network/stream-fetch';
import { relayGuestRequest } from '../../src/client-network/guest-http';
import type { NetworkEventBus } from '../../src/client-network/route-events';
import { MemoryNetwork } from '../support/memory-mdns';
import { listenRemote, remoteConnect, type RemoteHub } from '../support/remote-hub';
import { testLogger } from '../support/logs';
import { nextText } from '../support/stream';

vi.mock('@smarteverything/domain', async (original) => {
  const actual: Record<string, unknown> = await original();
  return { ...actual, HUB_STREAM_IDLE_TIMEOUT_MS: 400 };
});

const closers: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const close of closers.splice(0).reverse()) await close();
});

const DEVICE = '0f1d2c3b-4a59-4687-8d9a-0b1c2d3e4f50';
const TOKEN = 'node-token';
const KEY = 'c'.repeat(64);
const IDENTITY = {
  id: KEY,
  protocolVersion: 1,
  name: 'Test hub',
  tls: {
    serverName: `smarteverything-${'d'.repeat(32)}.local`,
    publicKeySha256: KEY,
    certificateSha256: 'e'.repeat(64),
  },
} as const;

function configurationFor(origin: string): NativeHubRouteConfiguration {
  const scopeId = `node:${DEVICE}`;
  return NATIVE_HUB_ROUTE_CONFIGURATION.parse({
    canonicalOrigin: origin,
    trust: {
      scopeId,
      identity: IDENTITY,
      endpoints: [{ kind: 'remote', url: origin }],
      lanAddresses: [],
    },
    bindings: [
      {
        scopeId,
        canonicalOrigin: origin,
        hubId: KEY,
        principalId: DEVICE,
        credentialKind: 'node',
        credentialGeneration: 0,
      },
    ],
  });
}
function fakeBus(): {
  readonly bus: () => NetworkEventBus;
  readonly signal: () => void;
} {
  const listeners: ((body: readonly unknown[], sender: string) => void)[] = [];
  const bus: NetworkEventBus = {
    call: () => Promise.resolve(['/fake']),
    watch: (_rule, listener) => {
      listeners.push(listener);
      return Promise.resolve(() => undefined);
    },
    onError: () => undefined,
    close: () => undefined,
  };
  return {
    bus: () => bus,
    signal: (): void => {
      for (const listener of listeners)
        listener(
          ['org.freedesktop.NetworkManager.Device', { State: { signature: 'u', value: 100 } }, []],
          'org.freedesktop.NetworkManager',
        );
    },
  };
}

interface Fixture {
  readonly authority: NodeRouteAuthority;
  readonly transport: NodeHubTransport;
  readonly origin: string;
  readonly server: RemoteHub['server'];
  readonly network: () => void;
  readonly bodyTimeouts: (number | null | undefined)[];
  readonly listen: () => Promise<void>;
}

async function fixture(gapMs: number): Promise<Fixture> {
  const hub = await listenRemote((request, response) => {
    if (request.url === HUB_IDENTITY_PATH) {
      response.end(JSON.stringify({ service: 'smarteverything', identity: IDENTITY }));
      return;
    }
    if (request.url === NODE_CONNECTION_PATH) {
      response.writeHead(404);
      response.end();
      return;
    }
    response.writeHead(200);
    response.write('first,');
    const timer = setTimeout(() => {
      response.end('second');
    }, gapMs);
    response.on('close', () => {
      clearTimeout(timer);
    });
  });
  const { server, port, url: origin } = hub;
  closers.push(() => {
    server.closeAllConnections();
    server.close();
  });
  const bodyTimeouts: (number | null | undefined)[] = [];
  const previous = getGlobalDispatcher();
  class Spy extends Agent {
    override dispatch(
      options: Dispatcher.DispatchOptions,
      handler: Dispatcher.DispatchHandler,
    ): boolean {
      if (
        String(options.origin) === origin &&
        !options.path.startsWith(HUB_IDENTITY_PATH) &&
        options.path !== NODE_CONNECTION_PATH
      )
        bodyTimeouts.push(options.bodyTimeout);
      return super.dispatch(options, handler);
    }
  }
  const spy = new Spy({ connect: await remoteConnect() });
  setGlobalDispatcher(spy);
  closers.push(async () => {
    setGlobalDispatcher(previous);
    await spy.destroy();
  });
  const folder = await mkdtemp(join(tmpdir(), 'hub-route-'));
  closers.push(() => rm(folder, { recursive: true, force: true }));
  const path = join(folder, 'node-route.json');
  await new NodeRouteStore(path, TOKEN).write(configurationFor(origin));
  const events = fakeBus();
  const authority = new NodeRouteAuthority({
    hubUrl: origin,
    deviceId: DEVICE,
    token: TOKEN,
    directory: path,
    log: testLogger('node-route'),
    bus: events.bus,
    mdns: new MemoryNetwork().host('192.0.2.10'),
  });
  closers.push(() => authority.stop());
  await authority.start();
  return {
    authority,
    transport: nodeHubTransport(authority, origin),
    origin,
    server,
    network: events.signal,
    bodyTimeouts,
    listen: () =>
      new Promise<void>((resolve) => {
        server.listen(port, '127.0.0.1', resolve);
      }),
  };
}

async function takeServerDown(f: Fixture): Promise<void> {
  const generation = f.authority.state.routeGeneration;
  f.server.closeAllConnections();
  await new Promise<void>((resolve) =>
    f.server.close(() => {
      resolve();
    }),
  );
  f.authority.failed(generation);
  await vi.waitFor(() => {
    expect(f.authority.state.endpoint).toBeNull();
  });
}

describe('route-bound byte streams', () => {
  it('aborts the route signal when the endpoint is replaced and not on a same-endpoint publication', async () => {
    const f = await fixture(0);
    const url = `${f.origin}/bytes`;
    const bound = f.authority.lease(url, { routeBound: true });
    const plain = f.authority.lease(url);
    const settled = f.authority.settled();
    f.network();
    await vi.waitFor(() => {
      expect(f.authority.state.networkGeneration).toBe(1);
    });
    await settled;
    await f.authority.refresh();
    expect(f.authority.state.endpoint?.url).toBe(f.origin);
    expect(bound.signal.aborted).toBe(false);

    await takeServerDown(f);
    expect(bound.signal.aborted).toBe(true);
    expect(plain.signal.aborted).toBe(false);
  });

  it('settles after the next published selection and gives up after the probe timeout', async () => {
    const f = await fixture(0);
    let resolved = false;
    const waiting = f.authority.settled().then(() => {
      resolved = true;
    });
    await Promise.resolve();
    expect(resolved).toBe(false);
    await f.authority.refresh();
    f.network();
    await waiting;
    expect(resolved).toBe(true);
    vi.useFakeTimers();
    try {
      const bounded = f.authority.settled();
      await vi.advanceTimersByTimeAsync(4001);
      await bounded;
    } finally {
      vi.useRealTimers();
    }
  });

  it('cuts an open byte stream when the endpoint is replaced and reports its generation', async () => {
    const f = await fixture(60_000);
    const { response, routeGeneration } = await f.transport.byteStream(
      new Request(`${f.origin}/bytes`),
    );
    expect(routeGeneration).toBe(f.authority.state.routeGeneration);
    const reader = response.body?.getReader();
    if (reader === undefined) throw new Error('no body');
    expect(await nextText(reader)).toBe('first,');
    await takeServerDown(f);
    await expect(reader.read()).rejects.toThrow();
  });

  it('ends a byte stream that stays silent past the idle limit', async () => {
    const f = await fixture(2500);
    const { response } = await f.transport.byteStream(new Request(`${f.origin}/bytes`));
    await expect(response.text()).rejects.toThrow();
    expect(f.bodyTimeouts).toEqual([400]);
  });

  it('refuses a byte stream for another origin or credential', async () => {
    const f = await fixture(0);
    await expect(f.transport.byteStream(new Request('http://127.0.0.1:1/x'))).rejects.toThrow(
      /canonical/,
    );
    await expect(
      f.transport.byteStream(
        new Request(`${f.origin}/x`, { headers: { authorization: 'Bearer other' } }),
      ),
    ).rejects.toThrow(/canonical/);
  });
});

describe('routed callers that stay quiet for long periods', () => {
  async function silentLongCall(
    f: Fixture,
    call: (url: string, signal: AbortSignal) => Promise<void>,
  ): Promise<AbortSignal> {
    const url = `${f.origin}/quiet`;
    const lease = f.authority.lease(url);
    await call(url, lease.signal);
    await takeServerDown(f);
    return lease.signal;
  }

  const callers: readonly {
    readonly name: string;
    readonly run: (f: Fixture, url: string, signal: AbortSignal) => Promise<void>;
  }[] = [
    {
      name: 'the harness fetchers (claude-host, runtime-hosts, harness-runtime) through transport.fetch',
      run: async (f, url): Promise<void> => {
        const response = await f.transport.fetch(url);
        await response.body?.cancel();
      },
    },
    {
      name: 'route-probes through streamHubFetch',
      run: async (f, url, signal): Promise<void> => {
        const probed = await probeNodeRoute(
          {
            policies: f.authority.policies,
            trust: configurationFor(f.origin).trust,
            log: testLogger('probe'),
          },
          { kind: 'remote', url: f.origin },
          signal,
        );
        expect(probed).toBe(true);
        const response = await streamHubFetch(new Request(url), {
          ...f.authority.lease(url),
          signal,
        });
        await response.body?.cancel();
      },
    },
    {
      name: 'relayGuestRequest',
      run: async (f, url, signal): Promise<void> => {
        const sink = createServer((_request, response) => {
          response.end();
        });
        await new Promise<void>((resolve) => sink.listen(0, '127.0.0.1', resolve));
        closers.push(() => {
          sink.closeAllConnections();
          sink.close();
        });
        const address = sink.address();
        if (address === null || typeof address === 'string') throw new Error('no port');
        const relayed = createServer((incoming, outgoing) => {
          relayGuestRequest(
            incoming,
            outgoing,
            { url, method: 'GET', headers: {} },
            { ...f.authority.lease(url), signal },
          ).catch(() => outgoing.destroy());
        });
        await new Promise<void>((resolve) => relayed.listen(0, '127.0.0.1', resolve));
        closers.push(() => {
          relayed.closeAllConnections();
          relayed.close();
        });
        const bound = relayed.address();
        if (bound === null || typeof bound === 'string') throw new Error('no port');
        const response = await fetch(`http://127.0.0.1:${String(bound.port)}/`);
        await response.body?.cancel();
      },
    },
  ];

  it.each(callers)('keeps bodyTimeout 0 and no route abort for $name', async ({ run }) => {
    const f = await fixture(0);
    const signal = await silentLongCall(f, (url, leased) => run(f, url, leased));
    expect(f.bodyTimeouts.length).toBeGreaterThan(0);
    expect(new Set(f.bodyTimeouts)).toEqual(new Set([0]));
    expect(signal.aborted).toBe(false);
  });
});
