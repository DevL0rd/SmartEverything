import { createHash } from 'node:crypto';
import type { FakeClock } from './clock';
import { ok, apiFailure, tokenFailure, type Reply } from './reply';
import { formBody, type RequestContext } from './request';
import { IDENTITY_READ, isKnownScope, normaliseScope } from './scopes';

export const FAKE_CLIENT_ID = 'fake-client.apps.googleusercontent.com';
export const FAKE_CLIENT_SECRET = 'fake-client-secret';
export const AUTHORIZATION_URL = 'https://accounts.google.com/o/oauth2/v2/auth';

const VERIFIER_PATTERN = /^[A-Za-z0-9\-._~]{43,128}$/;

export interface OAuthOptions {
  readonly clock: FakeClock;
  readonly accessTokenSeconds: number;
  readonly refreshTokenLifetimeMs: number | null;
  readonly refreshTokensPerClient: number;
  readonly codeLifetimeMs: number;
}

interface AuthorizationRequest {
  readonly clientId: string;
  readonly redirectUri: string;
  readonly scopes: readonly string[];
  readonly state: string;
  readonly challenge: string;
  readonly offline: boolean;
  readonly consentPrompt: boolean;
  readonly includeGranted: boolean;
}

interface AuthCode {
  readonly clientId: string;
  readonly redirectUri: string;
  readonly email: string;
  readonly scopes: readonly string[];
  readonly challenge: string;
  readonly offline: boolean;
  readonly consentPrompt: boolean;
  readonly expiresAtMs: number;
}

interface RefreshRecord {
  readonly token: string;
  readonly clientId: string;
  readonly email: string;
  readonly scopes: readonly string[];
  readonly issuedAtMs: number;
}

interface AccessRecord {
  readonly email: string;
  readonly scopes: readonly string[];
  readonly expiresAtMs: number;
  readonly refreshToken: string | null;
}

interface TokenGrant {
  readonly email: string;
  readonly clientId: string;
  readonly scopes: readonly string[];
  readonly refreshToken: string | null;
  readonly returnRefresh: boolean;
}

export interface ConsentResult {
  readonly redirectUrl: string;
  readonly code: string;
  readonly state: string;
}

function encodeSegment(value: unknown): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

export function subjectFor(email: string): string {
  const digest = createHash('sha256').update(email, 'utf8').digest('hex');
  return String(Number.parseInt(digest.slice(0, 12), 16));
}

function requireParam(url: URL, name: string): string {
  const value = url.searchParams.get(name);
  if (value === null || value.length === 0) {
    throw new Error(`The authorization request is missing ${name}.`);
  }
  return value;
}

export class OAuthServer {
  private readonly clients = new Map<string, string | null>();
  private readonly codes = new Map<string, AuthCode>();
  private readonly access = new Map<string, AccessRecord>();
  private readonly refresh = new Map<string, RefreshRecord>();
  private readonly revoked = new Set<string>();
  private readonly grants = new Map<string, readonly string[]>();
  private sequence = 0;
  private readonly options: OAuthOptions;

  constructor(options: OAuthOptions) {
    this.options = options;
    this.clients.set(FAKE_CLIENT_ID, FAKE_CLIENT_SECRET);
  }

  registerClient(clientId: string, clientSecret: string | null): void {
    this.clients.set(clientId, clientSecret);
  }

  consent(authorizationUrl: string, email: string): ConsentResult {
    const request = this.parseAuthorization(authorizationUrl);
    const previous = request.includeGranted
      ? (this.grants.get(grantKey(email, request.clientId)) ?? [])
      : [];
    const scopes = [...new Set([...previous, ...request.scopes])];
    const code = `4/fake-code-${String((this.sequence += 1))}`;
    this.codes.set(code, {
      clientId: request.clientId,
      redirectUri: request.redirectUri,
      email,
      scopes,
      challenge: request.challenge,
      offline: request.offline,
      consentPrompt: request.consentPrompt,
      expiresAtMs: this.options.clock.nowMs() + this.options.codeLifetimeMs,
    });
    const redirect = new URL(request.redirectUri);
    redirect.searchParams.set('code', code);
    redirect.searchParams.set('state', request.state);
    redirect.searchParams.set('scope', scopes.join(' '));
    return { redirectUrl: redirect.toString(), code, state: request.state };
  }

  deny(authorizationUrl: string): string {
    const request = this.parseAuthorization(authorizationUrl);
    const redirect = new URL(request.redirectUri);
    redirect.searchParams.set('error', 'access_denied');
    redirect.searchParams.set('state', request.state);
    return redirect.toString();
  }

  private parseAuthorization(authorizationUrl: string): AuthorizationRequest {
    const url = new URL(authorizationUrl);
    if (`${url.origin}${url.pathname}` !== AUTHORIZATION_URL) {
      throw new Error(`Not the Google authorization endpoint: ${url.origin}${url.pathname}`);
    }
    const clientId = requireParam(url, 'client_id');
    if (!this.clients.has(clientId)) throw new Error(`Unknown OAuth client ${clientId}.`);
    if (requireParam(url, 'response_type') !== 'code')
      throw new Error('response_type must be code.');
    if (requireParam(url, 'code_challenge_method') !== 'S256') {
      throw new Error('code_challenge_method must be S256.');
    }
    const scopes = requireParam(url, 'scope')
      .split(' ')
      .filter((s) => s.length > 0)
      .map(normaliseScope);
    const unknown = scopes.find((scope) => !isKnownScope(scope));
    if (unknown !== undefined) throw new Error(`invalid_scope: ${unknown}`);
    return {
      clientId,
      redirectUri: requireParam(url, 'redirect_uri'),
      scopes,
      state: requireParam(url, 'state'),
      challenge: requireParam(url, 'code_challenge'),
      offline: url.searchParams.get('access_type') === 'offline',
      consentPrompt: (url.searchParams.get('prompt') ?? '').split(' ').includes('consent'),
      includeGranted: url.searchParams.get('include_granted_scopes') === 'true',
    };
  }

  handleToken(context: RequestContext): Reply {
    const form = formBody(context);
    const clientId = this.authenticateClient(form);
    const grant = form.get('grant_type');
    if (grant === 'authorization_code') return ok(this.exchangeCode(form, clientId));
    if (grant === 'refresh_token') return ok(this.refreshAccess(form, clientId));
    throw tokenFailure(400, 'unsupported_grant_type', 'Invalid grant_type.');
  }

  private authenticateClient(form: URLSearchParams): string {
    const clientId = form.get('client_id');
    if (clientId === null) throw tokenFailure(400, 'invalid_request', 'client_id is missing.');
    const secret = this.clients.get(clientId);
    if (secret === undefined)
      throw tokenFailure(401, 'invalid_client', 'The OAuth client was not found.');
    if (secret === null) return clientId;
    const given = form.get('client_secret');
    if (given === null) throw tokenFailure(400, 'invalid_request', 'client_secret is missing.');
    if (given !== secret) throw tokenFailure(401, 'invalid_client', 'Unauthorized');
    return clientId;
  }

  private exchangeCode(form: URLSearchParams, clientId: string): Record<string, unknown> {
    const key = form.get('code') ?? '';
    const code = this.codes.get(key);
    this.codes.delete(key);
    const now = this.options.clock.nowMs();
    if (code === undefined || code.expiresAtMs <= now || code.clientId !== clientId) {
      throw tokenFailure(400, 'invalid_grant', 'Bad Request');
    }
    if (form.get('redirect_uri') !== code.redirectUri) {
      throw tokenFailure(400, 'redirect_uri_mismatch', 'Bad Request');
    }
    const verifier = form.get('code_verifier');
    if (verifier === null) throw tokenFailure(400, 'invalid_grant', 'Missing code verifier.');
    const challenge = createHash('sha256').update(verifier, 'ascii').digest('base64url');
    if (!VERIFIER_PATTERN.test(verifier) || challenge !== code.challenge) {
      throw tokenFailure(400, 'invalid_grant', 'Invalid code verifier.');
    }
    this.grants.set(grantKey(code.email, clientId), code.scopes);
    const refreshToken = this.shouldIssueRefresh(code) ? this.createRefresh(code) : null;
    return this.tokenBody({
      email: code.email,
      clientId,
      scopes: code.scopes,
      refreshToken,
      returnRefresh: refreshToken !== null,
    });
  }

  private shouldIssueRefresh(code: AuthCode): boolean {
    if (!code.offline) return false;
    return code.consentPrompt || this.activeRefresh(code.email, code.clientId).length === 0;
  }

  private activeRefresh(email: string, clientId: string): RefreshRecord[] {
    return [...this.refresh.values()].filter(
      (record) => record.email === email && record.clientId === clientId && !this.isDead(record),
    );
  }

  private createRefresh(code: AuthCode): string {
    const token = `1//fake-refresh-${String((this.sequence += 1))}`;
    this.refresh.set(token, {
      token,
      clientId: code.clientId,
      email: code.email,
      scopes: code.scopes,
      issuedAtMs: this.options.clock.nowMs(),
    });
    const active = this.activeRefresh(code.email, code.clientId);
    const surplus = active.length - this.options.refreshTokensPerClient;
    for (const stale of active.slice(0, Math.max(0, surplus))) this.revoked.add(stale.token);
    return token;
  }

  private isDead(record: RefreshRecord): boolean {
    if (this.revoked.has(record.token)) return true;
    const lifetime = this.options.refreshTokenLifetimeMs;
    return lifetime !== null && this.options.clock.nowMs() >= record.issuedAtMs + lifetime;
  }

  private refreshAccess(form: URLSearchParams, clientId: string): Record<string, unknown> {
    const record = this.refresh.get(form.get('refresh_token') ?? '');
    if (record?.clientId !== clientId || this.isDead(record)) {
      throw tokenFailure(400, 'invalid_grant', 'Token has been expired or revoked.');
    }
    return this.tokenBody({
      email: record.email,
      clientId,
      scopes: record.scopes,
      refreshToken: record.token,
      returnRefresh: false,
    });
  }

  private tokenBody(grant: TokenGrant): Record<string, unknown> {
    const { email, clientId, scopes, refreshToken, returnRefresh } = grant;
    const now = this.options.clock.nowMs();
    const accessToken = `ya29.fake-${String((this.sequence += 1))}`;
    this.access.set(accessToken, {
      email,
      scopes,
      expiresAtMs: now + this.options.accessTokenSeconds * 1000,
      refreshToken,
    });
    return {
      access_token: accessToken,
      expires_in: this.options.accessTokenSeconds,
      scope: scopes.join(' '),
      token_type: 'Bearer',
      ...(returnRefresh && refreshToken !== null ? { refresh_token: refreshToken } : {}),
      ...(scopes.includes('openid') ? { id_token: this.idToken(email, clientId, now) } : {}),
    };
  }

  private idToken(email: string, clientId: string, nowMs: number): string {
    const issued = Math.floor(nowMs / 1000);
    const claims = {
      iss: 'https://accounts.google.com',
      aud: clientId,
      sub: subjectFor(email),
      email,
      email_verified: true,
      iat: issued,
      exp: issued + this.options.accessTokenSeconds,
    };
    return `${encodeSegment({ alg: 'none', typ: 'JWT' })}.${encodeSegment(claims)}.fake`;
  }

  handleRevoke(context: RequestContext): Reply {
    const token = formBody(context).get('token') ?? '';
    if (this.access.delete(token)) return ok({});
    if (this.refresh.has(token)) {
      this.revoked.add(token);
      return ok({});
    }
    throw tokenFailure(400, 'invalid_token', 'Token expired or revoked');
  }

  userinfo(headers: Headers): Reply {
    const email = this.authenticate(headers, IDENTITY_READ);
    return ok({ sub: subjectFor(email), email, email_verified: true });
  }

  authenticate(headers: Headers, accepted: readonly string[]): string {
    const token = /^Bearer (.+)$/.exec(headers.get('authorization') ?? '')?.[1];
    const record = token === undefined ? undefined : this.access.get(token);
    if (record === undefined || this.accessDead(record)) {
      throw apiFailure(401, 'Invalid Credentials', 'authError', { location: 'Authorization' });
    }
    if (!accepted.some((scope) => record.scopes.includes(scope))) {
      throw apiFailure(
        403,
        'Request had insufficient authentication scopes.',
        'insufficientPermissions',
      );
    }
    return record.email;
  }

  private accessDead(record: AccessRecord): boolean {
    if (record.expiresAtMs <= this.options.clock.nowMs()) return true;
    return record.refreshToken !== null && this.revoked.has(record.refreshToken);
  }

  revokeRefreshToken(token: string): void {
    if (!this.refresh.has(token)) throw new Error('Unknown refresh token.');
    this.revoked.add(token);
  }

  expireAccessTokens(): void {
    this.access.clear();
  }

  refreshTokens(email: string): readonly string[] {
    return [...this.refresh.values()]
      .filter((record) => record.email === email && !this.isDead(record))
      .map((record) => record.token);
  }
}

function grantKey(email: string, clientId: string): string {
  return `${email}\u0000${clientId}`;
}
