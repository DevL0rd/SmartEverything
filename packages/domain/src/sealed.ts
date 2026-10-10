import { xchacha20poly1305 } from '@noble/ciphers/chacha.js';
import { x25519 } from '@noble/curves/ed25519.js';
import { hkdf } from '@noble/hashes/hkdf.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, hexToBytes, randomBytes, utf8ToBytes } from '@noble/hashes/utils.js';
import { z } from 'zod';

const INFO = utf8ToBytes('smarteverything/sealed/v1');
const HEX = /^[0-9a-f]+$/;

export const SEALED = z.object({
  version: z.literal(1),
  ephemeral: z.string().regex(HEX).length(64),
  nonce: z.string().regex(HEX).length(48),
  ciphertext: z.string().regex(HEX).min(32),
});

export type Sealed = z.infer<typeof SEALED>;

export interface SealingKeys {
  readonly publicKey: string;
  readonly secretKey: string;
}

export class UnsealError extends Error {
  override readonly name = 'UnsealError';

  constructor(override readonly cause: unknown) {
    super(
      'The sealed message could not be opened with this key; it was sealed for another key or changed.',
    );
  }
}

function keyFor(shared: Uint8Array, ephemeral: Uint8Array, recipient: Uint8Array): Uint8Array {
  const salt = new Uint8Array([...ephemeral, ...recipient]);
  return hkdf(sha256, shared, salt, INFO, 32);
}

export function createSealingKeys(): SealingKeys {
  const secret = x25519.utils.randomSecretKey();
  return { publicKey: bytesToHex(x25519.getPublicKey(secret)), secretKey: bytesToHex(secret) };
}

export function seal(recipientPublicKey: string, message: string): Sealed {
  const recipient = hexToBytes(recipientPublicKey);
  const ephemeralSecret = x25519.utils.randomSecretKey();
  const ephemeral = x25519.getPublicKey(ephemeralSecret);
  const key = keyFor(x25519.getSharedSecret(ephemeralSecret, recipient), ephemeral, recipient);
  const nonce = randomBytes(24);
  const ciphertext = xchacha20poly1305(key, nonce).encrypt(utf8ToBytes(message));
  return {
    version: 1,
    ephemeral: bytesToHex(ephemeral),
    nonce: bytesToHex(nonce),
    ciphertext: bytesToHex(ciphertext),
  };
}

export function unseal(keys: SealingKeys, sealed: Sealed): string {
  try {
    const recipient = hexToBytes(keys.publicKey);
    const ephemeral = hexToBytes(sealed.ephemeral);
    const shared = x25519.getSharedSecret(hexToBytes(keys.secretKey), ephemeral);
    const plain = xchacha20poly1305(
      keyFor(shared, ephemeral, recipient),
      hexToBytes(sealed.nonce),
    ).decrypt(hexToBytes(sealed.ciphertext));
    return new TextDecoder('utf-8', { fatal: true }).decode(plain);
  } catch (cause) {
    throw new UnsealError(cause);
  }
}
