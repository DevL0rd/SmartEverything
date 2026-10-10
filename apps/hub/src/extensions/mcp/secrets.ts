import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export const ACCESS_TOKEN_PREFIX = 'mca_';

export const REFRESH_TOKEN_PREFIX = 'mcr_';

export const CLIENT_SECRET_PREFIX = 'mcs_';

export function newSecret(prefix: string): string {
  return `${prefix}${randomBytes(32).toString('hex')}`;
}

export function hashSecret(secret: string): string {
  return createHash('sha256').update(secret, 'utf8').digest('hex');
}

export function sameHash(left: string, right: string): boolean {
  const a = Buffer.from(left, 'hex');
  const b = Buffer.from(right, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}

export function pkceChallengeOf(verifier: string): string {
  return createHash('sha256').update(verifier, 'ascii').digest('base64url');
}
