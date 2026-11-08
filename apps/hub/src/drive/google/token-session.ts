import type { Logger } from '@smarteverything/logging';
import type { FetchLike } from '../../plugins/builtin/fetch-like';
import {
  GoogleTokenError,
  refreshAccess,
  revokeToken,
  type CodeGrant,
  type GoogleClient,
} from '../../google/oauth';
import { GoogleImportError } from './errors';

export interface TokenSessionDeps {
  readonly fetch: FetchLike;
  readonly client: GoogleClient;
  readonly now: () => Date;
  readonly log: Logger;
}

interface Held {
  access: string;
  refresh: string | null;
  expiresAtMs: number;
}

export class TokenSession {
  private held: Held | null;
  private renewing: Promise<string> | null = null;

  constructor(
    private readonly deps: TokenSessionDeps,
    grant: CodeGrant,
  ) {
    this.held = {
      access: grant.accessToken,
      refresh: grant.refreshToken,
      expiresAtMs: deps.now().getTime() + grant.expiresInSeconds * 1000,
    };
  }

  isHeld(): boolean {
    return this.held !== null;
  }

  async accessToken(): Promise<string> {
    const held = this.require();
    return held.expiresAtMs <= this.deps.now().getTime() ? this.renew() : held.access;
  }

  renew(): Promise<string> {
    this.renewing ??= this.refreshNow().finally(() => {
      this.renewing = null;
    });
    return this.renewing;
  }

  async discard(): Promise<void> {
    const held = this.held;
    this.held = null;
    if (held === null) {
      return;
    }
    try {
      await revokeToken(this.deps.fetch, held.refresh ?? held.access);
    } catch (cause) {
      this.deps.log.warn('google_import.revoke_failed', {
        reason: cause instanceof GoogleTokenError ? cause.code : 'unreachable',
      });
    }
  }

  private require(): Held {
    if (this.held === null) {
      throw new GoogleImportError('token_discarded');
    }
    return this.held;
  }

  private async refreshNow(): Promise<string> {
    const held = this.require();
    if (held.refresh === null) {
      throw new GoogleImportError('consent_expired');
    }
    try {
      const grant = await refreshAccess(this.deps.fetch, this.deps.client, held.refresh);
      held.access = grant.accessToken;
      held.expiresAtMs = this.deps.now().getTime() + grant.expiresInSeconds * 1000;
      return held.access;
    } catch (cause) {
      if (cause instanceof GoogleTokenError) {
        throw new GoogleImportError('consent_expired', cause);
      }
      throw new GoogleImportError('google_unreachable', cause);
    }
  }
}
