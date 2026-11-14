import type { NativeHubTrust } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { helperCacheOf, helperRouteOf } from '../../src/drive-mount/helper-settings.js';

const KEY = 'a'.repeat(64);

const TRUST: NativeHubTrust = {
  scopeId: 'scope-1',
  identity: {
    id: 'b'.repeat(64),
    protocolVersion: 1,
    name: 'Home',
    tls: {
      serverName: `smarteverything-${'c'.repeat(32)}.local`,
      certificateSha256: 'd'.repeat(64),
      publicKeySha256: KEY,
    },
  },
  endpoints: [
    { kind: 'lan', url: 'https://192.168.50.254:8443' },
    { kind: 'remote', url: 'https://home.example.com' },
  ],
  lanAddresses: ['192.168.50.254'],
};

describe('mount helper route', () => {
  it('sends the LAN address with the paired name and key when at home', () => {
    expect(helperRouteOf({ kind: 'lan', url: 'https://192.168.50.254:8443/' }, TRUST)).toEqual({
      op: 'route',
      url: 'https://192.168.50.254:8443',
      server: TRUST.identity.tls.serverName,
      pin: KEY,
    });
  });

  it('dials the first home address when the LAN endpoint names the hub by host name', () => {
    const line = helperRouteOf({ kind: 'lan', url: 'https://hub.local:8443' }, TRUST);
    expect(line.url).toBe('https://192.168.50.254:8443');
  });

  it('uses the public address with system trust away from home', () => {
    expect(helperRouteOf({ kind: 'remote', url: 'https://home.example.com/app' }, TRUST)).toEqual({
      op: 'route',
      url: 'https://home.example.com',
    });
  });

  it('sends no route while nothing is reachable or the LAN address is not paired', () => {
    expect(helperRouteOf(null, TRUST)).toEqual({ op: 'route' });
    expect(helperRouteOf({ kind: 'lan', url: 'https://10.0.0.9:8443' }, TRUST)).toEqual({
      op: 'route',
    });
    expect(helperRouteOf({ kind: 'lan', url: 'https://192.168.50.254:8443' }, null)).toEqual({
      op: 'route',
    });
  });
});

describe('mount helper cache settings', () => {
  it('leaves the size cap and free space floor out when they are off', () => {
    expect(
      helperCacheOf({
        maxAgeSeconds: 3600,
        maxBytes: null,
        minFreeBytes: null,
        cleanupSeconds: 60,
      }),
    ).toEqual({ op: 'cache', maxAgeSeconds: 3600, cleanupSeconds: 60 });
    expect(
      helperCacheOf({ maxAgeSeconds: 60, maxBytes: 10, minFreeBytes: 20, cleanupSeconds: 5 }),
    ).toEqual({
      op: 'cache',
      maxAgeSeconds: 60,
      maxBytes: 10,
      minFreeBytes: 20,
      cleanupSeconds: 5,
    });
  });
});
