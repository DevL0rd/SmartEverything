import { describe, expect, it } from 'vitest';
import { canonicalEndpoint } from '../../src/client-network/route-trust';

describe('the canonical endpoint of a computer node', () => {
  it('is an https origin', () => {
    expect(canonicalEndpoint('https://home.example.com/')).toEqual({
      kind: 'remote',
      url: 'https://home.example.com',
    });
  });

  it.each([
    'http://127.0.0.1:7880',
    'https://127.0.0.1:7880',
    'http://localhost:7880',
    'https://[::1]:7880',
  ])('refuses loopback %s', (url) => {
    expect(() => canonicalEndpoint(url)).toThrow('over loopback');
  });

  it('refuses plain http to another machine', () => {
    expect(() => canonicalEndpoint('http://192.168.1.4:7880')).toThrow('requires HTTPS');
  });

  it('refuses credentials, a query and a fragment', () => {
    expect(() => canonicalEndpoint('https://a:b@home.example.com')).toThrow();
    expect(() => canonicalEndpoint('https://home.example.com/?a=1')).toThrow();
  });
});
