import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { HubConnectionMetadata, HubEndpoint } from '@smarteverything/domain';
import type { RouteHost } from './active-route';
import type { ServerConnection } from './storage';

const NAME = `smarteverything-${'b'.repeat(32)}.local`;
const LAN: HubEndpoint = { kind: 'lan', url: 'https://192.168.1.20:7880' };
const MOVED: HubEndpoint = { kind: 'lan', url: 'https://192.168.1.77:7880' };
const REMOTE: HubEndpoint = { kind: 'remote', url: 'https://home.example.com' };

function metadataOf(id: string, endpoints: readonly HubEndpoint[]): HubConnectionMetadata {
  return {
    identity: {
      id,
      protocolVersion: 1,
      name: 'Home',
      tls: { serverName: NAME, certificateSha256: 'c'.repeat(64), publicKeySha256: id },
    },
    endpoints: [...endpoints],
    remoteAvailable: true,
    discovery: { state: 'disabled', detail: '' },
  };
}

const PAIRED = metadataOf('a'.repeat(64), [LAN, REMOTE]);
const CONNECTION: ServerConnection = {
  url: LAN.url,
  token: `set_${'d'.repeat(64)}`,
  canonicalKind: 'lan',
  trustedMetadata: PAIRED,
};

const saved = new Map<string, string>();
let served: HubConnectionMetadata = PAIRED;
let failing = false;
const fetched: string[] = [];
const created: { host: RouteHost; updated: HubConnectionMetadata[] }[] = [];

vi.mock('expo-secure-store', () => ({}));
vi.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  randomUUID: (): string => `scope-${String(created.length + 1)}`,
  digestStringAsync: (_algorithm: string, text: string): Promise<string> =>
    Promise.resolve(createHash('sha256').update(text).digest('hex')),
}));
vi.mock('../../design/platform', () => ({ appPlatform: (): string => 'web' }));
vi.mock('./native-route-facade', () => ({ nativeRouteFacade: (): null => null }));
vi.mock('./route-platform', () => ({
  hubFetch: (_scope: string, _endpoint: HubEndpoint, url: string): Promise<Response> => {
    fetched.push(url);
    if (failing) return Promise.reject(new TypeError('network down'));
    return Promise.resolve(Response.json(served));
  },
}));
vi.mock('./route-probes', () => ({
  ProbingRouteAuthority: class {
    readonly updated: HubConnectionMetadata[] = [];
    constructor(readonly host: RouteHost) {
      created.push(this);
    }
    start(): void {
      return undefined;
    }
    stop(): void {
      return undefined;
    }
    lease(): unknown {
      return this.host.lease(
        this.host.current().endpoint ?? LAN,
        () => true,
        () => undefined,
      );
    }
    update(metadata: HubConnectionMetadata): void {
      this.updated.push(metadata);
    }
  },
}));

const { ActiveHubRoute } = await import('./active-route');

function authority(): { host: RouteHost; updated: HubConnectionMetadata[] } {
  const latest = created.at(-1);
  if (latest === undefined) throw new Error('no authority was created');
  return latest;
}

beforeEach(() => {
  saved.clear();
  created.length = 0;
  fetched.length = 0;
  served = PAIRED;
  failing = false;
  Reflect.set(globalThis, 'window', {
    localStorage: {
      getItem: (key: string): string | null => saved.get(key) ?? null,
      setItem: (key: string, value: string): void => {
        saved.set(key, value);
      },
      removeItem: (key: string): void => {
        saved.delete(key);
      },
    },
  });
});

describe('the saved hub address list', () => {
  it('is fetched after a connect, saved and handed to the authority when it changed', async () => {
    const route = new ActiveHubRoute(CONNECTION);
    served = metadataOf('a'.repeat(64), [MOVED, REMOTE]);
    authority().host.publish({ endpoint: REMOTE });
    authority().host.connected(REMOTE);
    await vi.waitFor(() => {
      expect(authority().updated).toEqual([served]);
    });
    expect(fetched).toEqual([`${REMOTE.url}/api/connection`]);
    expect(saved.size).toBe(1);
    route.stop();
  });

  it('is fetched once per endpoint and left alone when nothing changed', async () => {
    new ActiveHubRoute(CONNECTION);
    authority().host.connected(LAN);
    authority().host.connected(LAN);
    await vi.waitFor(() => {
      expect(fetched).toHaveLength(1);
    });
    expect(authority().updated).toEqual([]);
    expect(saved.size).toBe(0);
  });

  it('is not replaced by the answer of a different hub', async () => {
    new ActiveHubRoute(CONNECTION);
    served = metadataOf('f'.repeat(64), [MOVED]);
    authority().host.connected(LAN);
    await vi.waitFor(() => {
      expect(fetched).toHaveLength(1);
    });
    await Promise.resolve();
    expect(authority().updated).toEqual([]);
    expect(saved.size).toBe(0);
  });

  it('is fetched again on the next connect after a failed fetch', async () => {
    new ActiveHubRoute(CONNECTION);
    failing = true;
    authority().host.connected(LAN);
    await vi.waitFor(() => {
      expect(fetched).toHaveLength(1);
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    failing = false;
    served = metadataOf('a'.repeat(64), [MOVED, REMOTE]);
    authority().host.connected(LAN);
    await vi.waitFor(() => {
      expect(authority().updated).toEqual([served]);
    });
    expect(fetched).toHaveLength(2);
  });

  it('does not keep checking after the route stopped', async () => {
    const route = new ActiveHubRoute(CONNECTION);
    route.stop();
    authority().host.connected(LAN);
    await Promise.resolve();
    expect(fetched).toEqual([]);
  });
});

describe('route leases', () => {
  it('stay current when the generation changes and end when the route stops', () => {
    const route = new ActiveHubRoute(CONNECTION);
    authority().host.publish({ metadata: PAIRED });
    const media = route.lease(true);
    expect(media.endpoint).toEqual(REMOTE);
    authority().host.publish({ generation: 9, endpoint: REMOTE });
    expect(media.isCurrent()).toBe(true);
    route.stop();
    expect(media.isCurrent()).toBe(false);
  });
});
