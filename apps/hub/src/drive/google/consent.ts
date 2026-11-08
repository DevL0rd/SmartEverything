import {
  GoogleTokenError,
  authorizationUrl,
  createPkce,
  exchangeCode,
  type CodeGrant,
  type GoogleClient,
} from '../../google/oauth';
import type { FetchLike } from '../../plugins/builtin/fetch-like';
import { GoogleImportError } from './errors';
import type { ImportSelection } from './ledger';
import { SCOPE_DRIVE_READONLY, SCOPE_PHOTOS_PICKER } from './scopes';

interface Pending {
  readonly importId: string;
  readonly profileId: string;
  readonly redirectUri: string;
  readonly verifier: string;
}

export interface ConsentStarted {
  readonly authorizationUrl: string;
  readonly state: string;
}

export interface Consented {
  readonly importId: string;
  readonly grant: CodeGrant;
}

export function scopesOf(selection: ImportSelection): readonly string[] {
  return [
    ...(selection.drive ? [SCOPE_DRIVE_READONLY] : []),
    ...(selection.photos ? [SCOPE_PHOTOS_PICKER] : []),
  ];
}

export class Consents {
  private readonly pending = new Map<string, Pending>();

  constructor(
    private readonly fetch: FetchLike,
    private readonly client: () => GoogleClient | null,
  ) {}

  begin(input: {
    readonly importId: string;
    readonly profileId: string;
    readonly redirectUri: string;
    readonly selection: ImportSelection;
  }): ConsentStarted {
    const client = this.require();
    this.drop(input.importId);
    const pkce = createPkce();
    this.pending.set(pkce.state, {
      importId: input.importId,
      profileId: input.profileId,
      redirectUri: input.redirectUri,
      verifier: pkce.verifier,
    });
    return {
      authorizationUrl: authorizationUrl({
        clientId: client.clientId,
        redirectUri: input.redirectUri,
        scopes: scopesOf(input.selection),
        pkce,
      }),
      state: pkce.state,
    };
  }

  async complete(input: {
    readonly profileId: string;
    readonly state: string;
    readonly code: string;
    readonly redirectUri: string;
  }): Promise<Consented> {
    const pending = this.pending.get(input.state);
    if (pending?.profileId !== input.profileId) {
      throw new GoogleImportError('state_mismatch');
    }
    if (pending.redirectUri !== input.redirectUri) {
      throw new GoogleImportError('redirect_mismatch');
    }
    this.pending.delete(input.state);
    try {
      const grant = await exchangeCode(this.fetch, this.require(), {
        code: input.code,
        verifier: pending.verifier,
        redirectUri: pending.redirectUri,
      });
      return { importId: pending.importId, grant };
    } catch (cause) {
      if (cause instanceof GoogleTokenError) {
        throw new GoogleImportError('consent_refused', cause);
      }
      throw new GoogleImportError('google_unreachable', cause);
    }
  }

  drop(importId: string): void {
    for (const [state, pending] of this.pending) {
      if (pending.importId === importId) {
        this.pending.delete(state);
      }
    }
  }

  require(): GoogleClient {
    const client = this.client();
    if (client === null) {
      throw new GoogleImportError('client_missing');
    }
    return client;
  }
}
