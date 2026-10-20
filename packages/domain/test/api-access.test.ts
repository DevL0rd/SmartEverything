import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  BEARER_PROTOCOL_PREFIX,
  CLIENT_TOKEN,
  LIVE_PROTOCOL,
  MEDIA_PATHS,
  PAIRING_CODE,
  PAIRING_QR,
  SIGNED_LINK,
  createClientToken,
  createPairingCode,
  hashClientToken,
  hashPairingCode,
  liveProtocols,
  pairingProof,
} from '../src';

const TOKEN = `set_${'ab'.repeat(32)}`;
const HEX = 'ab'.repeat(32);
const IDENTITY = {
  id: HEX,
  protocolVersion: 1,
  name: 'Home',
  tls: {
    serverName: `smarteverything-${'ab'.repeat(16)}.local`,
    certificateSha256: 'cd'.repeat(32),
    publicKeySha256: HEX,
  },
};

describe('client tokens', () => {
  it('createClientToken makes distinct tokens of the published shape', () => {
    const token = createClientToken();
    expect(token).toMatch(/^set_[0-9a-f]{64}$/);
    expect(CLIENT_TOKEN.parse(token)).toBe(token);
    expect(createClientToken()).not.toBe(token);
  });

  it('CLIENT_TOKEN refuses wrong prefixes, lengths, cases and surroundings', () => {
    for (const token of [
      `set_${'a'.repeat(63)}`,
      `set_${'a'.repeat(65)}`,
      `set_${'AB'.repeat(32)}`,
      `set_${'g'.repeat(64)}`,
      `mcp_${HEX}`,
      `x${TOKEN}`,
      `${TOKEN}x`,
      ` ${TOKEN}`,
    ]) {
      expect(CLIENT_TOKEN.safeParse(token).success).toBe(false);
    }
  });

  it('hashClientToken stores the SHA-256 of the whole token', () => {
    expect(hashClientToken(TOKEN)).toBe(
      'd37b02f7a75b489a7af6eb26acf1ccbffe667c33aaa451e5499d96b89b3016dd',
    );
    expect(hashClientToken(`set_${'0'.repeat(64)}`)).toBe(
      '04fe95b66d39e64943c055de614848c7d818c7b0a638a623af2cb0dc93fc0bba',
    );
  });

  it('hashClientToken refuses anything that is not a client token', () => {
    expect(() => hashClientToken('set_short')).toThrow();
  });
});

describe('pairing codes', () => {
  it('createPairingCode makes codes of the published shape', () => {
    const codes = Array.from({ length: 50 }, () => createPairingCode());
    for (const code of codes) {
      expect(code).toMatch(/^[2-9A-Z]{4}-[2-9A-Z]{4}$/);
      expect(code).not.toMatch(/[01ILO]/);
      expect(PAIRING_CODE.parse(code)).toBe(code);
    }
    expect(new Set(codes).size).toBeGreaterThan(1);
  });

  it('PAIRING_CODE accepts every unambiguous character and refuses lookalikes', () => {
    for (const code of [
      '2345-6789',
      'A2B3-C4D5',
      'E6F7-G8H9',
      'J2K3-M4N5',
      'P6Q7-R8S9',
      'T2U3-V4W5',
      'X6Y7-Z8Z9',
    ]) {
      expect(PAIRING_CODE.parse(code)).toBe(code);
    }
    for (const code of [
      '0A2B-C3D4',
      '1A2B-C3D4',
      'I2A3-B4C5',
      'L2A3-B4C5',
      'O2A3-B4C5',
      'a2b3-c4d5',
      'A2B3C4D5',
      'A2B-3C4D5',
      'A2B3-C4D5E',
      'XA2B3-C4D5',
      'A2B3_C4D5',
    ]) {
      expect(PAIRING_CODE.safeParse(code).success).toBe(false);
    }
  });

  it('hashPairingCode stores the SHA-256 of the code', () => {
    expect(hashPairingCode('ABCD-2345')).toBe(
      'fba9e3b1cf08e14df2a2326347c38d763aee0f4d59c5470e78cb2f499b4b53cd',
    );
    expect(hashPairingCode('2345-6789')).toBe(
      '9c6aacf31e589f4c904942275c04f1fcfa76e0886247cf6f9a3422c566943c7a',
    );
  });

  it('hashPairingCode refuses anything that is not a pairing code', () => {
    expect(() => hashPairingCode('a2b3-c4d5')).toThrow();
  });

  it('PAIRING_QR carries the identity and the endpoints with the url and the code', () => {
    const qr = {
      url: 'https://home.example.com/pair',
      code: 'ABCD-2345',
      identity: IDENTITY,
      endpoints: [{ kind: 'remote', url: 'https://home.example.com' }],
    };
    expect(PAIRING_QR.parse(qr)).toStrictEqual(qr);
    for (const url of ['http://home.example.com', 'xhttps://a.example', 'https2://a.example']) {
      expect(PAIRING_QR.safeParse({ ...qr, url }).success).toBe(false);
    }
    expect(PAIRING_QR.safeParse({ ...qr, code: 'abcd' }).success).toBe(false);
    expect(PAIRING_QR.safeParse({ ...qr, extra: 1 }).success).toBe(false);
    expect(PAIRING_QR.safeParse({ url: qr.url, code: qr.code }).success).toBe(false);
  });

  it('pairingProof binds the code hash, the side, the certificate and the nonce', () => {
    const hash = hashPairingCode('ABCD-2345');
    const nonce = 'cd'.repeat(16);
    const proof = pairingProof(hash, 'client', HEX, nonce);
    expect(proof).toMatch(/^[0-9a-f]{64}$/);
    expect(pairingProof(hash, 'client', HEX, nonce)).toBe(proof);
    expect(pairingProof(hash, 'hub', HEX, nonce)).not.toBe(proof);
    expect(pairingProof(hash, 'client', 'cd'.repeat(32), nonce)).not.toBe(proof);
    expect(pairingProof(hash, 'client', HEX, 'ef'.repeat(16))).not.toBe(proof);
    expect(pairingProof(hashPairingCode('ABCD-2346'), 'client', HEX, nonce)).not.toBe(proof);
  });
});

describe('live protocols', () => {
  it('name the live protocol and the bearer prefix', () => {
    expect(LIVE_PROTOCOL).toBe('smarteverything.live.v1');
    expect(BEARER_PROTOCOL_PREFIX).toBe('bearer.');
  });

  it('liveProtocols offers the live protocol and the token as a bearer protocol', () => {
    expect(liveProtocols(TOKEN)).toStrictEqual([
      'smarteverything.live.v1',
      `bearer.set_${'ab'.repeat(32)}`,
    ]);
  });

  it('liveProtocols refuses anything that is not a client token', () => {
    expect(() => liveProtocols('set_short')).toThrow();
  });
});

describe('signed links', () => {
  it('SIGNED_LINK coerces the expiry from query text', () => {
    expect(SIGNED_LINK.parse({ expires: '1790000000', signature: HEX })).toStrictEqual({
      expires: 1_790_000_000,
      signature: HEX,
    });
    expect(SIGNED_LINK.parse({ expires: 1, signature: HEX })).toStrictEqual({
      expires: 1,
      signature: HEX,
    });
  });

  it('SIGNED_LINK refuses expiries that are not positive whole numbers', () => {
    for (const expires of ['0', '-1', '1.5', 'soon']) {
      expect(SIGNED_LINK.safeParse({ expires, signature: HEX }).success).toBe(false);
    }
  });

  it('SIGNED_LINK refuses signatures that are not 64 lower-case hex characters', () => {
    for (const signature of [
      'a'.repeat(63),
      'a'.repeat(65),
      'AB'.repeat(32),
      'g'.repeat(64),
      `x${HEX}`,
      `${HEX}x`,
    ]) {
      expect(SIGNED_LINK.safeParse({ expires: '1', signature }).success).toBe(false);
    }
    expect(SIGNED_LINK.safeParse({ expires: '1', signature: HEX, extra: 1 }).success).toBe(false);
  });

  it('SIGNED_LINK accepts any positive expiry with any lower-case hex signature', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: Number.MAX_SAFE_INTEGER }),
        fc.stringMatching(/^[0-9a-f]{64}$/),
        (expires, signature) => {
          expect(SIGNED_LINK.parse({ expires: String(expires), signature })).toStrictEqual({
            expires,
            signature,
          });
        },
      ),
    );
  });
});

describe('media paths', () => {
  it('MEDIA_PATHS names every path served outside /api', () => {
    expect(MEDIA_PATHS).toStrictEqual({
      recording: '/media/recordings/:recordingId',
      cameraStream: '/media/cameras/:deviceId/mse',
      cameraSnapshot: '/media/cameras/:deviceId/snapshot',
      live: '/live',
      publicUrlProbe: '/.well-known/smarteverything/:nonce',
      assistantAttachment: '/media/assistant/:attachmentId',
      talkMessage: '/media/talk/:messageId',
      computerDownload: '/media/computers/:deviceId/downloads/:ticketId',
      machineUpdate: '/media/machine-updates/:file',
    });
  });
});
