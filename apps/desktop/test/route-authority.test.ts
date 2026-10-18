import { once } from 'node:events';
import { createServer, type Server } from 'node:http';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  HUB_IDENTITY_PATH,
  NATIVE_HUB_ROUTE_CONFIGURATION,
  type HubEndpoint,
  type NativeHubRouteConfiguration,
  type NativeHubRouteSnapshot,
  type NativeHubTrust,
} from '@smarteverything/domain';
import {
  issueCertificate,
  listenPinned,
  newKey,
  newServerName,
  trustFor,
  type HubCertificate,
  type PinnedHub,
} from '../../hub/test/support/pinned-hub';
import {
  DesktopRouteAuthority,
  preferredRoute,
  routeCandidates,
} from '../src/hub-network/authority.js';

const SCOPE = 'desktop';
const closers: (() => Promise<void>)[] = [];

afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

interface Counted {
  readonly url: string;
  readonly identityRequests: () => number;
}

async function nearbyHub(
  certificate: HubCertificate,
  trust: () => NativeHubTrust,
): Promise<PinnedHub & Counted> {
  let requests = 0;
  const hub = await listenPinned(certificate, (request, response) => {
    if (request.url === HUB_IDENTITY_PATH) requests += 1;
    response.end(JSON.stringify({ service: 'smarteverything', identity: trust().identity }));
  });
  closers.push(hub.close);
  return { ...hub, identityRequests: () => requests };
}

async function homeServer(trust: () => NativeHubTrust): Promise<Server & Counted> {
  let requests = 0;
  const server = createServer((request, response) => {
    if (request.url === HUB_IDENTITY_PATH) requests += 1;
    response.end(JSON.stringify({ service: 'smarteverything', identity: trust().identity }));
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  closers.push(async () => {
    server.closeAllConnections();
    server.close();
    await once(server, 'close');
  });
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('no port');
  return Object.assign(server, {
    url: `http://127.0.0.1:${String(address.port)}`,
    identityRequests: () => requests,
  });
}

async function deadPort(): Promise<number> {
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('no port');
  server.close();
  await once(server, 'close');
  return address.port;
}

function configuration(
  base: NativeHubTrust,
  endpoints: readonly HubEndpoint[],
  canonicalOrigin: string,
): NativeHubRouteConfiguration {
  return NATIVE_HUB_ROUTE_CONFIGURATION.parse({
    canonicalOrigin,
    trust: { ...base, scopeId: SCOPE, endpoints },
    bindings: [
      {
        scopeId: SCOPE,
        canonicalOrigin,
        hubId: base.identity.id,
        principalId: 'principal',
        credentialKind: 'client',
        credentialGeneration: 0,
      },
    ],
  });
}

async function fixture(): Promise<{
  readonly authority: DesktopRouteAuthority;
  readonly emitted: NativeHubRouteSnapshot[];
  readonly nearby: PinnedHub & Counted;
  readonly home: Server & Counted;
  readonly configuration: NativeHubRouteConfiguration;
}> {
  const emitted: NativeHubRouteSnapshot[] = [];
  const authority = new DesktopRouteAuthority((state) => {
    emitted.push(state);
  });
  closers.push(() => {
    authority.close();
    return Promise.resolve();
  });
  const trustRef: { current: NativeHubTrust | null } = { current: null };
  const read = (): NativeHubTrust => {
    if (trustRef.current === null) throw new Error('trust is not ready');
    return trustRef.current;
  };
  const certificate = await issueCertificate(newKey(), newServerName());
  const nearby = await nearbyHub(certificate, read);
  const home = await homeServer(read);
  const trust = trustFor(certificate, nearby.port, SCOPE);
  trustRef.current = trust;
  const nearbyEndpoint: HubEndpoint = { kind: 'lan', url: nearby.url };
  const homeEndpoint: HubEndpoint = { kind: 'loopback', url: home.url };
  return {
    authority,
    emitted,
    nearby,
    home,
    configuration: configuration(trust, [nearbyEndpoint, homeEndpoint], home.url),
  };
}

function last(emitted: readonly NativeHubRouteSnapshot[]): NativeHubRouteSnapshot | undefined {
  return emitted.at(-1);
}

describe('preferredRoute', () => {
  const near: HubEndpoint = { kind: 'lan', url: 'https://10.0.0.5:8788' };
  const home: HubEndpoint = { kind: 'remote', url: 'https://home.example' };

  it('waits for a nearer address that is still being asked when a route is already in use', () => {
    const probes = [
      { endpoint: near, outcome: 'pending' as const },
      { endpoint: home, outcome: 'ok' as const },
    ];
    expect(preferredRoute(probes, false)).toBeNull();
  });

  it('uses the first answer straight away when there is no route yet', () => {
    const probes = [
      { endpoint: near, outcome: 'pending' as const },
      { endpoint: home, outcome: 'ok' as const },
    ];
    expect(preferredRoute(probes, true)).toBe(home);
  });

  it('moves to the nearer address as soon as it answers', () => {
    const probes = [
      { endpoint: near, outcome: 'ok' as const },
      { endpoint: home, outcome: 'ok' as const },
    ];
    expect(preferredRoute(probes, false)).toBe(near);
  });

  it('settles on the home address once the nearer one has failed', () => {
    const probes = [
      { endpoint: near, outcome: 'failed' as const },
      { endpoint: home, outcome: 'ok' as const },
    ];
    expect(preferredRoute(probes, false)).toBe(home);
  });
});

describe('routeCandidates', () => {
  it('asks every nearby address, newest first, then the home address only', async () => {
    const trust = trustFor(await issueCertificate(newKey(), newServerName()), 8788, SCOPE);
    const lan = (host: string): HubEndpoint => ({ kind: 'lan', url: `https://${host}:8788` });
    const home: HubEndpoint = { kind: 'remote', url: 'https://home.example' };
    const other: HubEndpoint = { kind: 'remote', url: 'https://other.example' };
    const endpoints = [
      lan('10.0.0.1'),
      lan('10.0.0.2'),
      lan('10.0.0.3'),
      lan('10.0.0.4'),
      lan('smarteverything-0123456789abcdef0123456789abcdef.local'),
      other,
      home,
    ];
    const candidates = routeCandidates(configuration(trust, endpoints, home.url));
    expect(candidates.map((endpoint) => endpoint.url)).toStrictEqual([
      'https://10.0.0.4:8788',
      'https://10.0.0.3:8788',
      'https://10.0.0.2:8788',
      'https://10.0.0.1:8788',
      'https://home.example',
    ]);
  });
});

describe('desktop route authority', () => {
  it('chooses the nearby address that answers over the pinned connection', async () => {
    const { authority, emitted, nearby, configuration: config } = await fixture();
    expect(authority.configure(config).readiness).toBe('pending');
    await vi.waitFor(() => {
      expect(last(emitted)).toMatchObject({
        readiness: 'ready',
        endpoint: { kind: 'lan', url: nearby.url },
      });
    });
    const lease = authority.lease(SCOPE, `${nearby.url}/api/devices`);
    expect(lease.url.hostname).toMatch(/^smarteverything-[0-9a-f]{32}\.local$/);
    expect(lease.dispatcher).toBeDefined();
  });

  it('falls back to the home address when nothing nearby answers', async () => {
    const { authority, emitted, home, configuration: config } = await fixture();
    const unreachable: HubEndpoint = {
      kind: 'lan',
      url: `https://127.0.0.1:${String(await deadPort())}`,
    };
    const endpoints = [unreachable, ...config.trust.endpoints.filter((e) => e.kind !== 'lan')];
    authority.configure({ ...config, trust: { ...config.trust, endpoints } });
    await vi.waitFor(() => {
      expect(last(emitted)).toMatchObject({ readiness: 'ready', endpoint: { url: home.url } });
    });
  });

  it('says so when no address answers', async () => {
    const { authority, emitted, configuration: config } = await fixture();
    const dead = `http://127.0.0.1:${String(await deadPort())}`;
    authority.configure({
      ...config,
      canonicalOrigin: dead,
      trust: { ...config.trust, endpoints: [{ kind: 'loopback', url: dead }] },
      bindings: config.bindings.map((binding) => ({ ...binding, canonicalOrigin: dead })),
    });
    await vi.waitFor(() => {
      expect(last(emitted)).toMatchObject({
        readiness: 'unavailable',
        detail: 'No enrolled hub endpoint is reachable.',
      });
    });
  });

  it('keeps the route and the lease through a network change and asks again', async () => {
    const { authority, emitted, nearby, configuration: config } = await fixture();
    authority.configure(config);
    await vi.waitFor(() => {
      expect(last(emitted)?.readiness).toBe('ready');
    });
    const lease = authority.lease(SCOPE, `${nearby.url}/api/devices`);
    const asked = nearby.identityRequests();
    authority.networkChanged();
    expect(authority.state(SCOPE)).toMatchObject({ readiness: 'ready', networkGeneration: 1 });
    await vi.waitFor(() => {
      expect(nearby.identityRequests()).toBeGreaterThan(asked);
    });
    expect(lease.signal.aborted).toBe(false);
    expect(authority.state(SCOPE).readiness).toBe('ready');
  });

  it('answers a refresh only after the rerun it queued has finished', async () => {
    const { authority, nearby, configuration: config } = await fixture();
    authority.configure(config);
    const snapshot = await authority.refresh(SCOPE);
    expect(snapshot.readiness).toBe('ready');
    expect(nearby.identityRequests()).toBeGreaterThanOrEqual(2);
  });

  it('asks again after a failure on the current route and ignores one from an old route', async () => {
    const { authority, emitted, nearby, configuration: config } = await fixture();
    authority.configure(config);
    await vi.waitFor(() => {
      expect(last(emitted)?.readiness).toBe('ready');
    });
    const generation = authority.state(SCOPE).routeGeneration;
    const asked = nearby.identityRequests();
    authority.failed(SCOPE, generation + 5);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(nearby.identityRequests()).toBe(asked);
    authority.failed(SCOPE, generation);
    await vi.waitFor(() => {
      expect(nearby.identityRequests()).toBeGreaterThan(asked);
    });
  });

  it('puts a media link for the home address onto the chosen route', async () => {
    const { authority, emitted, nearby, configuration: config } = await fixture();
    const pending = authority.configure(config);
    expect(pending.readiness).toBe('pending');
    expect(() => authority.resourceLease(SCOPE, 'http://home.example/api/media/1?token=a')).toThrow(
      'not reachable',
    );
    await vi.waitFor(() => {
      expect(last(emitted)?.readiness).toBe('ready');
    });
    const lease = authority.resourceLease(SCOPE, 'http://home.example/api/media/1?token=a');
    expect(lease.url.port).toBe(new URL(nearby.url).port);
    expect(lease.url.pathname + lease.url.search).toBe('/api/media/1?token=a');
  });

  it('stops work for a scope that was withdrawn', async () => {
    const { authority, emitted, nearby, configuration: config } = await fixture();
    authority.configure(config);
    await vi.waitFor(() => {
      expect(last(emitted)?.readiness).toBe('ready');
    });
    const lease = authority.lease(SCOPE, `${nearby.url}/api/devices`);
    authority.clear(SCOPE);
    expect(lease.signal.aborted).toBe(true);
    expect(() => authority.state(SCOPE)).toThrow('not configured');
  });

  it('stops work and starts over when the hub is a different one', async () => {
    const { authority, emitted, nearby, configuration: config } = await fixture();
    authority.configure(config);
    await vi.waitFor(() => {
      expect(last(emitted)?.readiness).toBe('ready');
    });
    const lease = authority.lease(SCOPE, `${nearby.url}/api/devices`);
    const other = trustFor(await issueCertificate(newKey(), newServerName()), 1, SCOPE);
    const replaced = authority.configure({
      ...config,
      trust: { ...config.trust, identity: other.identity },
      bindings: config.bindings.map((binding) => ({ ...binding, hubId: other.identity.id })),
    });
    expect(lease.signal.aborted).toBe(true);
    expect(replaced).toMatchObject({ readiness: 'pending', hubId: other.identity.id });
  });
});
