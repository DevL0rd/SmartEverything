import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { HubConnectionMetadata, HubEndpoint } from '@smarteverything/domain';
import type { ServerConnection } from './storage';

const store = new Map<string, string>();

vi.mock('expo-secure-store', () => ({}));
vi.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  digestStringAsync: (_algorithm: string, text: string): Promise<string> =>
    Promise.resolve(createHash('sha256').update(text).digest('hex')),
}));
vi.mock('../../design/platform', () => ({ appPlatform: (): string => 'web' }));

const { readHubTrust, rememberHubTrust, sameHubInventory } = await import('./trust-storage');

const NAME = `smarteverything-${'b'.repeat(32)}.local`;
const LAN: HubEndpoint = { kind: 'lan', url: 'https://192.168.1.20:7880' };
const MOVED: HubEndpoint = { kind: 'lan', url: 'https://192.168.1.77:7880' };
const REMOTE: HubEndpoint = { kind: 'remote', url: 'https://home.example.com' };

function metadataOf(
  id: string,
  endpoints: readonly HubEndpoint[],
  certificate = 'c'.repeat(64),
): HubConnectionMetadata {
  return {
    identity: {
      id,
      protocolVersion: 1,
      name: 'Home',
      tls: { serverName: NAME, certificateSha256: certificate, publicKeySha256: id },
    },
    endpoints: [...endpoints],
    remoteAvailable: true,
    discovery: { state: 'disabled', detail: '' },
  };
}

const PAIRED = metadataOf('a'.repeat(64), [LAN]);
const CONNECTION: ServerConnection = {
  url: LAN.url,
  token: `set_${'d'.repeat(64)}`,
  canonicalKind: 'lan',
  trustedMetadata: PAIRED,
};

beforeEach(() => {
  store.clear();
  Reflect.set(globalThis, 'window', {
    localStorage: {
      getItem: (key: string): string | null => store.get(key) ?? null,
      setItem: (key: string, value: string): void => {
        store.set(key, value);
      },
      removeItem: (key: string): void => {
        store.delete(key);
      },
    },
  });
});

describe('the saved hub inventory', () => {
  it('starts from what pairing saved', async () => {
    await expect(readHubTrust(CONNECTION)).resolves.toEqual(PAIRED);
  });

  it('prefers the inventory refreshed after a later connect', async () => {
    const fresh = metadataOf('a'.repeat(64), [MOVED, REMOTE]);
    await rememberHubTrust(CONNECTION, fresh);
    await expect(readHubTrust(CONNECTION)).resolves.toEqual(fresh);
  });

  it('ignores a refreshed inventory that belongs to another hub or enrollment', async () => {
    await rememberHubTrust(CONNECTION, metadataOf('f'.repeat(64), [MOVED]));
    await expect(readHubTrust(CONNECTION)).resolves.toEqual(PAIRED);
    await rememberHubTrust(
      { ...CONNECTION, token: `set_${'e'.repeat(64)}` },
      metadataOf('a'.repeat(64), [MOVED]),
    );
    await expect(readHubTrust(CONNECTION)).resolves.toEqual(PAIRED);
  });

  it('discards an unreadable saved entry and carries on with the paired inventory', async () => {
    store.set('smarteverything.server.trusted-hub', '{not json');
    await expect(readHubTrust(CONNECTION)).resolves.toEqual(PAIRED);
    expect(store.has('smarteverything.server.trusted-hub')).toBe(false);
  });

  it('tells a changed address list or certificate from an unchanged one', () => {
    const reordered = metadataOf('a'.repeat(64), [REMOTE, LAN]);
    const same = metadataOf('a'.repeat(64), [LAN, REMOTE]);
    expect(sameHubInventory(same, reordered)).toBe(true);
    expect(sameHubInventory(same, metadataOf('a'.repeat(64), [MOVED, REMOTE]))).toBe(false);
    expect(sameHubInventory(same, metadataOf('a'.repeat(64), [LAN, REMOTE], 'e'.repeat(64)))).toBe(
      false,
    );
  });
});
