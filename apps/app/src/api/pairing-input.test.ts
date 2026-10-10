import { describe, expect, it } from 'vitest';
import {
  normalPairingCode,
  pairingFromScan,
  pairingFromTyped,
  pairingQrText,
  serverAddressOf,
  serverUrlProblem,
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
      problem: 'The server address must use https://. Plain http is only for this machine.',
    });
    expect(serverAddressOf('http://192.168.1.4:47321', true)).toEqual({
      ok: true,
      url: 'http://192.168.1.4:47321',
    });
    expect(serverAddressOf('home.example.com/?a=1', false)).toEqual({
      ok: false,
      problem: 'The server address must not carry a query or a fragment.',
    });
    expect(serverAddressOf('  ', false)).toEqual({
      ok: false,
      problem: 'Enter the domain of your SmartEverything server.',
    });
    expect(serverAddressOf('ftp://home.example.com', false)).toEqual({
      ok: false,
      problem: 'Enter the address of your SmartEverything desktop, starting with https://.',
    });
  });
});

describe('a typed pairing', () => {
  it('accepts an https address and a code typed in any case, with or without the dash', () => {
    expect(pairingFromTyped(' https://home.example.com/ ', 'abcd efgh', false)).toEqual({
      ok: true,
      target: { url: 'https://home.example.com', code: 'ABCD-EFGH' },
    });
    expect(normalPairingCode('ABCD-EFGH')).toBe('ABCD-EFGH');
  });

  it('refuses plain http except for this machine or a development build', () => {
    expect(serverUrlProblem('http://home.example.com', false)).toBe(
      'The server address must use https://. Plain http is only for this machine.',
    );
    expect(serverUrlProblem('http://127.0.0.1:47321', false)).toBeNull();
    expect(serverUrlProblem('http://192.168.1.4:47321', true)).toBeNull();
  });

  it('refuses something that is not an address, or one with a query', () => {
    expect(serverUrlProblem('home', false)).toBe(
      'Enter the address of your SmartEverything desktop, starting with https://.',
    );
    expect(serverUrlProblem('https://home.example.com/?a=1', false)).toBe(
      'The server address must not carry a query or a fragment.',
    );
  });

  it('names a code that is not eight pairing letters', () => {
    expect(pairingFromTyped('https://home.example.com', 'ABCD-EFG1', false)).toEqual({
      ok: false,
      problem: 'Enter the eight-character code the desktop shows, like ABCD-EFGH.',
    });
  });

  it('names the address problem before the code problem', () => {
    expect(pairingFromTyped('nope', 'x', false)).toEqual({
      ok: false,
      problem: 'Enter the address of your SmartEverything desktop, starting with https://.',
    });
  });
});

describe('a scanned pairing', () => {
  const target = { url: 'https://home.example.com', code: 'ABCD-EFGH' };

  it('reads the QR text the desktop shows', () => {
    expect(pairingFromScan(pairingQrText(target))).toEqual({ ok: true, target });
  });

  it('refuses any other QR code', () => {
    const refused = {
      ok: false,
      problem: 'That is not a SmartEverything pairing code. Scan the code under Paired devices.',
    };
    expect(pairingFromScan('https://example.com')).toEqual(refused);
    expect(pairingFromScan('{"url":"http://home.example.com","code":"ABCD-EFGH"}')).toEqual(
      refused,
    );
  });
});
