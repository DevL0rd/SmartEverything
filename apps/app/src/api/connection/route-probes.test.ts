import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  HubConnectionMetadata,
  HubEndpoint,
  NativeHubDiscovery,
} from '@smarteverything/domain';
import type { HubRouteLease, HubRouteState, RouteHost } from './active-route';

const ID = 'a'.repeat(64);
const NAME = `smarteverything-${'b'.repeat(32)}.local`;
const LAN: HubEndpoint = { kind: 'lan', url: 'https://192.168.1.20:7880' };
const MOVED: HubEndpoint = { kind: 'lan', url: 'https://192.168.1.77:7880' };
const REMOTE: HubEndpoint = { kind: 'remote', url: 'https://home.example.com' };
const METADATA: HubConnectionMetadata = {
  identity: {
    id: ID,
    protocolVersion: 1,
    name: 'Home',
    tls: { serverName: NAME, certificateSha256: 'c'.repeat(64), publicKeySha256: ID },
  },
  endpoints: [LAN, REMOTE],
  remoteAvailable: true,
  discovery: { state: 'disabled', detail: '' },
};

interface Probe {
  readonly url: string;
  readonly signal: AbortSignal | null | undefined;
  readonly settle: (answer: unknown) => void;
}
const probes: Probe[] = [];
let reachable = new Set<string>();
let hang = false;
let identityOf: (url: string) => unknown = () => ({
  service: 'smarteverything',
  identity: METADATA.identity,
});
const discoveries: ((state: NativeHubDiscovery) => void)[] = [];
const started = vi.fn((): Promise<NativeHubDiscovery> =>
  Promise.resolve({ generation: 1, state: 'searching', detail: '', candidates: [] }),
);

vi.mock('./route-platform', () => ({
  hubNetwork: (): unknown => ({
    capabilities: { http: true, websocket: true, media: false },
    subscribeDiscovery: (listener: (state: NativeHubDiscovery) => void): (() => void) => {
      discoveries.push(listener);
      return () => undefined;
    },
    startDiscovery: started,
    stopDiscovery: (): Promise<void> => Promise.resolve(),
  }),
  configureRouteTrust: (): Promise<void> => Promise.resolve(),
  clearRouteTrust: (): Promise<void> => Promise.resolve(),
  deadline: (_ms: number, outer?: AbortSignal): { signal: AbortSignal; clear: () => void } => ({
    signal: outer ?? new AbortController().signal,
    clear: (): void => undefined,
  }),
  hubFetch: (
    _scope: string,
    _endpoint: HubEndpoint,
    url: string,
    init: RequestInit,
  ): Promise<Response> => {
    if (hang)
      return new Promise<Response>((resolve, reject) => {
        probes.push({
          url,
          signal: init.signal,
          settle: (answer): void => {
            resolve(Response.json(answer));
          },
        });
        init.signal?.addEventListener('abort', () => {
          reject(new Error('aborted'));
        });
      });
    const base = url.replace('/.well-known/smarteverything/identity', '');
    return reachable.has(base)
      ? Promise.resolve(Response.json(identityOf(base)))
      : Promise.reject(new Error('unreachable'));
  },
}));

const { ProbingRouteAuthority } = await import('./route-probes');

function host(): { host: RouteHost; state: () => HubRouteState; connected: HubEndpoint[] } {
  let state: HubRouteState = {
    endpoint: REMOTE,
    generation: 0,
    metadata: METADATA,
    discovery: null,
    problem: null,
  };
  const connected: HubEndpoint[] = [];
  const value: RouteHost = {
    connection: { url: REMOTE.url, token: `set_${'d'.repeat(64)}`, canonicalKind: 'remote' },
    scopeId: 'scope',
    canonical: REMOTE,
    current: (): HubRouteState => state,
    publish: (update): void => {
      state = { ...state, ...update };
    },
    metadata: (): Promise<HubConnectionMetadata> => Promise.resolve(state.metadata ?? METADATA),
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
  probes.length = 0;
  discoveries.length = 0;
  reachable = new Set();
  hang = false;
  started.mockClear();
  identityOf = (): unknown => ({ service: 'smarteverything', identity: METADATA.identity });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('the probing route authority', () => {
  it('selects the first endpoint that answers as the same hub and reports the connect', async () => {
    reachable = new Set([LAN.url]);
    const { host: h, state, connected } = host();
    const authority = new ProbingRouteAuthority(h);
    await authority.ready();
    expect(state().endpoint).toEqual(LAN);
    expect(connected).toEqual([LAN]);
  });

  it('accepts a renewed certificate on the same key and refuses another hub', async () => {
    reachable = new Set([LAN.url]);
    identityOf = (): unknown => ({
      service: 'smarteverything',
      identity: {
        ...METADATA.identity,
        tls: { ...METADATA.identity.tls, certificateSha256: 'e'.repeat(64) },
      },
    });
    const first = host();
    await new ProbingRouteAuthority(first.host).ready();
    expect(first.state().endpoint).toEqual(LAN);

    identityOf = (): unknown => ({
      service: 'smarteverything',
      identity: { ...METADATA.identity, id: 'f'.repeat(64) },
    });
    const second = host();
    await new ProbingRouteAuthority(second.host).ready();
    expect(second.state().endpoint).toEqual(REMOTE);
    expect(second.state().problem).toContain("didn't answer");
  });

  it('keeps the last endpoint when nothing answers and looks for the hub again', async () => {
    const { host: h, state } = host();
    const authority = new ProbingRouteAuthority(h);
    await authority.ready();
    expect(state().endpoint).toEqual(REMOTE);
    expect(state().problem).toContain("didn't answer");
    expect(started).toHaveBeenCalledTimes(1);
  });

  it('learns a moved address from discovery and selects it', async () => {
    reachable = new Set([MOVED.url]);
    const { host: h, state } = host();
    const authority = new ProbingRouteAuthority(h);
    authority.start();
    await authority.ready();
    discoveries[0]?.({
      generation: 2,
      state: 'searching',
      detail: '',
      candidates: [{ name: 'Home', url: MOVED.url, hubId: ID }],
    });
    await authority.ready();
    await vi.waitFor(() => {
      expect(state().endpoint).toEqual(MOVED);
    });
  });

  it('releases a superseded probe at once so the next refresh is never refused', async () => {
    hang = true;
    const { host: h } = host();
    const authority = new ProbingRouteAuthority(h);
    authority.refresh(false);
    await vi.waitFor(() => {
      expect(probes.length).toBeGreaterThan(0);
    });
    const firstRound = probes.slice();
    authority.refresh();
    expect(firstRound.every((probe) => probe.signal?.aborted === true)).toBe(true);
    await vi.waitFor(() => {
      expect(probes.length).toBeGreaterThan(firstRound.length);
    });
  });

  it('keeps leases usable when another endpoint is selected and ends them on stop', async () => {
    reachable = new Set([LAN.url, REMOTE.url]);
    const { host: h, state } = host();
    const authority = new ProbingRouteAuthority(h);
    await authority.ready();
    expect(state().endpoint).toEqual(LAN);
    const lease = authority.lease();
    reachable = new Set([REMOTE.url]);
    authority.refresh();
    await vi.waitFor(() => {
      expect(state().endpoint).toEqual(REMOTE);
    });
    expect(lease.isCurrent()).toBe(true);
    authority.stop();
    expect(lease.isCurrent()).toBe(false);
  });

  it('ends existing leases when the profile is invalidated and gives new ones to the next caller', async () => {
    reachable = new Set([LAN.url]);
    const { host: h } = host();
    const authority = new ProbingRouteAuthority(h);
    await authority.ready();
    const before = authority.lease();
    authority.invalidate();
    expect(before.isCurrent()).toBe(false);
    expect(authority.lease().isCurrent()).toBe(true);
    authority.stop();
  });
});
