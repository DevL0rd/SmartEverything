import { createHash, randomBytes } from 'node:crypto';

export function newPublicToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashPublicToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
