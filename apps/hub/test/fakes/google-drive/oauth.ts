import { createHash } from 'node:crypto';
import { SCOPE_DRIVE_READONLY, SCOPE_PHOTOS_PICKER } from '../../../src/drive/google/scopes';

export const DRIVE_CLIENT = { clientId: 'fake-drive-client', clientSecret: 'fake-drive-secret' };

const KNOWN_SCOPES: readonly string[] = [SCOPE_DRIVE_READONLY, SCOPE_PHOTOS_PICKER];

interface Code {
  readonly redirectUri: string;
  readonly scopes: readonly string[];
  readonly challenge: string;
  readonly offline: boolean;
}

interface Access {
  readonly refresh: string | null;
  readonly scopes: readonly string[];
  expired: boolean;
}

export interface Consented {
  readonly redirectUrl: string;
  readonly code: string;
  readonly state: string;
  readonly scopes: readonly string[];
}

export interface TokenReply {
  readonly status: number;
  readonly body: unknown;
}

function required(url: URL, name: string): string {
  const value = url.searchParams.get(name);
  if (value === null || value === '') {
    throw new Error(`The authorization request lacks ${name}.`);
  }
  return value;
}

export class FakeOAuth {
  private readonly codes = new Map<string, Code>();
  private readonly access = new Map<string, Access>();
  private readonly refresh = new Map<string, readonly string[]>();
  readonly revoked = new Set<string>();
  readonly issued: string[] = [];
  refreshes = 0;
  private sequence = 0;

  consent(authorizationUrl: string, only?: readonly string[]): Consented {
    const url = new URL(authorizationUrl);
    if (`${url.origin}${url.pathname}` !== 'https://accounts.google.com/o/oauth2/v2/auth') {
      throw new Error('Not the Google authorization endpoint.');
    }
    if (required(url, 'client_id') !== DRIVE_CLIENT.clientId) {
      throw new Error('Unknown client.');
    }
    if (
      required(url, 'code_challenge_method') !== 'S256' ||
      required(url, 'response_type') !== 'code'
    ) {
      throw new Error('PKCE with the S256 method and the code flow are required.');
    }
    const asked = required(url, 'scope').split(' ');
    const unknown = asked.find((scope) => !KNOWN_SCOPES.includes(scope));
    if (unknown !== undefined) {
      throw new Error(`invalid_scope: ${unknown}`);
    }
    const scopes = only ?? asked;
    this.sequence += 1;
    const code = `fake-code-${String(this.sequence)}`;
    const redirectUri = required(url, 'redirect_uri');
    this.codes.set(code, {
      redirectUri,
      scopes,
      challenge: required(url, 'code_challenge'),
      offline: url.searchParams.get('access_type') === 'offline',
    });
    const state = required(url, 'state');
    const redirect = new URL(redirectUri);
    redirect.searchParams.set('code', code);
    redirect.searchParams.set('state', state);
    redirect.searchParams.set('scope', scopes.join(' '));
    return { redirectUrl: redirect.toString(), code, state, scopes };
  }

  deny(authorizationUrl: string): string {
    const url = new URL(authorizationUrl);
    const redirect = new URL(required(url, 'redirect_uri'));
    redirect.searchParams.set('error', 'access_denied');
    redirect.searchParams.set('state', required(url, 'state'));
    return redirect.toString();
  }

  expireAccess(): void {
    for (const record of this.access.values()) {
      record.expired = true;
    }
  }

  allows(headers: Headers, scope: string): boolean {
    const token = headers.get('authorization')?.replace(/^Bearer /, '') ?? '';
    const record = this.access.get(token);
    if (record === undefined || record.expired || this.revoked.has(token)) {
      return false;
    }
    if (record.refresh !== null && this.revoked.has(record.refresh)) {
      return false;
    }
    return record.scopes.includes(scope);
  }

  token(form: URLSearchParams): TokenReply {
    if (
      form.get('client_id') !== DRIVE_CLIENT.clientId ||
      form.get('client_secret') !== DRIVE_CLIENT.clientSecret
    ) {
      return { status: 401, body: { error: 'invalid_client' } };
    }
    const grant = form.get('grant_type');
    if (grant === 'authorization_code') {
      return this.exchange(form);
    }
    if (grant === 'refresh_token') {
      return this.renewal(form);
    }
    return { status: 400, body: { error: 'unsupported_grant_type' } };
  }

  revoke(form: URLSearchParams): TokenReply {
    const token = form.get('token') ?? '';
    this.revoked.add(token);
    return { status: 200, body: {} };
  }

  private exchange(form: URLSearchParams): TokenReply {
    const code = this.codes.get(form.get('code') ?? '');
    this.codes.delete(form.get('code') ?? '');
    const verifier = form.get('code_verifier') ?? '';
    const challenge = createHash('sha256').update(verifier, 'ascii').digest('base64url');
    if (code?.redirectUri !== form.get('redirect_uri') || code.challenge !== challenge) {
      return { status: 400, body: { error: 'invalid_grant' } };
    }
    const refresh = code.offline ? this.mint('refresh') : null;
    if (refresh !== null) {
      this.refresh.set(refresh, code.scopes);
    }
    return { status: 200, body: this.issue(refresh, code.scopes, true) };
  }

  private renewal(form: URLSearchParams): TokenReply {
    const refresh = form.get('refresh_token') ?? '';
    const scopes = this.refresh.get(refresh);
    if (scopes === undefined || this.revoked.has(refresh)) {
      return { status: 400, body: { error: 'invalid_grant' } };
    }
    this.refreshes += 1;
    return { status: 200, body: this.issue(refresh, scopes, false) };
  }

  private issue(
    refresh: string | null,
    scopes: readonly string[],
    returnRefresh: boolean,
  ): Record<string, unknown> {
    const token = this.mint('access');
    this.access.set(token, { refresh, scopes, expired: false });
    this.issued.push(token);
    return {
      access_token: token,
      expires_in: 3599,
      scope: scopes.join(' '),
      ...(refresh === null || !returnRefresh ? {} : { refresh_token: refresh }),
    };
  }

  private mint(kind: string): string {
    this.sequence += 1;
    return `fake-${kind}-${String(this.sequence)}`;
  }
}
