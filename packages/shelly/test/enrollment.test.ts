import { describe, expect, it } from 'vitest';
import {
  SHELLY_ADDRESS,
  SHELLY_DISCOVERY_RESULT,
  SHELLY_ENROLL_REQUEST,
  SHELLY_TRANSPORT_TLS,
} from '../src';

describe('enrollment', () => {
  it('accepts a bare device origin', () => {
    expect(SHELLY_ADDRESS.safeParse('http://192.168.1.20').success).toBe(true);
    expect(SHELLY_ADDRESS.safeParse('https://shelly.local/').success).toBe(true);
  });

  it('refuses credentials, paths, queries and fragments in the address', () => {
    for (const address of [
      'http://user:pass@192.168.1.20',
      'http://192.168.1.20/rpc',
      'http://192.168.1.20?x=1',
      'http://192.168.1.20#x',
    ])
      expect(SHELLY_ADDRESS.safeParse(address).success).toBe(false);
  });

  it('needs both halves of a client certificate', () => {
    expect(SHELLY_TRANSPORT_TLS.safeParse({ clientCertificate: 'c' }).success).toBe(false);
    expect(SHELLY_TRANSPORT_TLS.safeParse({ clientCertificate: 'c', clientKey: 'k' }).success).toBe(
      true,
    );
    expect(SHELLY_TRANSPORT_TLS.parse({})).toEqual({
      caPem: null,
      clientCertificate: null,
      clientKey: null,
    });
  });

  it('defaults to no password', () => {
    expect(SHELLY_ENROLL_REQUEST.parse({ address: 'http://192.168.1.20' }).password).toBeNull();
  });

  it('reads discovery results', () => {
    expect(
      SHELLY_DISCOVERY_RESULT.parse({
        available: true,
        reason: null,
        candidates: [
          { name: 'a', address: 'http://192.168.1.20', host: 'a.local', generation: '4' },
        ],
      }).candidates,
    ).toHaveLength(1);
  });
});
