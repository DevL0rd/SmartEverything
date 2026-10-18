import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  HubConnectionMetadata,
  HubEndpoint,
  NativeHubRouteAuthority,
  NativeHubRouteConfiguration,
  NativeHubRouteSnapshot,
} from '@smarteverything/domain';
import type { HubRouteLease, HubRouteState, RouteHost } from './active-route';

const ID = 'a'.repeat(64);
const NAME = `smarteverything-${'b'.repeat(32)}.local`;
const LAN: HubEndpoint = { kind: 'lan', url: 'https://192.168.1.20:7880' };
const MOVED: HubEndpoint = { kind: 'lan', url: 'https://192.168.1.77:7880' };
const METADATA: HubConnectionMetadata = {
  identity: {
    id: ID,
    protocolVersion: 1,
    name: 'Home',
    tls: { serverName: NAME, certificateSha256: 'c'.repeat(64), publicKeySha256: ID },
  },
  endpoints: [LAN],
  remoteAvailable: false,
  discovery: { state: 'disabled', detail: '' },
};

const order: string[] = [];
let activation: Promise<void> = Promise.resolve();
const listeners: ((state: NativeHubRouteSnapshot) => void)[] = [];
const configurations: NativeHubRouteConfiguration[] = [];

function snapshot(routeGeneration: number, endpoint: HubEndpoint): NativeHubRouteSnapshot {
  return {
    scopeId: 'scope',
    canonicalOrigin: 'https://192.168.1.20:7880',
    hubId: ID,
    routeGeneration,
    networkGeneration: 1,
    detail: '',
    readiness: 'ready',
    endpoint,
  };
}

const authority: NativeHubRouteAuthority = {
  configure: (configuration) => {
    order.push('configure');
    configurations.push(configuration);
    return Promise.resolve(snapshot(configurations.length, LAN));
  },
  clear: () => Promise.resolve(),
  refresh: () => {
    order.push('refresh');
    return Promise.resolve(snapshot(1, LAN));
  },
  state: () => Promise.resolve(snapshot(1, LAN)),
  subscribe: (listener) => {
    listeners.push(listener);
    return () => undefined;
  },
};

vi.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  digestStringAsync: (): Promise<string> => Promise.resolve('d'.repeat(64)),
}));
vi.mock('./route-platform', () => ({
  hubNetwork: (): unknown => ({
    capabilities: { http: true, websocket: true, media: false, routeAuthority: true },
    routeAuthority: authority,
  }),
  nativeServerActivated: (): Promise<void> => activation.then(() => void order.push('activated')),
  pinnedFetch: (): Promise<Response> => Promise.resolve(new Response('{}')),
}));

const { nativeRouteFacade } = await import('./native-route-facade');

function host(): { host: RouteHost; state: () => HubRouteState; connected: HubEndpoint[] } {
  let state: HubRouteState = {
    endpoint: LAN,
    generation: 0,
    metadata: null,
    discovery: null,
    problem: null,
  };
  const connected: HubEndpoint[] = [];
  const value: RouteHost = {
    connection: { url: LAN.url, token: `set_${'d'.repeat(64)}`, canonicalKind: 'lan' },
    scopeId: 'scope',
    canonical: LAN,
    current: (): HubRouteState => state,
    publish: (update): void => {
      state = { ...state, ...update };
    },
    metadata: (): Promise<HubConnectionMetadata> => Promise.resolve(METADATA),
    connected: (endpoint): void => {
      connected.push(endpoint);
    },
    lease: (endpoint, isCurrent, failed): HubRouteLease => ({
      baseUrl: endpoint.url,
      scopeId: 'scope',
      generation: state.generation,
      endpoint,
      fetch: () => Promise.reject(new Error('unused')),
      isCurrent,
      failed,
    }),
  };
  return { host: value, state: () => state, connected };
}

beforeEach(() => {
  order.length = 0;
  listeners.length = 0;
  configurations.length = 0;
  activation = Promise.resolve();
});

describe('the native route authority', () => {
  it('waits for the native enrollment to be activated before configuring it', async () => {
    let release: () => void = () => undefined;
    activation = new Promise<void>((resolve) => {
      release = resolve;
    });
    const facade = nativeRouteFacade(host().host);
    const ready = facade?.ready();
    await Promise.resolve();
    expect(order).toEqual([]);
    release();
    await ready;
    expect(order).toEqual(['activated', 'configure']);
  });

  it('keeps leases and the last endpoint through a new route generation or a pause', async () => {
    const { host: h, state, connected } = host();
    const facade = nativeRouteFacade(h);
    facade?.start();
    await facade?.ready();
    const lease = facade?.lease();
    expect(connected).toEqual([LAN]);
    listeners[0]?.({ ...snapshot(2, MOVED) });
    expect(state().endpoint).toEqual(MOVED);
    listeners[0]?.({
      scopeId: 'scope',
      canonicalOrigin: 'https://192.168.1.20:7880',
      hubId: ID,
      routeGeneration: 3,
      networkGeneration: 2,
      detail: 'Switching network',
      readiness: 'pending',
    });
    expect(state().endpoint).toEqual(MOVED);
    expect(lease?.isCurrent()).toBe(true);
    facade?.stop();
    expect(lease?.isCurrent()).toBe(false);
  });

  it('applies a refreshed address list without ending existing leases', async () => {
    const { host: h } = host();
    const facade = nativeRouteFacade(h);
    await facade?.ready();
    const lease = facade?.lease();
    facade?.update({ ...METADATA, endpoints: [MOVED] });
    await vi.waitFor(() => {
      expect(configurations).toHaveLength(2);
    });
    expect(configurations[1]?.trust.endpoints).toEqual([MOVED]);
    expect(lease?.isCurrent()).toBe(true);
  });

  it('asks the native authority to probe again when a direct request or socket on a lease fails', async () => {
    const facade = nativeRouteFacade(host().host);
    await facade?.ready();
    order.length = 0;
    facade?.lease().failed();
    await Promise.resolve();
    expect(order).toEqual(['refresh']);
  });
});
