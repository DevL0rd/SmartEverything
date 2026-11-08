import { GOOGLE_ACCOUNT_ROW, GOOGLE_SCOPE, type GoogleAccountRow } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import type { FetchLike } from '../plugins/builtin/fetch-like';
import type { GoogleClientKind, SecretStore } from '../secrets/store';
import type {
  GoogleAccountPatch,
  GoogleAccountsRepository,
} from '../store/repositories/google-accounts';
import {
  GoogleTokenError,
  authorizationUrl,
  clientOf,
  createPkce,
  exchangeCode,
  fetchEmail,
  isGranted,
  revokeToken,
  scopesFor,
  type GoogleRequest,
} from './oauth';
import type { GoogleTokens } from './tokens';

const log = new Logger('hub.google');

export const LINK_FAILURES = [
  'client_missing',
  'state_mismatch',
  'redirect_mismatch',
  'refused',
  'no_refresh_token',
] as const;

export type LinkFailure = (typeof LINK_FAILURES)[number];

export class GoogleLinkError extends Error {
  override readonly name = 'GoogleLinkError';

  constructor(readonly failure: LinkFailure) {
    super(`The Google link failed: ${failure}.`);
  }
}

interface PendingLink {
  readonly profileId: string;
  readonly client: GoogleClientKind;
  readonly redirectUri: string;
  readonly verifier: string;
  readonly scopes: readonly string[];
  readonly before: GoogleAccountRow | null;
}

export interface BeginInput {
  readonly profileId: string;
  readonly client: GoogleClientKind;
  readonly redirectUri: string;
  readonly request: GoogleRequest;
}

export interface CompleteInput {
  readonly profileId: string;
  readonly state: string;
  readonly code: string;
  readonly redirectUri: string;
}

export interface LinkStarted {
  readonly authorizationUrl: string;
  readonly state: string;
}

export interface GoogleLinkOptions {
  readonly secrets: SecretStore;
  readonly accounts: GoogleAccountsRepository;
  readonly tokens: GoogleTokens;
  readonly fetch: FetchLike;
}

const UNLINKED: GoogleAccountPatch = {
  email: null,
  scopes: [],
  status: 'unlinked',
  problem: null,
  calendar_ids: [],
  list_ids: [],
  last_sync_at: null,
  last_error: null,
};

function linkingRow(profileId: string): GoogleAccountRow {
  return GOOGLE_ACCOUNT_ROW.parse({ ...UNLINKED, profile_id: profileId, status: 'linking' });
}

function knownScopes(granted: readonly string[]): GoogleAccountRow['scopes'] {
  return granted.flatMap((scope) => {
    const known = GOOGLE_SCOPE.safeParse(scope);
    return known.success ? [known.data] : [];
  });
}

export class GoogleLink {
  private readonly pending = new Map<string, PendingLink>();

  constructor(private readonly options: GoogleLinkOptions) {}

  begin(input: BeginInput): LinkStarted {
    const { secrets, accounts } = this.options;
    const client = clientOf(secrets.googleApp(), input.client);
    if (client === null) {
      throw new GoogleLinkError('client_missing');
    }
    this.discard(input.profileId);
    const pkce = createPkce();
    const scopes = scopesFor(input.request);
    const before = accounts.find(input.profileId) ?? null;
    this.pending.set(pkce.state, {
      profileId: input.profileId,
      client: input.client,
      redirectUri: input.redirectUri,
      verifier: pkce.verifier,
      scopes,
      before,
    });
    if (before === null) accounts.insert(linkingRow(input.profileId));
    else accounts.update(input.profileId, { status: 'linking', problem: null });
    log.info('google.link_started', { profileId: input.profileId });
    return {
      authorizationUrl: authorizationUrl({
        clientId: client.clientId,
        redirectUri: input.redirectUri,
        scopes,
        pkce,
      }),
      state: pkce.state,
    };
  }

  async complete(input: CompleteInput): Promise<GoogleAccountRow> {
    const link = this.takePending(input.state, input.profileId);
    if (link.redirectUri !== input.redirectUri) {
      this.restore(link);
      throw new GoogleLinkError('redirect_mismatch');
    }
    try {
      return await this.finish(link, input.code);
    } catch (cause) {
      this.restore(link);
      if (cause instanceof GoogleTokenError) {
        log.warn('google.link_refused', { profileId: link.profileId, reason: cause.code });
        throw new GoogleLinkError('refused');
      }
      throw cause;
    }
  }

  cancel(profileId: string, state: string): void {
    const link = this.takePending(state, profileId);
    this.restore(link);
    log.info('google.link_cancelled', { profileId });
  }

  async unlink(profileId: string): Promise<void> {
    const { secrets, accounts, tokens, fetch } = this.options;
    this.discard(profileId);
    const secret = secrets.googleAccount(profileId);
    if (secret !== null) {
      await revokeToken(fetch, secret.refreshToken).catch((cause: unknown) => {
        log.warn('google.revoke_failed', {
          profileId,
          reason: cause instanceof GoogleTokenError ? cause.code : 'unreachable',
        });
      });
      await secrets.removeGoogleAccount(profileId);
    }
    tokens.invalidate(profileId);
    if (accounts.find(profileId) !== undefined) {
      accounts.update(profileId, UNLINKED);
    }
    log.info('google.unlinked', { profileId });
  }

  private async finish(link: PendingLink, code: string): Promise<GoogleAccountRow> {
    const { secrets, accounts, tokens, fetch } = this.options;
    const client = clientOf(secrets.googleApp(), link.client);
    if (client === null) throw new GoogleLinkError('client_missing');
    const grant = await exchangeCode(fetch, client, {
      code,
      verifier: link.verifier,
      redirectUri: link.redirectUri,
    });
    const refreshToken = grant.refreshToken;
    if (refreshToken === null) throw new GoogleLinkError('no_refresh_token');
    const email = await fetchEmail(fetch, grant.accessToken);
    await secrets.saveGoogleAccount(link.profileId, {
      refreshToken,
      scopes: [...grant.scopes],
      client: link.client,
    });
    tokens.prime(link.profileId, grant);
    const missing = link.scopes.some((scope) => !isGranted(scope, grant.scopes));
    log.info('google.linked', { profileId: link.profileId, missingScopes: missing });
    return accounts.update(link.profileId, {
      email,
      scopes: knownScopes(grant.scopes),
      status: missing ? 'needs_attention' : 'linked',
      problem: missing ? 'scope_missing' : null,
      last_error: null,
    });
  }

  private takePending(state: string, profileId: string): PendingLink {
    const link = this.pending.get(state);
    if (link?.profileId !== profileId) throw new GoogleLinkError('state_mismatch');
    this.pending.delete(state);
    return link;
  }

  private discard(profileId: string): void {
    for (const [state, link] of this.pending) {
      if (link.profileId !== profileId) continue;
      this.pending.delete(state);
      this.restore(link);
    }
  }

  private restore(link: PendingLink): void {
    const { accounts } = this.options;
    if (accounts.find(link.profileId) === undefined) return;
    if (link.before === null) {
      accounts.remove(link.profileId);
      return;
    }
    const { profile_id: profileId, ...rest } = link.before;
    accounts.update(profileId, rest);
  }
}
