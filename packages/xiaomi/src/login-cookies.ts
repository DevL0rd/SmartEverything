import { z } from 'zod';
import type { VerificationMethod } from './login';

export type CookieJar = ReadonlyMap<string, string>;

const DELETED_VALUES: ReadonlySet<string> = new Set(['', 'EXPIRED', 'deleted']);

export function mergeSetCookies(jar: CookieJar, headers: readonly string[]): CookieJar {
  const next = new Map(jar);
  for (const header of headers) {
    const end = header.indexOf(';');
    const pair = end === -1 ? header : header.slice(0, end);
    const separator = pair.indexOf('=');
    if (separator > 0) {
      const name = pair.slice(0, separator).trim();
      const value = pair.slice(separator + 1).trim();
      if (DELETED_VALUES.has(value) || /;\s*max-age=0\b/i.test(header)) {
        next.delete(name);
      } else {
        next.set(name, value);
      }
    }
  }
  return next;
}

export function cookieHeader(jar: CookieJar, names: readonly string[]): string {
  return names
    .flatMap((name) => {
      const value = jar.get(name);
      return value === undefined ? [] : [`${name}=${value}`];
    })
    .join('; ');
}

export function verificationDestination(reply: unknown, method: VerificationMethod): string {
  const parsed = z
    .object({
      maskedPhone: z.string().min(1).optional(),
      maskedEmail: z.string().min(1).optional(),
    })
    .safeParse(reply);
  const masked = parsed.success
    ? method === 'Phone'
      ? parsed.data.maskedPhone
      : parsed.data.maskedEmail
    : undefined;
  return (
    masked ??
    (method === 'Phone'
      ? 'the phone number on the Xiaomi account'
      : 'the email address on the Xiaomi account')
  );
}
