import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { HubConnectionMetadata, HubEndpoint } from '@smarteverything/domain';

let platform: 'android' | 'web' | 'desktop' = 'android';
let lanSupported = true;

vi.mock('../../design/platform', () => ({ appPlatform: (): string => platform }));
vi.mock('./route-platform', () => ({
  hubNetwork: (): unknown => ({
    capabilities: { http: lanSupported, websocket: lanSupported, media: false },
  }),
}));

const { bootstrapEndpoint, requireTrustedBootstrap, trustedBootstrap } =
  await import('./route-policy');
const { usableEndpoints, usableEndpointsForMedia, HubRouteUnavailableError } =
  await import('./route-policy');

const LAN: HubEndpoint = { kind: 'lan', url: 'https://192.168.1.20:7880' };
const LOOPBACK: HubEndpoint = { kind: 'loopback', url: 'https://127.0.0.1:7880' };
const REMOTE: HubEndpoint = { kind: 'remote', url: 'https://home.example.com' };

function metadataOf(endpoints: readonly HubEndpoint[]): HubConnectionMetadata {
  return {
    identity: {
      id: 'a'.repeat(64),
      protocolVersion: 1,
      name: 'Home',
      tls: {
        serverName: `smarteverything-${'b'.repeat(32)}.local`,
        certificateSha256: 'c'.repeat(64),
        publicKeySha256: 'a'.repeat(64),
      },
    },
    endpoints: [...endpoints],
    remoteAvailable: endpoints.some((endpoint) => endpoint.kind === 'remote'),
    discovery: { state: 'disabled', detail: '' },
  };
}

beforeEach(() => {
  platform = 'android';
  lanSupported = true;
});

describe('bootstrap endpoint kind', () => {
  it('reads addresses, .local names and domains as lan, loopback and remote', () => {
    expect(bootstrapEndpoint('https://192.168.1.20:7880').kind).toBe('lan');
    expect(bootstrapEndpoint('https://[fd00::1]:7880').kind).toBe('lan');
    expect(bootstrapEndpoint('https://hub.local:7880').kind).toBe('lan');
    expect(bootstrapEndpoint('https://127.0.0.1:7880').kind).toBe('loopback');
    expect(bootstrapEndpoint('https://home.example.com').kind).toBe('remote');
  });

  it('keeps a kind the saved pairing already states', () => {
    expect(bootstrapEndpoint('https://home.example.com', 'lan')).toEqual({
      kind: 'lan',
      url: 'https://home.example.com',
    });
  });
});

describe('first contact from outside the home', () => {
  it('trusts only a secure public address, never a LAN one', () => {
    expect(trustedBootstrap(REMOTE.url)).toBe(true);
    expect(trustedBootstrap('http://home.example.com')).toBe(false);
    expect(trustedBootstrap(LAN.url)).toBe(false);
  });

  it('trusts loopback only inside the desktop app', () => {
    expect(trustedBootstrap('https://localhost:7880')).toBe(false);
    expect(trustedBootstrap('http://127.0.0.1:7880')).toBe(false);
    platform = 'web';
    expect(trustedBootstrap('https://localhost:7880')).toBe(false);
    platform = 'desktop';
    expect(trustedBootstrap('https://localhost:7880')).toBe(true);
    expect(trustedBootstrap('http://localhost:7880')).toBe(true);
  });

  it('refuses a LAN bootstrap with a pairing instruction and allows a remote one', () => {
    expect(() => {
      requireTrustedBootstrap(LAN);
    }).toThrow(HubRouteUnavailableError);
    expect(() => {
      requireTrustedBootstrap(REMOTE);
    }).not.toThrow();
  });
});

describe('endpoint candidates', () => {
  it('lists lan before remote and always includes the paired address', () => {
    const list = usableEndpoints(metadataOf([REMOTE, LAN]), REMOTE);
    expect(list.map((endpoint) => endpoint.kind)).toEqual(['lan', 'remote']);
    expect(usableEndpoints(metadataOf([LAN]), REMOTE).map((endpoint) => endpoint.url)).toEqual([
      LAN.url,
      REMOTE.url,
    ]);
  });

  it('leaves out lan where the platform cannot reach it, such as a browser page', () => {
    lanSupported = false;
    expect(usableEndpoints(metadataOf([LAN, REMOTE]), REMOTE)).toEqual([REMOTE]);
  });

  it('leaves out loopback except on the desktop', () => {
    expect(usableEndpoints(metadataOf([LOOPBACK, REMOTE]), REMOTE)).toEqual([REMOTE]);
    platform = 'desktop';
    expect(usableEndpoints(metadataOf([REMOTE, LOOPBACK]), REMOTE)[0]).toEqual(LOOPBACK);
  });
});

describe('media route when away from home', () => {
  it('streams through the paired remote address', () => {
    expect(usableEndpointsForMedia(metadataOf([LAN, REMOTE]), REMOTE)).toEqual(REMOTE);
  });

  it('uses the hub remote address for a phone paired over the LAN', () => {
    expect(usableEndpointsForMedia(metadataOf([LAN, REMOTE]), LAN)).toEqual(REMOTE);
  });

  it('has no media route for a LAN pairing when the hub has no remote address', () => {
    expect(usableEndpointsForMedia(metadataOf([LAN]), LAN)).toBeNull();
    expect(usableEndpointsForMedia(null, LAN)).toBeNull();
  });
});
