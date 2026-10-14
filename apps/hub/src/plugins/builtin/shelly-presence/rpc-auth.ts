import { createHash, randomInt } from 'node:crypto';
import { z } from 'zod';

const CHALLENGE = z.object({
  auth_type: z.literal('digest'),
  nonce: z.union([z.string().min(1).max(300), z.number().int().nonnegative()]),
  realm: z.string().min(1).max(100),
  algorithm: z.literal('SHA-256'),
  stale: z.boolean().optional(),
  nc: z
    .union([
      z.int().nonnegative(),
      z
        .string()
        .max(10)
        .regex(/^[0-9]+$/),
    ])
    .optional(),
});
type Challenge = z.output<typeof CHALLENGE>;
export class ShellyAuthenticationError extends Error {
  override readonly name = 'ShellyAuthenticationError';
  constructor(readonly reason: string) {
    super(`Shelly local authentication failed: ${reason}.`);
  }
}
function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
export function shellyPasswordHash(realm: string, password: string): string {
  return digest(`admin:${realm}:${password}`);
}
export class ShellyDigest {
  private readonly counts = new Map<string, number>();
  private challenge: Challenge | null = null;
  constructor(
    private readonly password: string | null,
    private readonly realm: string,
  ) {}
  answer(message: string): Readonly<Record<string, string | number>> {
    if (this.password === null)
      throw new ShellyAuthenticationError('a local access password is required');
    const challenge = authenticationChallenge(message);
    if (challenge.realm !== this.realm)
      throw new ShellyAuthenticationError(
        'the authentication realm differs from the enrolled device',
      );
    this.challenge = challenge;
    return this.next(challenge);
  }
  current(): Readonly<Record<string, string | number>> | null {
    return this.challenge === null ||
      typeof this.challenge.nonce === 'number' ||
      this.challenge.nc !== undefined
      ? null
      : this.next(this.challenge);
  }
  private next(challenge: Challenge): Readonly<Record<string, string | number>> {
    if (this.password === null)
      throw new ShellyAuthenticationError('a local access password is required');
    const key = String(challenge.nonce);
    const count = Math.max(this.counts.get(key) ?? 0, Number(challenge.nc ?? 1) - 1) + 1;
    this.counts.set(key, count);
    const oldest = this.counts.keys().next();
    if (this.counts.size > 32 && oldest.done !== true) this.counts.delete(oldest.value);
    const nc =
      typeof challenge.nonce === 'number' || challenge.nc !== undefined
        ? count
        : count.toString(16).padStart(8, '0');
    const cnonce = randomInt(1, 2147483647);
    const ha1 = shellyPasswordHash(challenge.realm, this.password);
    const response = digest(
      `${ha1}:${String(challenge.nonce)}:${String(nc)}:${String(cnonce)}:auth:${digest('dummy_method:dummy_uri')}`,
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

function authenticationChallenge(message: string): Challenge {
  let raw: unknown;
  try {
    raw = JSON.parse(message);
  } catch (cause) {
    throw new ShellyAuthenticationError(
      cause instanceof SyntaxError
        ? 'the device challenge is malformed'
        : 'the device challenge cannot be decoded',
    );
  }
  const parsed = CHALLENGE.safeParse(raw);
  if (!parsed.success)
    throw new ShellyAuthenticationError('the device challenge fields are not supported');
  return parsed.data;
}
