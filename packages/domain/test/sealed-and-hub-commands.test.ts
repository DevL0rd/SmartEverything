import { xchacha20poly1305 } from '@noble/ciphers/chacha.js';
import { x25519 } from '@noble/curves/ed25519.js';
import { hkdf } from '@noble/hashes/hkdf.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, hexToBytes, utf8ToBytes } from '@noble/hashes/utils.js';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  HUB_COMMAND,
  PROVIDER_CREDENTIALS,
  PROVIDER_PROMPT,
  SEALED,
  UnsealError,
  createSealingKeys,
  isHubCapability,
  seal,
  unseal,
} from '../src';

describe('sealed messages', () => {
  it('opens what was sealed for the key, for any text', () => {
    const keys = createSealingKeys();
    fc.assert(
      fc.property(fc.string(), (message) => {
        const sealed = seal(keys.publicKey, message);
        expect(SEALED.parse(sealed)).toStrictEqual(sealed);
        expect(unseal(keys, sealed)).toBe(message);
      }),
      { numRuns: 40 },
    );
  });

  it('creates distinct 32-byte keys', () => {
    const first = createSealingKeys();
    const second = createSealingKeys();
    expect(first.publicKey).toMatch(/^[0-9a-f]{64}$/);
    expect(first.secretKey).toMatch(/^[0-9a-f]{64}$/);
    expect(first.secretKey).not.toBe(second.secretKey);
  });

  it('never repeats the ephemeral key or nonce', () => {
    const keys = createSealingKeys();
    const one = seal(keys.publicKey, 'same');
    const two = seal(keys.publicKey, 'same');
    expect(one.ephemeral).not.toBe(two.ephemeral);
    expect(one.nonce).not.toBe(two.nonce);
    expect(one.ciphertext).not.toBe(two.ciphertext);
  });

  it('refuses to open with another key', () => {
    const sealed = seal(createSealingKeys().publicKey, 'secret');
    expect(() => unseal(createSealingKeys(), sealed)).toThrow(UnsealError);
  });

  it('binds the recipient into the key, so a swapped public key cannot open it', () => {
    const keys = createSealingKeys();
    const sealed = seal(keys.publicKey, 'secret');
    const other = createSealingKeys();
    expect(() => unseal({ publicKey: other.publicKey, secretKey: keys.secretKey }, sealed)).toThrow(
      UnsealError,
    );
  });

  it('refuses a changed ciphertext', () => {
    const keys = createSealingKeys();
    const sealed = seal(keys.publicKey, 'secret');
    const flipped = (sealed.ciphertext.startsWith('0') ? '1' : '0') + sealed.ciphertext.slice(1);
    const error = ((): unknown => {
      try {
        unseal(keys, { ...sealed, ciphertext: flipped });
      } catch (caught) {
        return caught;
      }
      return undefined;
    })();
    expect(error).toBeInstanceOf(UnsealError);
    expect(error).toMatchObject({
      name: 'UnsealError',
      message:
        'The sealed message could not be opened with this key; it was sealed for another key or changed.',
    });
    expect(error).toHaveProperty('cause');
  });

  it('derives the key with HKDF-SHA256 over both public keys and the v1 label', () => {
    const keys = createSealingKeys();
    const sealed = seal(keys.publicKey, 'hello');
    const ephemeral = hexToBytes(sealed.ephemeral);
    const recipient = hexToBytes(keys.publicKey);
    const shared = x25519.getSharedSecret(hexToBytes(keys.secretKey), ephemeral);
    const key = hkdf(
      sha256,
      shared,
      new Uint8Array([...ephemeral, ...recipient]),
      utf8ToBytes('smarteverything/sealed/v1'),
      32,
    );
    const plain = xchacha20poly1305(key, hexToBytes(sealed.nonce)).decrypt(
      hexToBytes(sealed.ciphertext),
    );
    expect(new TextDecoder().decode(plain)).toBe('hello');
  });

  it('refuses a plaintext that is not UTF-8', () => {
    const keys = createSealingKeys();
    const ephemeralSecret = x25519.utils.randomSecretKey();
    const ephemeral = x25519.getPublicKey(ephemeralSecret);
    const recipient = hexToBytes(keys.publicKey);
    const key = hkdf(
      sha256,
      x25519.getSharedSecret(ephemeralSecret, recipient),
      new Uint8Array([...ephemeral, ...recipient]),
      utf8ToBytes('smarteverything/sealed/v1'),
      32,
    );
    const nonce = new Uint8Array(24).fill(7);
    const ciphertext = xchacha20poly1305(key, nonce).encrypt(new Uint8Array([0xff, 0xfe]));
    expect(() =>
      unseal(keys, {
        version: 1,
        ephemeral: bytesToHex(ephemeral),
        nonce: bytesToHex(nonce),
        ciphertext: bytesToHex(ciphertext),
      }),
    ).toThrow(UnsealError);
  });

  it('accepts only lower-case hex fields of the right length', () => {
    const keys = createSealingKeys();
    const sealed = seal(keys.publicKey, 'x');
    expect(SEALED.safeParse({ ...sealed, nonce: `zz${sealed.nonce.slice(2)}` }).success).toBe(
      false,
    );
    expect(SEALED.safeParse({ ...sealed, nonce: `${sealed.nonce.slice(2)}zz` }).success).toBe(
      false,
    );
    expect(SEALED.safeParse({ ...sealed, nonce: 'zz' }).success).toBe(false);
    expect(SEALED.safeParse({ ...sealed, version: 2 }).success).toBe(false);
    expect(SEALED.safeParse({ ...sealed, ciphertext: '00' }).success).toBe(false);
    expect(SEALED.safeParse({ ...sealed, ephemeral: sealed.ephemeral.slice(2) }).success).toBe(
      false,
    );
  });
});

describe('hub commands', () => {
  it('recognises hub capabilities', () => {
    expect(isHubCapability('hub:discover')).toBe(true);
    expect(isHubCapability('power')).toBe(false);
    expect(isHubCapability('raw:hub:x')).toBe(false);
  });

  it('parses every hub command', () => {
    const sealed = seal(createSealingKeys().publicKey, '{}');
    for (const command of [
      { capability: 'hub:link_provider', value: { provider: 'xiaomi', credentials: sealed } },
      { capability: 'hub:answer_prompt', value: { provider: 'tuya', answer: sealed } },
      { capability: 'hub:unlink_provider', value: { provider: 'smartthings' } },
      { capability: 'hub:discover', value: { provider: null } },
      {
        capability: 'hub:record_clip',
        value: { deviceId: '6f9a2a39-6d0b-4bde-9c8a-4f3f1a1b2c3d', seconds: 30 },
      },
    ]) {
      expect(HUB_COMMAND.parse(command)).toStrictEqual(command);
    }
  });

  it('records clips between five seconds and five minutes long', () => {
    const clip = (seconds: number): boolean =>
      HUB_COMMAND.safeParse({
        capability: 'hub:record_clip',
        value: { deviceId: '6f9a2a39-6d0b-4bde-9c8a-4f3f1a1b2c3d', seconds },
      }).success;
    expect([4, 5, 300, 301, 12.5].map(clip)).toStrictEqual([false, true, true, false, false]);
  });

  it('parses credentials for every provider', () => {
    for (const credentials of [
      { provider: 'xiaomi', username: 'person@example.com', password: 'hunter22', region: 'de' },
      {
        provider: 'tuya',
        accessId: 'access-id',
        accessSecret: 'access-secret',
        region: 'eu',
        appUserId: 'eu1666',
      },
      { provider: 'smartthings', code: 'code-123', redirectUri: 'https://example.com/cb' },
      { provider: 'samsung_tv', host: '10.0.0.5', macAddress: 'AA:bb:cc:00:11:22', name: 'TV' },
    ]) {
      expect(PROVIDER_CREDENTIALS.parse(credentials)).toStrictEqual(credentials);
    }
    for (const empty of [
      { provider: 'xiaomi', username: '', password: 'p', region: 'de' },
      { provider: 'xiaomi', username: 'u', password: '', region: 'de' },
      { provider: 'tuya', accessId: '', accessSecret: 's', region: 'eu', appUserId: 'u' },
      { provider: 'tuya', accessId: 'a', accessSecret: '', region: 'eu', appUserId: 'u' },
      { provider: 'tuya', accessId: 'a', accessSecret: 's', region: 'eu', appUserId: '' },
      { provider: 'smartthings', code: '', redirectUri: 'https://example.com/cb' },
      { provider: 'samsung_tv', host: '', macAddress: 'aa:bb:cc:dd:ee:ff', name: 'TV' },
      { provider: 'samsung_tv', host: 'h', macAddress: 'aa:bb:cc:dd:ee:ff', name: '' },
    ]) {
      expect(PROVIDER_CREDENTIALS.safeParse(empty).success).toBe(false);
    }
    expect(
      PROVIDER_CREDENTIALS.safeParse({
        provider: 'samsung_tv',
        host: 'h',
        macAddress: 'aa:bb:cc:dd:ee',
        name: 'TV',
      }).success,
    ).toBe(false);
    expect(
      PROVIDER_CREDENTIALS.safeParse({
        provider: 'samsung_tv',
        host: 'h',
        macAddress: 'aa:bb:cc:dd:ee:ff:00',
        name: 'TV',
      }).success,
    ).toBe(false);
  });

  it('parses every prompt', () => {
    for (const prompt of [
      { kind: 'captcha', image: 'data:image/png;base64,AA' },
      { kind: 'verification_code', destination: 'a***@b.c' },
      { kind: 'accept_on_device', device: 'TV' },
      { kind: 'authorize', url: 'https://example.com' },
    ]) {
      expect(PROVIDER_PROMPT.parse(prompt)).toStrictEqual(prompt);
    }
    expect(PROVIDER_PROMPT.safeParse({ kind: 'captcha', image: 'https://x' }).success).toBe(false);
  });
});
