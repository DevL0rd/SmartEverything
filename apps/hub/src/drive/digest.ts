import { webcrypto } from 'node:crypto';

export async function sha256Hex(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  return Buffer.from(await webcrypto.subtle.digest('SHA-256', bytes)).toString('hex');
}
