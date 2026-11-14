import { describe, expect, it } from 'vitest';
import { verifiedHttpsServer } from '../../src/self-update/public-server';

describe('the verified public HTTPS address of the hub', () => {
  it('is the public address once it is verified and uses HTTPS', () => {
    expect(
      verifiedHttpsServer({
        public_url: 'https://hub.example.test',
        public_url_verified_at: '2026-11-14T00:00:00.000Z',
      }),
    ).toBe('https://hub.example.test');
  });

  it('is absent while the address is unverified', () => {
    expect(
      verifiedHttpsServer({ public_url: 'https://hub.example.test', public_url_verified_at: null }),
    ).toBeNull();
  });

  it('is absent for a plain HTTP address', () => {
    expect(
      verifiedHttpsServer({
        public_url: 'http://hub.example.test',
        public_url_verified_at: '2026-11-14T00:00:00.000Z',
      }),
    ).toBeNull();
  });
});
