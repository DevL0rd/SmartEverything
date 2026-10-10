import { randomBytes, randomUUID } from 'node:crypto';
import type { Clock } from '../../../clock';
import { hashSecret } from '../secrets';

const REQUEST_LIFETIME_MS = 10 * 60_000;

const CODE_LIFETIME_MS = 60_000;

const MOST_PENDING = 100;

export interface Grant {
  readonly clientId: string;
  readonly redirectUri: string;
  readonly state: string | null;
  readonly scopes: readonly string[];
  readonly resource: string;
  readonly codeChallenge: string;
}

export interface PendingRequest extends Grant {
  readonly id: string;
  readonly expiresAt: number;
}

export interface IssuedCode extends Grant {
  readonly family: string;
  readonly expiresAt: number;
}

export type Redemption =
  | { readonly kind: 'redeemed'; readonly code: IssuedCode }
  | { readonly kind: 'replayed'; readonly family: string }
  | { readonly kind: 'unknown' };

export class AuthorizationSessions {
  private readonly pending = new Map<string, PendingRequest>();
  private readonly codes = new Map<string, IssuedCode>();
  private readonly redeemed = new Map<string, IssuedCode>();

  constructor(private readonly clock: Clock) {}

  open(grant: Grant): PendingRequest {
    this.prune();
    const oldest = this.pending.keys().next();
    if (this.pending.size >= MOST_PENDING && oldest.done !== true) {
      this.pending.delete(oldest.value);
    }
    const request: PendingRequest = {
      ...grant,
      id: randomBytes(32).toString('hex'),
      expiresAt: this.now() + REQUEST_LIFETIME_MS,
    };
    this.pending.set(request.id, request);
    return request;
  }

  find(id: string): PendingRequest | undefined {
    this.prune();
    return this.pending.get(id);
  }

  close(id: string): void {
    this.pending.delete(id);
  }

  issueCode(grant: Grant): string {
    this.prune();
    const code = randomBytes(32).toString('base64url');
    this.codes.set(hashSecret(code), {
      ...grant,
      family: randomUUID(),
      expiresAt: this.now() + CODE_LIFETIME_MS,
    });
    return code;
  }

  redeem(code: string): Redemption {
    this.prune();
    const hash = hashSecret(code);
    const issued = this.codes.get(hash);
    if (issued !== undefined) {
      this.codes.delete(hash);
      this.redeemed.set(hash, { ...issued, expiresAt: this.now() + REQUEST_LIFETIME_MS });
      return { kind: 'redeemed', code: issued };
    }
    const used = this.redeemed.get(hash);
    return used === undefined ? { kind: 'unknown' } : { kind: 'replayed', family: used.family };
  }

  private now(): number {
    return this.clock.now().getTime();
  }

  private prune(): void {
    const now = this.now();
    for (const entries of [this.pending, this.codes, this.redeemed]) {
      for (const [key, entry] of entries) {
        if (entry.expiresAt <= now) {
          entries.delete(key);
        }
      }
    }
  }
}
