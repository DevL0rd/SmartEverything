import type { GoogleProblem } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import type { FetchLike } from '../plugins/builtin/fetch-like';
import type { SecretStore } from '../secrets/store';
import type { GoogleAccountsRepository } from '../store/repositories/google-accounts';
import { GoogleTokenError, clientOf, refreshAccess, type AccessGrant } from './oauth';

const log = new Logger('hub.google');

export class GoogleRelinkRequired extends Error {
  override readonly name = 'GoogleRelinkRequired';

  constructor(
    readonly profileId: string,
    readonly problem: GoogleProblem | null,
  ) {
    super('The Google account must be linked again.');
  }
}

interface CachedAccess {
  readonly token: string;
  readonly expiresAtMs: number;
}

export interface TokenProviderOptions {
  readonly secrets: SecretStore;
  readonly accounts: GoogleAccountsRepository;
  readonly fetch: FetchLike;
  readonly nowMs: () => number;
}

export class GoogleTokens {
  private readonly cache = new Map<string, CachedAccess>();
  private readonly pending = new Map<string, Promise<string>>();

  constructor(private readonly options: TokenProviderOptions) {}

  prime(profileId: string, grant: Pick<AccessGrant, 'accessToken' | 'expiresInSeconds'>): void {
    this.cache.set(profileId, {
      token: grant.accessToken,
      expiresAtMs: this.options.nowMs() + grant.expiresInSeconds * 1000,
    });
  }

  invalidate(profileId: string): void {
    this.cache.delete(profileId);
  }

  async accessToken(profileId: string): Promise<string> {
    const row = this.options.accounts.find(profileId);
    if (row?.status !== 'linked') throw new GoogleRelinkRequired(profileId, row?.problem ?? null);
    const cached = this.cache.get(profileId);
    if (cached !== undefined && cached.expiresAtMs > this.options.nowMs()) return cached.token;
    const running = this.pending.get(profileId);
    if (running !== undefined) return running;
    const refresh = this.refresh(profileId).finally(() => this.pending.delete(profileId));
    this.pending.set(profileId, refresh);
    return refresh;
  }

  private async refresh(profileId: string): Promise<string> {
    const { secrets, fetch } = this.options;
    const secret = secrets.googleAccount(profileId);
    const client = secret === null ? null : clientOf(secrets.googleApp(), secret.client);
    if (secret === null || client === null) {
      const problem = secret === null ? 'unknown' : 'client_missing';
      this.needsAttention(profileId, problem);
      throw new GoogleRelinkRequired(profileId, problem);
    }
    try {
      const grant = await refreshAccess(fetch, client, secret.refreshToken);
      this.prime(profileId, grant);
      return grant.accessToken;
    } catch (cause) {
      if (cause instanceof GoogleTokenError && cause.code === 'invalid_grant') {
        this.invalidate(profileId);
        this.needsAttention(profileId, 'invalid_grant');
        throw new GoogleRelinkRequired(profileId, 'invalid_grant');
      }
      throw cause;
    }
  }

  private needsAttention(profileId: string, problem: GoogleProblem): void {
    this.options.accounts.update(profileId, {
      status: 'needs_attention',
      problem,
      last_error: problem,
    });
    log.warn('google.relink_required', { profileId, problem });
  }
}
