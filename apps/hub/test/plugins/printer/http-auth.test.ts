import { describe, expect, it } from 'vitest';
import {
  authenticationScheme,
  basicHeader,
  digestHeader,
} from '../../../src/plugins/builtin/printer/http-auth';

describe('basic authentication', () => {
  it('encodes the user and password', () => {
    expect(basicHeader({ user: 'Aladdin', password: 'open sesame' })).toBe(
      'Basic QWxhZGRpbjpvcGVuIHNlc2FtZQ==',
    );
  });

  it('names the scheme a printer asks for', () => {
    expect(authenticationScheme('Basic realm="printer"')).toBe('basic');
    expect(authenticationScheme('  Digest realm="x", nonce="y"')).toBe('digest');
    expect(authenticationScheme('Negotiate')).toBeNull();
    expect(authenticationScheme('')).toBeNull();
  });
});

describe('digest authentication', () => {
  it('answers the RFC 2617 example challenge with the documented response', () => {
    const header = digestHeader(
      'Digest realm="testrealm@host.com", qop="auth,auth-int", nonce="dcd98b7102dd2f0e8b11d0f600bfb0c093", opaque="5ccc069c403ebaf9f0171e9517f40e41"',
      {
        method: 'GET',
        path: '/dir/index.html',
        credentials: { user: 'Mufasa', password: 'Circle Of Life' },
        count: 1,
        clientNonce: '0a4f113b',
      },
    );
    expect(header).toContain('response="6629fae49393a05397450978507c4ef1"');
    expect(header).toContain('nc=00000001');
    expect(header).toContain('cnonce="0a4f113b"');
    expect(header).toContain('opaque="5ccc069c403ebaf9f0171e9517f40e41"');
    expect(header).toContain('algorithm=MD5');
  });

  it('answers the RFC 7616 SHA-256 example with the documented response', () => {
    const header = digestHeader(
      'Digest realm="http-auth@example.org", qop="auth, auth-int", algorithm=SHA-256, nonce="7ypf/xlj9XXwfDPEoM4URrv/xwf94BcCAzFZH4GiTo0v", opaque="FQhe/qaU925kfnzjCev0ciny7QMkPqMAFRtzCUYo5tdS"',
      {
        method: 'GET',
        path: '/dir/index.html',
        credentials: { user: 'Mufasa', password: 'Circle of Life' },
        count: 1,
        clientNonce: 'f2/wE4q74E6zIJEtWaHKaf5wv/H5QzzpXusqGemxURZJ',
      },
    );
    expect(header).toContain(
      'response="753927fa0e85d155564e2e272a28d1802ca10daf4496794697cf8db5856cb6c1"',
    );
    expect(header).toContain('algorithm=SHA-256');
  });

  it('answers without a quality of protection the old way and invents a client nonce when none is given', () => {
    const header = digestHeader('Digest realm="r", nonce="n"', {
      method: 'POST',
      path: '/ipp/print',
      credentials: { user: 'u', password: 'p' },
      count: 2,
    });
    expect(header).not.toContain('qop=');
    expect(header).not.toContain('cnonce');
    expect(header).toContain('uri="/ipp/print"');
    const withQop = digestHeader('Digest realm="r", nonce="n", qop="auth"', {
      method: 'POST',
      path: '/ipp/print',
      credentials: { user: 'u', password: 'p' },
      count: 2,
    });
    expect(withQop).toMatch(/cnonce="[0-9a-f]{16}"/u);
    expect(withQop).toContain('nc=00000002');
  });

  it('gives up on a challenge without a realm or nonce', () => {
    expect(
      digestHeader('Digest nonce="n"', {
        method: 'GET',
        path: '/',
        credentials: { user: 'u', password: 'p' },
        count: 1,
      }),
    ).toBeNull();
  });
});
