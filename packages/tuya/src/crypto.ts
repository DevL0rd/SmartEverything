import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  type Cipheriv,
  type Decipheriv,
} from 'node:crypto';

const TAG_LENGTH = 16;

export function utf8Bytes(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

export function utf8Text(bytes: Uint8Array): string {
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

export function md5(data: string | Uint8Array): Uint8Array {
  return Uint8Array.from(createHash('md5').update(data).digest());
}

export function sha256Hex(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

export function hmacSha256Hex(key: string, message: string): string {
  return createHmac('sha256', key).update(message).digest('hex');
}

function finish(cipher: Cipheriv | Decipheriv, input: Uint8Array): Buffer {
  return Buffer.concat([cipher.update(input), cipher.final()]);
}

export function ecbDecrypt(key: Uint8Array, data: Uint8Array): Uint8Array {
  return Uint8Array.from(finish(createDecipheriv('aes-128-ecb', key, null), data));
}

export function gcmEncrypt(key: Uint8Array, nonce: Uint8Array, plain: Uint8Array): Uint8Array {
  const cipher = createCipheriv('aes-128-gcm', key, nonce);
  const body = finish(cipher, plain);
  return Uint8Array.from(Buffer.concat([body, cipher.getAuthTag()]));
}

export function gcmDecrypt(
  key: Uint8Array,
  nonce: Uint8Array,
  sealed: Uint8Array,
  header?: Uint8Array,
): Uint8Array {
  const decipher = createDecipheriv('aes-128-gcm', key, nonce);
  if (header !== undefined) {
    decipher.setAAD(header);
  }
  decipher.setAuthTag(sealed.subarray(sealed.length - TAG_LENGTH));
  return Uint8Array.from(finish(decipher, sealed.subarray(0, sealed.length - TAG_LENGTH)));
}
