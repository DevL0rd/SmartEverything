import { describe, expect, it } from 'vitest';
import {
  normalPairingCode,
  pairingCodeFrom,
  pairingFromScan,
  pairingQrText,
  serverAddressOf,
  serverUrlProblem,
  type PairingTarget,
} from './pairing-input';

describe('the server domain typed on the connect screen', () => {
  it('turns a bare domain into its https address', () => {
    expect(serverAddressOf(' smarteverything.devl0rd.com ', false)).toEqual({
      ok: true,
      url: 'https://smarteverything.devl0rd.com',
    });
  });

  it('keeps a full https address, without trailing slashes, and a path behind a proxy', () => {
    expect(serverAddressOf('https://smarteverything.devl0rd.com//', false)).toEqual({
      ok: true,
      url: 'https://smarteverything.devl0rd.com',
    });
    expect(serverAddressOf('HTTPS://home.example.com/se/', false)).toEqual({
      ok: true,
      url: 'https://home.example.com/se',
    });
  });

  it('refuses plain http to another machine, a query, nothing and something that is no domain', () => {
    expect(serverAddressOf('http://home.example.com', false)).toEqual({
      ok: false,
      problem: 'Use https:// for a server on another computer',
    });
    expect(serverAddressOf('http://192.168.1.4:47321', true)).toEqual({
      ok: true,
      url: 'http://192.168.1.4:47321',
    });
    expect(serverAddressOf('home.example.com/?a=1', false)).toEqual({
      ok: false,
      problem: 'Remove everything after the address',
    });
    expect(serverAddressOf('  ', false)).toEqual({
      ok: false,
      problem: 'Enter your server address',
    });
    expect(serverAddressOf('ftp://home.example.com', false)).toEqual({
      ok: false,
      problem: 'Enter an address that starts with https://',
    });
  });
});

describe('a typed pairing code', () => {
  it('accepts a code typed in any case, with or without the dash', () => {
    expect(pairingCodeFrom('abcd efgh')).toEqual({ ok: true, code: 'ABCD-EFGH' });
    expect(pairingCodeFrom('ABCD-EFGH')).toEqual({ ok: true, code: 'ABCD-EFGH' });
    expect(normalPairingCode('ABCD-EFGH')).toBe('ABCD-EFGH');
  });

  it('names a code that is not eight pairing letters', () => {
    expect(pairingCodeFrom('ABCD-EFG1')).toEqual({
      ok: false,
      problem: 'Enter the 8-character code from your desktop',
    });
  });
});

describe('a server address', () => {
  it('refuses plain http except for this machine or a development build', () => {
    expect(serverUrlProblem('http://home.example.com', false)).toBe(
      'Use https:// for a server on another computer',
    );
    expect(serverUrlProblem('http://127.0.0.1:47321', false)).toBeNull();
    expect(serverUrlProblem('http://192.168.1.4:47321', true)).toBeNull();
  });

  it('refuses something that is not an address, or one with a query', () => {
    expect(serverUrlProblem('home', false)).toBe('Enter an address that starts with https://');
    expect(serverUrlProblem('https://home.example.com/?a=1', false)).toBe(
      'Remove everything after the address',
    );
  });
});

describe('a scanned pairing', () => {
  const target: PairingTarget = {
    url: 'https://home.example.com',
    code: 'ABCD-EFGH',
    identity: {
      id: 'ab'.repeat(32),
      protocolVersion: 1,
      name: 'Home',
      tls: {
        serverName: `smarteverything-${'ab'.repeat(16)}.local`,
        certificateSha256: 'cd'.repeat(32),
        publicKeySha256: 'ab'.repeat(32),
      },
    },
    endpoints: [{ kind: 'remote', url: 'https://home.example.com' }],
  };

  it('reads the QR text the desktop shows', () => {
    expect(pairingFromScan(pairingQrText(target))).toEqual({ ok: true, target });
  });

  it('refuses any other QR code, including one without the home identity', () => {
    const refused = { ok: false, problem: 'That is not a SmartEverything pairing code' };
    expect(pairingFromScan('https://example.com')).toEqual(refused);
    expect(pairingFromScan('{"url":"https://home.example.com","code":"ABCD-EFGH"}')).toEqual(
      refused,
    );
    expect(pairingFromScan(JSON.stringify({ ...target, url: 'http://home.example.com' }))).toEqual(
      refused,
    );
  });
});
