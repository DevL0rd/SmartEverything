import { createHash } from 'node:crypto';

export type DigestAlgorithm = 'md5' | 'sha1' | 'sha256';

export function digest(algorithm: DigestAlgorithm, ...parts: readonly Uint8Array[]): Uint8Array {
  const hash = createHash(algorithm);
  for (const part of parts) {
    hash.update(part);
  }
  return Uint8Array.from(hash.digest());
}

export function utf8ToBytes(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

export function bytesToUtf8(bytes: Uint8Array): string {
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}
