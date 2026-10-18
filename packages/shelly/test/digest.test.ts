import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { ShellyAuthenticationError, ShellyDigest, shellyPasswordHash } from '../src/rpc-entry';

const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');
const challenge = (fields: Readonly<Record<string, unknown>>): string =>
  JSON.stringify({
    auth_type: 'digest',
    nonce: 'abc123',
    realm: 'shellypresencegen4-aabbcc',
    algorithm: 'SHA-256',
    ...fields,
  });
const REALM = 'shellypresencegen4-aabbcc';

function expectedResponse(
  auth: Readonly<Record<string, string | number>>,
  password: string,
): string {
  const ha1 = sha256(`admin:${REALM}:${password}`);
  return sha256(
    `${ha1}:${String(auth['nonce'])}:${String(auth['nc'])}:${String(auth['cnonce'])}:auth:${sha256('dummy_method:dummy_uri')}`,
  );
}

describe('password hash', () => {
  it('hashes admin, realm and password with SHA-256', () => {
    expect(shellyPasswordHash(REALM, 'secret')).toBe(sha256(`admin:${REALM}:secret`));
  });
});

describe('digest answers', () => {
  it('answers a challenge with a verifiable SHA-256 response', () => {
    const auth = new ShellyDigest('secret').answer(challenge({}));
    expect(auth).toMatchObject({
      realm: REALM,
      username: 'admin',
      nonce: 'abc123',
      algorithm: 'SHA-256',
      nc: '00000001',
    });
    expect(auth['response']).toBe(expectedResponse(auth, 'secret'));
  });

  it('counts requests in eight hex digits and reuses a string nonce', () => {
    const digest = new ShellyDigest('secret');
    digest.answer(challenge({}));
    expect(digest.current()).toMatchObject({ nc: '00000002' });
    expect(digest.current()).toMatchObject({ nc: '00000003' });
  });

  it('answers numeric nonces with a numeric count and never reuses them', () => {
    const digest = new ShellyDigest('secret');
    expect(digest.answer(challenge({ nonce: 42 }))).toMatchObject({ nonce: 42, nc: 1 });
    expect(digest.current()).toBeNull();
  });

  it('starts counting after the count the device asks for and never reuses it', () => {
    const digest = new ShellyDigest('secret');
    expect(digest.answer(challenge({ nc: '7' }))).toMatchObject({ nc: 7 });
    expect(digest.current()).toBeNull();
    expect(digest.answer(challenge({ nc: 3 }))).toMatchObject({ nc: 8 });
  });

  it('keeps counting when the same nonce is challenged again', () => {
    const digest = new ShellyDigest('secret');
    digest.answer(challenge({}));
    digest.current();
    expect(digest.answer(challenge({}))).toMatchObject({ nc: '00000003' });
  });

  it('restarts the count for a new nonce', () => {
    const digest = new ShellyDigest('secret');
    digest.answer(challenge({}));
    expect(digest.answer(challenge({ nonce: 'other' }))).toMatchObject({ nc: '00000001' });
  });

  it('has nothing to send before the first challenge', () => {
    expect(new ShellyDigest('secret').current()).toBeNull();
  });
});

describe('digest failures', () => {
  const failure = (run: () => unknown): ShellyAuthenticationError => {
    try {
      run();
    } catch (cause) {
      if (cause instanceof ShellyAuthenticationError) return cause;
    }
    throw new Error('expected an authentication error');
  };

  it('needs a password', () => {
    expect(failure(() => new ShellyDigest(null).answer(challenge({}))).reason).toBe(
      'a local access password is required',
    );
  });

  it('refuses malformed and unsupported challenges', () => {
    const digest = new ShellyDigest('secret');
    const malformed = failure(() => digest.answer('{'));
    expect(malformed.reason).toBe('the device challenge is malformed');
    expect(malformed.cause).toBeInstanceOf(SyntaxError);
    expect(failure(() => digest.answer(challenge({ algorithm: 'MD5' }))).reason).toBe(
      'the device challenge fields are not supported',
    );
  });
});
