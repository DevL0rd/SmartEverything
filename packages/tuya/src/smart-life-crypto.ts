import { gcm } from '@noble/ciphers/aes.js';
import { hmac } from '@noble/hashes/hmac.js';
import { md5 } from '@noble/hashes/legacy.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';

export const SMART_LIFE_NONCE_LENGTH = 12;

const SECRET_LENGTH = 16;

const SIGNED_HEADERS = ['X-appKey', 'X-requestId', 'X-sid', 'X-time', 'X-token'] as const;

type SmartLifeHeaderName = (typeof SIGNED_HEADERS)[number];

export type SmartLifeHeaders = Readonly<Record<SmartLifeHeaderName, string>>;

export class SmartLifeCryptoError extends Error {
  override readonly name = 'SmartLifeCryptoError';

  constructor(readonly reason: string) {
    super(`A Smart Life request or reply could not be sealed or opened: ${reason}.`);
  }
}

export function requestHashKey(requestId: string, refreshToken: string): string {
  return bytesToHex(md5(utf8ToBytes(`${requestId}${refreshToken}`)));
}

export function requestSecret(requestId: string, hashKey: string): string {
  return bytesToHex(hmac(sha256, utf8ToBytes(requestId), utf8ToBytes(hashKey))).slice(
    0,
    SECRET_LENGTH,
  );
}

export function sealPayload(plain: string, secret: string, nonce: string): string {
  if (nonce.length !== SMART_LIFE_NONCE_LENGTH) {
    throw new SmartLifeCryptoError(
      `the nonce must be ${String(SMART_LIFE_NONCE_LENGTH)} characters, not ${String(nonce.length)}`,
    );
  }
  const iv = utf8ToBytes(nonce);
  const sealed = gcm(utf8ToBytes(secret), iv).encrypt(utf8ToBytes(plain));
  return `${iv.toBase64()}${sealed.toBase64()}`;
}

export function openPayload(sealed: string, secret: string): string {
  try {
    const bytes = Uint8Array.fromBase64(sealed);
    const plain = gcm(utf8ToBytes(secret), bytes.subarray(0, SMART_LIFE_NONCE_LENGTH)).decrypt(
      bytes.subarray(SMART_LIFE_NONCE_LENGTH),
    );
    return new TextDecoder('utf-8', { fatal: true }).decode(plain);
  } catch (cause) {
    throw new SmartLifeCryptoError(`the reply did not decrypt (${String(cause)})`);
  }
}

export function signRequest(
  hashKey: string,
  headers: SmartLifeHeaders,
  sealedQuery: string,
  sealedBody: string,
): string {
  const signedHeaders = SIGNED_HEADERS.filter((name) => headers[name] !== '')
    .map((name) => `${name}=${headers[name]}`)
    .join('||');
  const message = `${signedHeaders}${sealedQuery}${sealedBody}`;
  return bytesToHex(hmac(sha256, utf8ToBytes(hashKey), utf8ToBytes(message)));
}
