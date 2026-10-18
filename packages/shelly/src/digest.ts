import { createHash, randomInt } from 'node:crypto';
import { z } from 'zod';
import { ShellyAuthenticationError } from './rpc-errors';

const CHALLENGE = z.object({
  auth_type: z.literal('digest'),
  nonce: z.union([z.string().min(1), z.number().int().nonnegative()]),
  realm: z.string().min(1),
  algorithm: z.literal('SHA-256'),
  nc: z.union([z.int().nonnegative(), z.string().regex(/^[0-9]+$/)]).optional(),
});
type Challenge = z.output<typeof CHALLENGE>;
export type ShellyAuth = Readonly<Record<string, string | number>>;

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function shellyPasswordHash(realm: string, password: string): string {
  return sha256(`admin:${realm}:${password}`);
}

function parseChallenge(message: string): Challenge {
  let raw: unknown;
  try {
    raw = JSON.parse(message);
  } catch (cause) {
    throw new ShellyAuthenticationError('the device challenge is malformed', cause);
  }
  const parsed = CHALLENGE.safeParse(raw);
  if (!parsed.success)
    throw new ShellyAuthenticationError('the device challenge fields are not supported');
  return parsed.data;
}

export class ShellyDigest {
  private challenge: Challenge | null = null;
  private count = 0;

  constructor(private readonly password: string | null) {}

  answer(message: string): ShellyAuth {
    const challenge = parseChallenge(message);
    const base = Number(challenge.nc ?? 1) - 1;
    this.count = this.challenge?.nonce === challenge.nonce ? Math.max(this.count, base) : base;
    this.challenge = challenge;
    return this.next(challenge);
  }

  current(): ShellyAuth | null {
    const challenge = this.challenge;
    return challenge === null || typeof challenge.nonce === 'number' || challenge.nc !== undefined
      ? null
      : this.next(challenge);
  }

  private next(challenge: Challenge): ShellyAuth {
    if (this.password === null)
      throw new ShellyAuthenticationError('a local access password is required');
    this.count += 1;
    const numeric = typeof challenge.nonce === 'number' || challenge.nc !== undefined;
    const nc = numeric ? this.count : this.count.toString(16).padStart(8, '0');
    const cnonce = randomInt(1, 2147483647);
    const ha1 = shellyPasswordHash(challenge.realm, this.password);
    const response = sha256(
      `${ha1}:${String(challenge.nonce)}:${String(nc)}:${String(cnonce)}:auth:${sha256('dummy_method:dummy_uri')}`,
    );
    return {
      realm: challenge.realm,
      username: 'admin',
      nonce: challenge.nonce,
      cnonce,
      nc,
      response,
      algorithm: 'SHA-256',
    };
  }
}
