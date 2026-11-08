import { createHash } from 'node:crypto';

const ALPHABET = '0123456789abcdefghijklmnopqrstuv';
const ID_BYTES = 16;
const ID_PATTERN = /^[0-9a-v]{5,1024}$/;

function base32Hex(bytes: Uint8Array): string {
  let buffer = 0;
  let bits = 0;
  let out = '';
  for (const byte of bytes) {
    buffer = (buffer << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET.charAt((buffer >>> (bits - 5)) & 31);
      bits -= 5;
    }
    buffer &= (1 << bits) - 1;
  }
  if (bits > 0) out += ALPHABET.charAt((buffer << (5 - bits)) & 31);
  return out;
}

export function deterministicEventId(namespace: string, localId: string): string {
  const digest = createHash('sha256').update(`${namespace}\u0000${localId}`, 'utf8').digest();
  return base32Hex(digest.subarray(0, ID_BYTES));
}

export function isValidEventId(id: string): boolean {
  return ID_PATTERN.test(id);
}
