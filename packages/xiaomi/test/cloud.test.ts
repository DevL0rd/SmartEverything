import { createHash } from 'node:crypto';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  XiaomiCloudError,
  apiBaseUrl,
  createNonce,
  decryptResponse,
  encryptRequest,
  isSessionExpired,
  parseCloudEnvelope,
  rc4Drop1024,
  regionalHost,
  signFields,
  signedNonce,
} from '../src';

function base64(hex: string): string {
  return Buffer.from(hex, 'hex').toString('base64');
}

const SSECURITY = base64('000102030405060708090a0b0c0d0e0f');
const NOW = 1_760_000_000_000;
function fixedNonce(): Uint8Array {
  return createNonce(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]), NOW);
}

describe('regional hosts', () => {
  it('drop the region prefix for mainland China only', () => {
    expect(apiBaseUrl('cn')).toBe('https://api.io.mi.com/app');
    expect(apiBaseUrl('de')).toBe('https://de.api.io.mi.com/app');
    expect(regionalHost('sg', 'business.smartcamera.api.io.mi.com')).toBe(
      'https://sg.business.smartcamera.api.io.mi.com',
    );
    expect(regionalHost('cn', 'business.smartcamera.api.io.mi.com')).toBe(
      'https://business.smartcamera.api.io.mi.com',
    );
  });
});

describe('the cloud nonce', () => {
  it('is eight random bytes followed by the minute since the epoch, big-endian', () => {
    expect(Buffer.from(fixedNonce()).toString('base64')).toBe(base64('010203040506070801bf9755'));
    expect(Buffer.from(createNonce(new Uint8Array(8), 59_999)).toString('hex')).toBe(
      '000000000000000000000000',
    );
    expect(Buffer.from(createNonce(new Uint8Array(8), 60_000)).toString('hex')).toBe(
      '000000000000000000000001',
    );
  });

  it('signs with SHA-256 over the ssecurity and the nonce', () => {
    expect(Buffer.from(signedNonce(SSECURITY, fixedNonce())).toString('base64')).toBe(
      base64('28b705bc0f6b7dfa719167090dfa9550aea68b14e582a8f31e8a3ef63a85c815'),
    );
  });
});

describe('RC4 with the first 1024 bytes dropped', () => {
  it('is its own inverse for any key and data', () => {
    fc.assert(
      fc.property(
        fc.uint8Array({ minLength: 1, maxLength: 32 }),
        fc.uint8Array({ maxLength: 64 }),
        (key, data) => {
          expect(rc4Drop1024(key, rc4Drop1024(key, data))).toStrictEqual(data);
        },
      ),
    );
  });

  it('matches the keystream of the reference implementation', () => {
    const key = Buffer.from(
      '28b705bc0f6b7dfa719167090dfa9550aea68b14e582a8f31e8a3ef63a85c815',
      'hex',
    );
    expect(
      Buffer.from(rc4Drop1024(key, new TextEncoder().encode('{"getVirtualModel":true}'))).toString(
        'base64',
      ),
    ).toBe(base64('df228abe0925f7db5f36c2acbdd16700332c6e57c2600513'));
  });
});

describe('a signed and encrypted cloud request', () => {
  it('matches the community clients byte for byte', () => {
    expect(
      encryptRequest({
        method: 'POST',
        path: '/home/device_list',
        data: '{"getVirtualModel":true}',
        ssecurity: SSECURITY,
        nonce: fixedNonce(),
      }),
    ).toStrictEqual([
      ['data', base64('df228abe0925f7db5f36c2acbdd16700332c6e57c2600513')],
      ['rc4_hash__', base64('9c4cdba93b29efc11b3491859fce413270773916d15e3628ed295b9d')],
      ['signature', base64('2c073664ee97b00667ca791a2149f81102f89703')],
      ['_nonce', base64('010203040506070801bf9755')],
    ]);
  });

  it('signs the method, path, fields and signed nonce joined by ampersands', () => {
    const key = new Uint8Array([1, 2, 3]);
    const expected = createHash('sha1')
      .update(`GET&/p&a=1&b=2&${base64('010203')}`)
      .digest('base64');
    expect(
      signFields(
        { method: 'GET', path: '/p' },
        [
          ['a', '1'],
          ['b', '2'],
        ],
        key,
      ),
    ).toBe(expected);
  });

  it('refuses a reply that does not decrypt to UTF-8 text', () => {
    const key = signedNonce(SSECURITY, fixedNonce());
    const garbage = Buffer.from(rc4Drop1024(key, new Uint8Array([0xff, 0xfe]))).toString('base64');
    expect(() => decryptResponse(SSECURITY, fixedNonce(), garbage)).toThrow(TypeError);
  });

  it('decrypts a reply with the same signed nonce', () => {
    expect(
      decryptResponse(
        SSECURITY,
        fixedNonce(),
        base64(
          'df228eb41916bc930b738fe0d2d366162c6f3346922f404ce53b2c8cd0900b0d35e2fd285b4cc53b475d80e22820dc700698fbd7',
        ),
      ),
    ).toBe('{"code": 0, "message": "ok", "result": {"list": []}}');
  });
});

describe('the cloud reply envelope', () => {
  it('returns result and data of a successful reply', () => {
    expect(parseCloudEnvelope('/p', '{"code":0,"result":{"a":1}}')).toStrictEqual({
      result: { a: 1 },
      data: null,
    });
    expect(parseCloudEnvelope('/p', '{"code":0,"data":[1]}')).toStrictEqual({
      result: null,
      data: [1],
    });
  });

  it('turns a non-zero code into a named error', () => {
    expect(() => parseCloudEnvelope('/p', '{"code":-8,"message":"bad"}')).toThrow(
      new XiaomiCloudError('/p', -8, 'bad'),
    );
    expect(() => parseCloudEnvelope('/p', '{"code":3}')).toThrow(
      new XiaomiCloudError('/p', 3, 'no message'),
    );
  });

  it('refuses replies that are not JSON or have no code', () => {
    expect(() => parseCloudEnvelope('/p', '<html>')).toThrow(
      /the reply was not JSON \(SyntaxError/,
    );
    try {
      parseCloudEnvelope('/p', '<html>');
    } catch (error) {
      expect(error).toMatchObject({ code: -1, path: '/p' });
    }
    expect(() => parseCloudEnvelope('/p', '{"ok":1}')).toThrow(
      new XiaomiCloudError('/p', -1, 'the reply had no numeric code: {"ok":1}'),
    );
    const long = `{"ok":"${'x'.repeat(200)}"}`;
    expect(() => parseCloudEnvelope('/p', long)).toThrow(`the reply had no numeric code: ${long}.`);
  });

  it('recognises an expired session by code or message', () => {
    expect(isSessionExpired(new XiaomiCloudError('/p', 2, 'x'))).toBe(true);
    expect(isSessionExpired(new XiaomiCloudError('/p', 3, 'x'))).toBe(true);
    expect(isSessionExpired(new XiaomiCloudError('/p', -1, 'auth err: x'))).toBe(true);
    expect(isSessionExpired(new XiaomiCloudError('/p', -1, 'invalid signature'))).toBe(true);
    expect(isSessionExpired(new XiaomiCloudError('/p', -1, 'SERVICETOKEN_EXPIRED'))).toBe(true);
    expect(isSessionExpired(new XiaomiCloudError('/p', 1, 'busy'))).toBe(false);
    expect(isSessionExpired(new Error('auth err'))).toBe(false);
  });
});
