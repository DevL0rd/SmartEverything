import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PairingQr } from '../src/api/access';
import {
  PAIRING_INVITATION_MAX_LENGTH,
  pairingInvitationText,
  parsePairingInvitation,
} from '../src/pairing-invitation';

const KEY = 'a'.repeat(64);

function qr(overrides: Partial<PairingQr> = {}): PairingQr {
  return {
    url: 'https://home.example/',
    code: 'ABCD-2345',
    identity: {
      id: KEY,
      protocolVersion: 1,
      name: 'Home',
      tls: {
        serverName: `smarteverything-${'b'.repeat(32)}.local`,
        certificateSha256: 'c'.repeat(64),
        publicKeySha256: KEY,
      },
    },
    endpoints: [
      { kind: 'remote', url: 'https://home.example/' },
      { kind: 'lan', url: 'https://192.168.1.20:8443' },
      { kind: 'loopback', url: 'http://localhost:8080/' },
    ],
    ...overrides,
  };
}

function textFor(overrides: Partial<PairingQr> = {}, https = true): string {
  const text = pairingInvitationText(qr(overrides), https);
  if (text === null) throw new Error('expected an invitation');
  return text;
}

function fragmentOf(payload: unknown): string {
  return btoa(JSON.stringify(payload))
    .replace(/\+/gu, '-')
    .replace(/\//gu, '_')
    .replace(/=+$/u, '');
}

describe('pairing invitation text', () => {
  it('carries the remote and the first usable LAN address, never the loopback one', () => {
    const parsed = parsePairingInvitation(textFor());
    expect(parsed).toMatchObject({ ok: true });
    if (!parsed.ok) throw new Error('unreachable');
    expect(parsed.invitation.endpoints.map((endpoint) => endpoint.kind)).toEqual(['remote', 'lan']);
    expect(parsed.invitation.url).toBe('https://home.example/');
    expect(parsed.invitation.code).toBe('ABCD-2345');
  });

  it('starts at the hub web address when it is a web link and at the app scheme otherwise', () => {
    expect(textFor({}, true)).toMatch(/^https:\/\/home\.example\/pair#invite=[A-Za-z0-9_-]+$/u);
    expect(textFor({}, false)).toMatch(/^smarteverything:\/\/pair#invite=[A-Za-z0-9_-]+$/u);
  });

  it('round-trips through the app scheme too', () => {
    expect(parsePairingInvitation(textFor({}, false))).toMatchObject({ ok: true });
  });

  it('falls back to a LAN address when there is no remote one, but only for the app scheme', () => {
    const lanOnly = qr({
      url: 'https://192.168.1.20:8443',
      endpoints: [{ kind: 'lan', url: 'https://192.168.1.20:8443' }],
    });
    expect(pairingInvitationText(lanOnly, false)).toMatch(/^smarteverything:\/\/pair#invite=/u);
    expect(pairingInvitationText(lanOnly, true)).toBeNull();
  });

  it('is refused when no address in it can be reached from another device', () => {
    const loopbackOnly = qr({ endpoints: [{ kind: 'loopback', url: 'http://localhost:8080/' }] });
    expect(pairingInvitationText(loopbackOnly)).toBeNull();
  });

  it('is refused when the remote address has a path, because only a bare origin can be matched', () => {
    const pathed = qr({
      url: 'https://home.example/hub',
      endpoints: [{ kind: 'remote', url: 'https://home.example/hub' }],
    });
    expect(pairingInvitationText(pathed, true)).toBeNull();
  });

  it('names the remote address as the main one whatever main address the original had', () => {
    const parsed = parsePairingInvitation(textFor({ url: 'https://elsewhere.example/' }, false));
    expect(parsed).toMatchObject({ ok: true, invitation: { url: 'https://home.example/' } });
  });

  it('is refused when the text would be longer than a scanner can read', () => {
    const origin = `https://${'h'.repeat(PAIRING_INVITATION_MAX_LENGTH)}.example`;
    const long = qr({ endpoints: [{ kind: 'remote', url: `${origin}/` }] });
    expect(pairingInvitationText(long, true)).toBeNull();
  });

  it('is refused for the app scheme when its own text would not read back as an invitation', () => {
    const pathed = qr({ endpoints: [{ kind: 'remote', url: 'https://home.example/hub' }] });
    expect(pairingInvitationText(pathed, false)).toBeNull();
  });
});

describe('parsing an invitation', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const refused = { ok: false, problem: 'That is not a SmartEverything invitation' };

  it('refuses text that is not a link', () => {
    expect(parsePairingInvitation('not a link')).toEqual(refused);
    expect(parsePairingInvitation('')).toEqual(refused);
  });

  it('refuses a link longer than the limit', () => {
    const text = `https://home.example/pair#invite=${'A'.repeat(PAIRING_INVITATION_MAX_LENGTH)}`;
    expect(parsePairingInvitation(text)).toEqual(refused);
  });

  it('refuses a link without the invite fragment', () => {
    expect(parsePairingInvitation('https://home.example/pair')).toEqual(refused);
    expect(parsePairingInvitation('https://home.example/pair#other=abc')).toEqual(refused);
  });

  it('refuses an encoding that is not base64url', () => {
    expect(parsePairingInvitation('https://home.example/pair#invite=%%%')).toEqual(refused);
  });

  it('refuses a fragment that decodes to something other than an invitation', () => {
    expect(parsePairingInvitation(`smarteverything://pair#invite=${fragmentOf({ a: 1 })}`)).toEqual(
      refused,
    );
    expect(parsePairingInvitation('smarteverything://pair#invite=AAAA')).toEqual(refused);
  });

  it('refuses a fragment whose bytes are not valid text', () => {
    expect(parsePairingInvitation('smarteverything://pair#invite=_w')).toEqual(refused);
  });

  it('refuses an invitation that was re-encoded differently from how it is written', () => {
    const text = textFor({}, false);
    const code = text.split('#invite=')[1] ?? '';
    const loose = `smarteverything://pair#invite=${code}A`;
    expect(parsePairingInvitation(loose)).toEqual(refused);
  });

  it('refuses a web link that points at another hub than the invitation names', () => {
    const code = textFor({}, true).split('#invite=')[1] ?? '';
    expect(parsePairingInvitation(`https://other.example/pair#invite=${code}`)).toEqual(refused);
    expect(parsePairingInvitation(`https://home.example/elsewhere#invite=${code}`)).toEqual(
      refused,
    );
  });

  it('refuses a link with a user name, a password or a query', () => {
    const code = textFor({}, true).split('#invite=')[1] ?? '';
    expect(parsePairingInvitation(`https://user@home.example/pair#invite=${code}`)).toEqual(
      refused,
    );
    expect(parsePairingInvitation(`https://home.example/pair?x=1#invite=${code}`)).toEqual(refused);
  });

  it('refuses an app link with the wrong host or a path', () => {
    const code = textFor({}, false).split('#invite=')[1] ?? '';
    expect(parsePairingInvitation(`smarteverything://other#invite=${code}`)).toEqual(refused);
    expect(parsePairingInvitation(`smarteverything://pair/x#invite=${code}`)).toEqual(refused);
  });

  it('refuses a link with another scheme', () => {
    const code = textFor({}, false).split('#invite=')[1] ?? '';
    expect(parsePairingInvitation(`http://home.example/pair#invite=${code}`)).toEqual(refused);
  });

  it('refuses an invitation whose endpoints carry a loopback address', () => {
    const payload = {
      url: 'https://home.example/',
      code: 'ABCD-2345',
      identity: qr().identity,
      endpoints: [
        { kind: 'remote', url: 'https://home.example/' },
        { kind: 'loopback', url: 'http://localhost:8080/' },
      ],
    };
    expect(parsePairingInvitation(`smarteverything://pair#invite=${fragmentOf(payload)}`)).toEqual(
      refused,
    );
  });

  it('lets a failure that is not an error through instead of calling it a bad invitation', () => {
    const broken: unknown = 'broken decoder';
    vi.spyOn(globalThis, 'atob').mockImplementation(() => {
      throw broken;
    });
    expect(() => parsePairingInvitation(textFor({}, false))).toThrow('broken decoder');
  });
});
