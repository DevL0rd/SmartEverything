import { describe, expect, it } from 'vitest';
import {
  NATIVE_HUB_REQUEST,
  NATIVE_HUB_RESPONSE,
  NATIVE_HUB_SOCKET_EVENT,
  NATIVE_HUB_SOCKET_SEND,
  NATIVE_HUB_TRUST,
  nativeHubResourceIdentity,
  type NativeHubResourceOpen,
} from '../src';

const KEY = 'a'.repeat(64);
const IDENTITY = {
  id: KEY,
  protocolVersion: 1,
  name: 'Hub',
  tls: {
    serverName: `smarteverything-${'b'.repeat(32)}.local`,
    publicKeySha256: KEY,
    certificateSha256: 'c'.repeat(64),
  },
} as const;
const BINDING = {
  scopeId: 'scope',
  canonicalOrigin: 'https://hub.example',
  hubId: KEY,
  principalId: 'phone',
  credentialKind: 'client',
  credentialGeneration: 0,
} as const;

describe('native hub transport contract', () => {
  it('accepts live socket frames larger than 1 MiB in both directions', () => {
    const text = 'x'.repeat(1_500_000);
    const bytes = Array.from({ length: 1_200_000 }, () => 7);
    expect(NATIVE_HUB_SOCKET_EVENT.parse({ id: 'a', kind: 'message', data: text }).kind).toBe(
      'message',
    );
    expect(NATIVE_HUB_SOCKET_EVENT.parse({ id: 'a', kind: 'message', data: bytes }).kind).toBe(
      'message',
    );
    expect(NATIVE_HUB_SOCKET_SEND.parse({ id: 'a', data: text }).data).toHaveLength(1_500_000);
  });

  it('accepts requests and answers of any size the home produces', () => {
    const headers = Object.fromEntries(
      Array.from({ length: 100 }, (_, index) => [`x-header-${String(index)}`, 'v'.repeat(20_000)]),
    );
    const body = 'b'.repeat(9 * 1024 * 1024);
    expect(
      NATIVE_HUB_REQUEST.parse({
        scopeId: 'scope',
        url: 'https://hub.example/api',
        method: 'POST',
        headers,
        body,
      }).body,
    ).toHaveLength(body.length);
    expect(NATIVE_HUB_RESPONSE.parse({ status: 200, headers: {}, body }).body).toHaveLength(
      body.length,
    );
  });

  it('accepts a route inventory with more than 32 endpoints and addresses', () => {
    const endpoints = Array.from({ length: 40 }, (_, index) => ({
      kind: 'lan' as const,
      url: `https://192.168.1.${String(index + 1)}:8443`,
    }));
    const lanAddresses = endpoints.map((endpoint) => new URL(endpoint.url).hostname);
    const trust = NATIVE_HUB_TRUST.parse({
      scopeId: 'scope',
      identity: IDENTITY,
      endpoints,
      lanAddresses,
    });
    expect(trust.endpoints).toHaveLength(40);
    expect(trust.lanAddresses).toHaveLength(40);
  });

  it('identifies a resource by what it is, not by the route generation it was opened under', () => {
    const open = (routeGeneration: number): NativeHubResourceOpen => ({
      scopeId: 'scope',
      binding: BINDING,
      routeGeneration,
      url: 'https://hub.example/media/recordings/r1?expires=1&signature=s&size=full',
      expiresAt: '2030-01-01T00:00:00.000Z',
      purpose: 'recording',
    });
    expect(nativeHubResourceIdentity(open(1))).toBe(nativeHubResourceIdentity(open(9)));
    expect(nativeHubResourceIdentity({ ...open(1), purpose: 'audio' })).not.toBe(
      nativeHubResourceIdentity(open(1)),
    );
  });
});
