import { gcmDecrypt, gcmEncrypt, hmacSha256Hex, md5, utf8Bytes, utf8Text } from './crypto';

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
  return md5(`${requestId}${refreshToken}`).toHex();
}

export function requestSecret(requestId: string, hashKey: string): string {
  return hmacSha256Hex(requestId, hashKey).slice(0, SECRET_LENGTH);
}

export function sealPayload(plain: string, secret: string, nonce: string): string {
  if (nonce.length !== SMART_LIFE_NONCE_LENGTH) {
    throw new SmartLifeCryptoError(
      `the nonce must be ${String(SMART_LIFE_NONCE_LENGTH)} characters, not ${String(nonce.length)}`,
    );
  }
  const iv = utf8Bytes(nonce);
  const sealed = gcmEncrypt(utf8Bytes(secret), iv, utf8Bytes(plain));
  return `${iv.toBase64()}${sealed.toBase64()}`;
}

export function openPayload(sealed: string, secret: string): string {
  try {
    const bytes = Uint8Array.fromBase64(sealed);
    const plain = gcmDecrypt(
      utf8Bytes(secret),
      bytes.subarray(0, SMART_LIFE_NONCE_LENGTH),
      bytes.subarray(SMART_LIFE_NONCE_LENGTH),
    );
    return utf8Text(plain);
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
  return hmacSha256Hex(hashKey, message);
}
