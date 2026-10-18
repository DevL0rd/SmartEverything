import { createServer } from 'node:http';
import os from 'node:os';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  HUB_IDENTITY_PATH,
  NATIVE_HUB_ROUTE_CONFIGURATION,
  type NativeHubRouteConfiguration,
} from '@smarteverything/domain';
import { NodeRouteAuthority } from '../../src/client-network/route-authority';
import { NodeRouteStore } from '../../src/client-network/route-store';
import { streamHubFetch } from '../../src/client-network/stream-fetch';
import type { NetworkEventBus } from '../../src/client-network/route-events';
import { mdnsEmitter } from '../../src/network/mdns';
import { advertiseHub } from '../../src/network/mdns-advertise';
import { MemoryNetwork } from '../support/memory-mdns';
import { testLogger } from '../support/logs';
import { nextText } from '../support/stream';

const closers: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  vi.unstubAllGlobals();
  for (const close of closers.splice(0)) await close();
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
      endpoints: [{ kind: 'loopback', url: origin }],
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
  readonly signal: (body: unknown[]) => void;
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
    signal: (body): void => {
      for (const listener of listeners) listener(body, 'org.freedesktop.NetworkManager');
    },
  };
}
async function directory(configuration: NativeHubRouteConfiguration): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), 'hub-route-'));
  closers.push(() => rm(path, { recursive: true, force: true }));
  await new NodeRouteStore(path, TOKEN).write(configuration);
  return path;
}

describe('node route authority', () => {
  it('keeps in-flight work, the lease and the endpoint through a network change', async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const server = createServer((request, response) => {
      if (request.url === HUB_IDENTITY_PATH) {
        response.end(JSON.stringify({ service: 'smarteverything', identity: IDENTITY }));
        return;
      }
      response.writeHead(200);
      response.write('first,');
      gate.then(
        () => {
          response.end('second');
        },
        (cause: unknown) => {
          throw cause;
        },
      );
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    closers.push(() => {
      server.closeAllConnections();
      server.close();
    });
    const address = server.address();
    if (address === null || typeof address === 'string') throw new Error('no port');
    const origin = `http://127.0.0.1:${String(address.port)}`;
    const events = fakeBus();
    const authority = new NodeRouteAuthority({
      hubUrl: origin,
      deviceId: DEVICE,
      token: TOKEN,
      directory: await directory(configurationFor(origin)),
      log: testLogger('node-route'),
      bus: events.bus,
      mdns: new MemoryNetwork().host('192.0.2.10'),
    });
    closers.push(() => authority.stop());
    await authority.start();
    expect(authority.state.endpoint?.url).toBe(origin);

    const endpoints: (string | undefined)[] = [];
    authority.observe(() => {
      endpoints.push(authority.state.endpoint?.url);
    });
    const url = `${origin}/stream`;
    const lease = authority.lease(url);
    const response = await streamHubFetch(new Request(url), {
      ...lease,
      signal: lease.signal,
    });
    const reader = response.body?.getReader();
    if (reader === undefined) throw new Error('no body');
    expect(await nextText(reader)).toBe('first,');

    events.signal([
      'org.freedesktop.NetworkManager.Device',
      { State: { signature: 'u', value: 100 } },
      [],
    ]);
    await vi.waitFor(() => {
      expect(authority.state.networkGeneration).toBe(1);
    });
    await authority.refresh();

    expect(endpoints).not.toContain(undefined);
    expect(authority.state.endpoint?.url).toBe(origin);
    expect(lease.signal.aborted).toBe(false);
    release();
    expect(await nextText(reader)).toBe('second');
  });
});

describe('node route discovery', () => {
  it('asks the network again whenever no enrolled LAN endpoint answers and learns the new address', async () => {
    const hubServer = createServer((request, response) => {
      response.end(
        request.url === HUB_IDENTITY_PATH
          ? JSON.stringify({ service: 'smarteverything', identity: IDENTITY })
          : '',
      );
    });
    await new Promise<void>((resolve) => hubServer.listen(0, '127.0.0.1', resolve));
    closers.push(() => {
      hubServer.closeAllConnections();
      hubServer.close();
    });
    const bound = hubServer.address();
    if (bound === null || typeof bound === 'string') throw new Error('no port');
    const origin = `http://127.0.0.1:${String(bound.port)}`;
    vi.spyOn(os, 'networkInterfaces').mockReturnValue({
      eth0: [
        {
          address: '192.0.2.1',
          netmask: '255.255.255.0',
          family: 'IPv4',
          mac: 'aa:bb:cc:dd:ee:ff',
          internal: false,
          cidr: '192.0.2.1/24',
        },
      ],
    });
    closers.push(() => {
      vi.restoreAllMocks();
    });
    const network = new MemoryNetwork();
    const observer = network.host('192.0.2.50')(() => undefined);
    closers.push(() => observer.close());
    let queries = 0;
    mdnsEmitter(observer.bonjour).on('query', () => {
      queries += 1;
    });
    const authority = new NodeRouteAuthority({
      hubUrl: origin,
      deviceId: DEVICE,
      token: TOKEN,
      directory: await directory(configurationFor(origin)),
      log: testLogger('node-route'),
      bus: fakeBus().bus,
      mdns: network.host('192.0.2.2'),
    });
    closers.push(() => authority.stop());
    await authority.start();
    await vi.waitFor(() => {
      expect(queries).toBeGreaterThan(0);
    });
    await new Promise((resolve) => setTimeout(resolve, 3300));
    const before = queries;
    authority.failed(authority.state.routeGeneration);
    await vi.waitFor(() => {
      expect(queries).toBeGreaterThan(before);
    });
    closers.push(
      advertiseHub({
        identity: IDENTITY,
        listener: { address: '0.0.0.0', family: 'IPv4', port: 8443 },
        log: testLogger('node-route'),
        changed: () => undefined,
        mdns: network.host('192.0.2.1'),
      }),
    );
    await vi.waitFor(() => {
      expect(authority.view.trust?.endpoints.map((endpoint) => endpoint.url)).toContain(
        'https://192.0.2.1:8443',
      );
    });
  });
});

describe('node enrollment bootstrap', () => {
  const origin = 'https://127.0.0.1:1';
  async function started(answer: Response): Promise<{
    readonly authority: NodeRouteAuthority;
    readonly store: NodeRouteStore;
    readonly lease: ReturnType<NodeRouteAuthority['lease']>;
  }> {
    const configuration = configurationFor(origin);
    const path = await directory(configuration);
    vi.stubGlobal('fetch', () => Promise.resolve(answer));
    const authority = new NodeRouteAuthority({
      hubUrl: origin,
      deviceId: DEVICE,
      token: TOKEN,
      directory: path,
      log: testLogger('node-route'),
      bus: fakeBus().bus,
      mdns: new MemoryNetwork().host('192.0.2.10'),
    });
    closers.push(() => authority.stop());
    const lease = authority.lease(`${origin}/api/anything`);
    await authority.start();
    return { authority, store: new NodeRouteStore(path, TOKEN), lease };
  }

  it('withdraws the stored route only when the hub confirms the node is revoked', async () => {
    const { authority, store, lease } = await started(
      Response.json(
        { error: { code: 'unauthorized', message: 'No paired node has this token.' } },
        { status: 401 },
      ),
    );
    expect(authority.view.trust).toBeNull();
    expect(await store.read()).toBeNull();
    expect(lease.signal.aborted).toBe(true);
  });

  it('keeps the stored route when a refusal is not a confirmed revocation', async () => {
    const { authority, store, lease } = await started(
      new Response('<html>starting</html>', { status: 401 }),
    );
    expect(authority.view.trust).not.toBeNull();
    expect(await store.read()).not.toBeNull();
    expect(lease.signal.aborted).toBe(false);
  });
});
