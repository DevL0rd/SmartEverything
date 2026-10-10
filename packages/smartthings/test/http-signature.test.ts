import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  bodyDigest,
  checkDate,
  checkDigest,
  DATE_SKEW_MS,
  KEY_HOST,
  keyUrl,
  parseSignatureHeader,
  publicKeyOf,
  SIGNATURE_ALGORITHM,
  SIGNED_HEADERS,
  signingString,
  verifySignedRequest,
  WebhookSignatureError,
  type SignedRequest,
} from '../src/http-signature';

const CERTIFICATE = `-----BEGIN CERTIFICATE-----
MIICHDCCAYWgAwIBAgIUGKgSfqyDz9PQtv5+ka4ikKkJY3owDQYJKoZIhvcNAQEL
BQAwHzEdMBsGA1UEAwwUa2V5LnNtYXJ0dGhpbmdzLnRlc3QwIBcNMjYxMDA4MTcy
NDU4WhgPMjEyNjA5MTQxNzI0NThaMB8xHTAbBgNVBAMMFGtleS5zbWFydHRoaW5n
cy50ZXN0MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDLFasHdBE5XLgx3kAs
8cQnpIOrS2w6FHqgsATusSG6owmfVkXdwSNfwi3Mu0kXyaWQH0SPapfi7OmWJGgR
PTLyspJbYTF3QHvXSWRvWLCJdDemlU8COzrQAtTrwa6RnT9n+YyMOr6WKECdXu5g
Zq497KUEKlCRxTahnff618p/zQIDAQABo1MwUTAdBgNVHQ4EFgQUSWVci95+zujz
TlJNkM6YhKdUL6EwHwYDVR0jBBgwFoAUSWVci95+zujzTlJNkM6YhKdUL6EwDwYD
VR0TAQH/BAUwAwEB/zANBgkqhkiG9w0BAQsFAAOBgQCoi9qf8cz9YO06d0x2fyru
nIHGEgtRGim5vfCz2Y8yk3Mn8bxngl/Uf9HSGUnhvMXFTa16+JRMObsxL8z0eHjD
yNgGPVyiVW4ai9d7q/0UkQFijb9gqsP4yWYLc5qYgKhb6teW0rZ9c7IWYKsBz1dD
j994OvSKM6LYMmDxF418Dg==
-----END CERTIFICATE-----
`;

const NOW = new Date('2026-03-12T16:44:05.000Z');

const DATE = 'Thu, 12 Mar 2026 16:44:05 UTC';

const BODY = Buffer.from('{"messageType":"EVENT"}', 'utf8');

const DIGEST = createHash('sha256').update(BODY).digest('base64');

const KEYS = generateKeyPairSync('rsa', { modulusLength: 2048 });

const HEADER_LIST = '(request-target) digest date';

function requestWith(headers: Record<string, string | undefined> = {}): SignedRequest {
  return {
    method: 'POST',
    path: '/smartthings/webhook',
    headers: { digest: `SHA256=${DIGEST}`, date: DATE, ...headers },
    body: BODY,
  };
}

function signatureOf(request: SignedRequest): string {
  const text = `(request-target): post /smartthings/webhook\ndigest: ${request.headers['digest'] ?? ''}\ndate: ${request.headers['date'] ?? ''}`;
  return sign('sha256', Buffer.from(text, 'utf8'), KEYS.privateKey).toString('base64');
}

function authorization(fields: Record<string, string>): string {
  return `Signature ${Object.entries(fields)
    .map(([name, value]) => `${name}="${value}"`)
    .join(',')}`;
}

function refusal(run: () => unknown): string {
  try {
    run();
  } catch (cause) {
    expect(cause).toBeInstanceOf(WebhookSignatureError);
    return cause instanceof WebhookSignatureError ? cause.reason : '';
  }
  throw new Error('expected a refusal');
}

describe('the Authorization header', () => {
  const fields = {
    keyId: '/pl/useast2/1b-75-d2',
    signature: 'c2ln',
    headers: HEADER_LIST,
    algorithm: 'rsa-sha256',
  };

  it('reads the key id, signature, signed headers and algorithm', () => {
    expect(parseSignatureHeader(authorization(fields))).toEqual({
      keyId: '/pl/useast2/1b-75-d2',
      signature: 'c2ln',
      headers: ['(request-target)', 'digest', 'date'],
      algorithm: 'rsa-sha256',
    });
    expect(
      parseSignatureHeader(
        `Signature keyId="/k", signature="s", headers="(Request-Target) Digest Date Host", algorithm="RSA-SHA256"`,
      ),
    ).toEqual({
      keyId: '/k',
      signature: 's',
      headers: ['(request-target)', 'digest', 'date', 'host'],
      algorithm: 'rsa-sha256',
    });
    expect(SIGNED_HEADERS).toEqual(['(request-target)', 'digest', 'date']);
    expect(SIGNATURE_ALGORITHM).toBe('rsa-sha256');
  });

  it('refuses a missing header, another scheme and missing parameters', () => {
    expect(refusal(() => parseSignatureHeader(undefined))).toBe(
      'it carries no Authorization header',
    );
    expect(refusal(() => parseSignatureHeader('Bearer abc'))).toBe(
      'the Authorization header is not an HTTP signature',
    );
    expect(refusal(() => parseSignatureHeader(`xSignature keyId="/k"`))).toBe(
      'the Authorization header is not an HTTP signature',
    );
    for (const name of ['keyId', 'signature', 'headers', 'algorithm']) {
      const without = Object.fromEntries(Object.entries(fields).filter(([key]) => key !== name));
      expect(refusal(() => parseSignatureHeader(authorization(without)))).toBe(
        `the signature has no ${name}`,
      );
      expect(refusal(() => parseSignatureHeader(authorization({ ...fields, [name]: '' })))).toBe(
        `the signature has no ${name}`,
      );
    }
  });

  it('refuses another algorithm and a signature that leaves a required header out', () => {
    expect(
      refusal(() => parseSignatureHeader(authorization({ ...fields, algorithm: 'hmac-sha256' }))),
    ).toBe('the signature algorithm hmac-sha256 is not rsa-sha256');
    expect(
      refusal(() => parseSignatureHeader(authorization({ ...fields, headers: 'digest' }))),
    ).toBe('the signature does not cover (request-target), date');
  });

  it('describes the refusal in its message', () => {
    expect(new WebhookSignatureError('x').message).toBe(
      'The SmartThings webhook request was refused: x.',
    );
    expect(new WebhookSignatureError('x').name).toBe('WebhookSignatureError');
  });
});

describe('the key location', () => {
  it('appends the key id to the SmartThings key host', () => {
    expect(KEY_HOST).toBe('https://key.smartthings.com');
    expect(keyUrl('/pl/useast2/1b-75-d2_x.y~z')).toBe(
      'https://key.smartthings.com/pl/useast2/1b-75-d2_x.y~z',
    );
  });

  it('refuses a key id that could leave the key host', () => {
    for (const keyId of [
      '@evil.test/x',
      'pl/useast2',
      '/pl/../../x',
      '/..',
      '/pl?x=1',
      '/pl#x',
      '/pl:80',
      '',
      '/',
      '/pl\n',
    ]) {
      expect(refusal(() => keyUrl(keyId))).toBe(
        `the key id ${JSON.stringify(keyId)} is not a key path`,
      );
    }
  });

  it('reads the public key out of the certificate the key host serves', () => {
    const key = publicKeyOf(CERTIFICATE);
    expect(key.type).toBe('public');
    expect(key.asymmetricKeyType).toBe('rsa');
  });

  it('refuses an answer that is not a certificate', () => {
    expect(refusal(() => publicKeyOf('not a certificate'))).toMatch(
      /^the key server answered with something other than a certificate \(Error: .+\)$/,
    );
  });
});

describe('the digest and date', () => {
  it('computes the SHA-256 digest of the body', () => {
    expect(bodyDigest(BODY)).toBe(DIGEST);
  });

  it('accepts SHA256= and SHA-256= in any case', () => {
    for (const prefix of ['SHA256=', 'SHA-256=', 'sha-256=', 'sha256=']) {
      expect(() => {
        checkDigest(`${prefix}${DIGEST}`, BODY);
      }).not.toThrow();
    }
  });

  it('refuses a missing, foreign or wrong digest', () => {
    expect(
      refusal(() => {
        checkDigest(undefined, BODY);
      }),
    ).toBe('the Digest header is not a SHA-256 digest');
    expect(
      refusal(() => {
        checkDigest(`MD5=${DIGEST}`, BODY);
      }),
    ).toBe('the Digest header is not a SHA-256 digest');
    expect(
      refusal(() => {
        checkDigest(`xSHA256=${DIGEST}`, BODY);
      }),
    ).toBe('the Digest header is not a SHA-256 digest');
    expect(
      refusal(() => {
        checkDigest('SHA256=', BODY);
      }),
    ).toBe('the Digest header is not a SHA-256 digest');
    expect(
      refusal(() => {
        checkDigest(`SHA256=${DIGEST}\nx`, BODY);
      }),
    ).toBe('the Digest header is not a SHA-256 digest');
    expect(
      refusal(() => {
        checkDigest(`SHA256=${DIGEST}x`, BODY);
      }),
    ).toBe('the Digest header does not match the body');
    expect(
      refusal(() => {
        checkDigest(`SHA256=${DIGEST}`, Buffer.from('other'));
      }),
    ).toBe('the Digest header does not match the body');
  });

  it('accepts a date within five minutes either way and refuses one further off', () => {
    expect(DATE_SKEW_MS).toBe(300_000);
    expect(() => {
      checkDate(DATE, NOW);
    }).not.toThrow();
    expect(() => {
      checkDate(DATE, new Date(NOW.getTime() + DATE_SKEW_MS));
    }).not.toThrow();
    expect(() => {
      checkDate(DATE, new Date(NOW.getTime() - DATE_SKEW_MS));
    }).not.toThrow();
    expect(
      refusal(() => {
        checkDate(DATE, new Date(NOW.getTime() + DATE_SKEW_MS + 1));
      }),
    ).toBe('the Date header is 300 seconds from now');
    expect(
      refusal(() => {
        checkDate(DATE, new Date(NOW.getTime() - DATE_SKEW_MS - 1000));
      }),
    ).toBe('the Date header is -301 seconds from now');
    expect(
      refusal(() => {
        checkDate(undefined, NOW);
      }),
    ).toBe('the Date header is not a date');
    expect(
      refusal(() => {
        checkDate('yesterday', NOW);
      }),
    ).toBe('the Date header is not a date');
  });
});

describe('the signed request', () => {
  it('builds the signing string in the order the signature names', () => {
    expect(signingString(requestWith(), ['(request-target)', 'digest', 'date'])).toBe(
      `(request-target): post /smartthings/webhook\ndigest: SHA256=${DIGEST}\ndate: ${DATE}`,
    );
    expect(signingString(requestWith(), ['date', '(request-target)'])).toBe(
      `date: ${DATE}\n(request-target): post /smartthings/webhook`,
    );
    expect(refusal(() => signingString(requestWith(), ['host']))).toBe(
      'the signed header host is missing',
    );
  });

  it('accepts a request signed by the SmartThings key', () => {
    const request = requestWith();
    const parameters = parseSignatureHeader(
      authorization({
        keyId: '/k',
        signature: signatureOf(request),
        headers: HEADER_LIST,
        algorithm: 'rsa-sha256',
      }),
    );
    expect(() => {
      verifySignedRequest(request, parameters, KEYS.publicKey, NOW);
    }).not.toThrow();
  });

  it('refuses a request whose signature, digest or date does not hold', () => {
    const request = requestWith();
    const parameters = {
      keyId: '/k',
      signature: signatureOf(request),
      headers: ['(request-target)', 'digest', 'date'],
      algorithm: 'rsa-sha256',
    };
    const other = generateKeyPairSync('rsa', { modulusLength: 2048 }).publicKey;
    expect(
      refusal(() => {
        verifySignedRequest(request, parameters, other, NOW);
      }),
    ).toBe('the signature does not match the SmartThings key');
    expect(
      refusal(() => {
        verifySignedRequest({ ...request, method: 'PUT' }, parameters, KEYS.publicKey, NOW);
      }),
    ).toBe('the signature does not match the SmartThings key');
    expect(
      refusal(() => {
        verifySignedRequest(
          { ...request, body: Buffer.from('x') },
          parameters,
          KEYS.publicKey,
          NOW,
        );
      }),
    ).toBe('the Digest header does not match the body');
    expect(
      refusal(() => {
        verifySignedRequest(request, parameters, KEYS.publicKey, new Date('2026-03-13T00:00:00Z'));
      }),
    ).toBe('the Date header is 26155 seconds from now');
  });
});
