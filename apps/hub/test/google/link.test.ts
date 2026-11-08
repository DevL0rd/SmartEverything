import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GoogleLink, GoogleLinkError } from '../../src/google/link';
import { scopesFor } from '../../src/google/oauth';
import { GoogleRelinkRequired, GoogleTokens } from '../../src/google/tokens';
import { SecretStore } from '../../src/secrets/store';
import { StoreContext } from '../../src/store/context';
import { ChangeFeed } from '../../src/store/feed';
import { migrate } from '../../src/store/migrate';
import { MIGRATIONS } from '../../src/store/migrations';
import { GoogleAccountsRepository } from '../../src/store/repositories/google-accounts';
import { ProfilesRepository } from '../../src/store/repositories/profiles';
import { Sql } from '../../src/store/sql';
import {
  createFakeGoogle,
  FAKE_CLIENT_ID,
  FAKE_CLIENT_SECRET,
  type FakeGoogle,
} from '../fakes/google';
import { captureLogs, testLogger, type CapturedLogs } from '../support/logs';

const REDIRECT = 'http://127.0.0.1:53682/callback';
const EMAIL = 'ann@example.test';
const START = '2026-11-08T00:00:00.000Z';

let directory = '';
let google: FakeGoogle;
let secrets: SecretStore;
let accounts: GoogleAccountsRepository;
let tokens: GoogleTokens;
let link: GoogleLink;
let ann: string;
let bob: string;
let logs: CapturedLogs;

async function openSecrets(): Promise<SecretStore> {
  return SecretStore.open(join(directory, 'secrets'), Buffer.alloc(32, 7));
}

beforeEach(async () => {
  logs = captureLogs();
  directory = await mkdtemp(join(tmpdir(), 'hub-google-link-'));
  google = createFakeGoogle({ clockStepMs: 0 });
  secrets = await openSecrets();
  await secrets.saveGoogleApp({
    desktop: { clientId: FAKE_CLIENT_ID, clientSecret: FAKE_CLIENT_SECRET },
    android: null,
  });
  const sql = new Sql(new DatabaseSync(':memory:', { enableForeignKeyConstraints: true }));
  migrate(sql, MIGRATIONS, START, testLogger());
  const context = new StoreContext(sql, new ChangeFeed(testLogger('store')), () => new Date(START));
  const profiles = new ProfilesRepository(context);
  ann = profiles.create({ name: 'Ann' }).id;
  bob = profiles.create({ name: 'Bob' }).id;
  accounts = new GoogleAccountsRepository(context);
  tokens = new GoogleTokens({
    secrets,
    accounts,
    fetch: google.fetch,
    nowMs: (): number => google.clock.nowMs(),
  });
  link = new GoogleLink({ secrets, accounts, tokens, fetch: google.fetch });
});

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

function begin(profileId = ann): { url: string; state: string } {
  const started = link.begin({
    profileId,
    client: 'desktop',
    redirectUri: REDIRECT,
    request: { calendar: 'write', tasks: 'write' },
  });
  return { url: started.authorizationUrl, state: started.state };
}

async function linked(profileId = ann): Promise<void> {
  const started = begin(profileId);
  const consent = google.oauth.consent(started.url, EMAIL);
  await link.complete({
    profileId,
    state: started.state,
    code: consent.code,
    redirectUri: REDIRECT,
  });
}

function tokenRequests(): number {
  return google.requests.filter((request) => request.path === '/token').length;
}

describe('link', () => {
  it('requests only the Calendar and Tasks scopes with PKCE, offline access and consent', () => {
    const url = new URL(begin().url);
    expect(url.searchParams.get('scope')?.split(' ')).toStrictEqual(
      scopesFor({ calendar: 'write', tasks: 'write' }),
    );
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('access_type')).toBe('offline');
    expect(url.searchParams.get('prompt')).toBe('consent');
    expect(url.searchParams.get('include_granted_scopes')).toBe('true');
    expect(url.searchParams.get('code_verifier')).toBeNull();
    expect(accounts.byProfile(ann).status).toBe('linking');
  });

  it('uses the read-only scopes when asked', () => {
    expect(scopesFor({ calendar: 'read' })).toStrictEqual([
      'openid',
      'email',
      'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
      'https://www.googleapis.com/auth/calendar.events.readonly',
    ]);
  });

  it('links with the matching state, stores the email in the row and the refresh token only in the secrets', async () => {
    await linked();
    const row = accounts.byProfile(ann);
    expect(row).toMatchObject({ email: EMAIL, status: 'linked', problem: null });
    expect(row.scopes).toContain('https://www.googleapis.com/auth/tasks');
    const stored = secrets.googleAccount(ann);
    expect(stored?.refreshToken).toMatch(/^1\/\/fake-refresh-/);
    expect(JSON.stringify(row)).not.toContain(stored?.refreshToken ?? 'missing');
    expect(JSON.stringify(accounts.list())).not.toContain('refresh');
  });

  it('keeps the account in the sealed file across a reopen', async () => {
    await linked();
    const reopened = await openSecrets();
    expect(reopened.googleAccount(ann)).toStrictEqual(secrets.googleAccount(ann));
    expect(await readFile(join(directory, 'secrets'), 'utf8')).not.toContain('fake-refresh');
  });

  it('refuses a wrong state, another person state and a mismatching redirect, and still completes with the right one', async () => {
    const started = begin();
    const consent = google.oauth.consent(started.url, EMAIL);
    const attempt = (profileId: string, state: string, redirectUri = REDIRECT): Promise<unknown> =>
      link.complete({ profileId, state, code: consent.code, redirectUri });
    await expect(attempt(ann, 'forged')).rejects.toMatchObject({ failure: 'state_mismatch' });
    await expect(attempt(bob, started.state)).rejects.toMatchObject({ failure: 'state_mismatch' });
    expect(accounts.byProfile(ann).status).toBe('linking');
    await expect(attempt(ann, started.state, `${REDIRECT}/other`)).rejects.toBeInstanceOf(
      GoogleLinkError,
    );
    expect(accounts.find(ann)).toBeUndefined();
    expect(secrets.googleAccount(ann)).toBeNull();
    await expect(attempt(ann, started.state)).rejects.toMatchObject({ failure: 'state_mismatch' });
  });

  it('completes only once per state and a new begin replaces the earlier attempt', async () => {
    const first = begin();
    const second = begin();
    const consent = google.oauth.consent(second.url, EMAIL);
    await expect(
      link.complete({
        profileId: ann,
        state: first.state,
        code: consent.code,
        redirectUri: REDIRECT,
      }),
    ).rejects.toMatchObject({ failure: 'state_mismatch' });
    await link.complete({
      profileId: ann,
      state: second.state,
      code: consent.code,
      redirectUri: REDIRECT,
    });
    await expect(
      link.complete({
        profileId: ann,
        state: second.state,
        code: consent.code,
        redirectUri: REDIRECT,
      }),
    ).rejects.toMatchObject({ failure: 'state_mismatch' });
  });

  it('restores the earlier state when Google refuses the code', async () => {
    await linked();
    const started = begin();
    await expect(
      link.complete({
        profileId: ann,
        state: started.state,
        code: 'bad-code',
        redirectUri: REDIRECT,
      }),
    ).rejects.toMatchObject({ failure: 'refused' });
    expect(accounts.byProfile(ann)).toMatchObject({ status: 'linked', email: EMAIL });
    expect(secrets.googleAccount(ann)).not.toBeNull();
  });

  it('cancelling removes a row that had no earlier link', () => {
    const started = begin();
    link.cancel(ann, started.state);
    expect(accounts.find(ann)).toBeUndefined();
  });

  it('refuses to begin without a configured client', async () => {
    await secrets.update((current) => ({ ...current, googleApp: null }));
    expect(() => begin()).toThrow(GoogleLinkError);
    expect(accounts.find(ann)).toBeUndefined();
  });

  it('marks a link needing attention when a requested scope was not granted', async () => {
    const started = begin();
    const consent = google.oauth.consent(
      started.url.replace(/calendar\.events/, 'tasks.readonly'),
      EMAIL,
    );
    const row = await link.complete({
      profileId: ann,
      state: started.state,
      code: consent.code,
      redirectUri: REDIRECT,
    });
    expect(row).toMatchObject({ status: 'needs_attention', problem: 'scope_missing' });
  });
});

describe('tokens', () => {
  it('serves the access token from memory until it expires and then refreshes', async () => {
    await linked();
    const before = tokenRequests();
    const first = await tokens.accessToken(ann);
    expect(await tokens.accessToken(ann)).toBe(first);
    expect(tokenRequests()).toBe(before);
    google.clock.advance(3600 * 1000);
    const renewed = await tokens.accessToken(ann);
    expect(renewed).not.toBe(first);
    expect(tokenRequests()).toBe(before + 1);
  });

  it('shares one refresh between concurrent callers', async () => {
    await linked();
    google.clock.advance(3600 * 1000);
    const before = tokenRequests();
    const [a, b] = await Promise.all([tokens.accessToken(ann), tokens.accessToken(ann)]);
    expect(a).toBe(b);
    expect(tokenRequests()).toBe(before + 1);
  });

  it('refreshes after an invalidation', async () => {
    await linked();
    const first = await tokens.accessToken(ann);
    tokens.invalidate(ann);
    expect(await tokens.accessToken(ann)).not.toBe(first);
  });

  it('sets needs attention on invalid_grant, asks Google once and never retries', async () => {
    await linked();
    const token = secrets.googleAccount(ann)?.refreshToken ?? '';
    google.oauth.revokeRefreshToken(token);
    tokens.invalidate(ann);
    const before = tokenRequests();
    await expect(tokens.accessToken(ann)).rejects.toMatchObject({ problem: 'invalid_grant' });
    expect(tokenRequests()).toBe(before + 1);
    expect(accounts.byProfile(ann)).toMatchObject({
      status: 'needs_attention',
      problem: 'invalid_grant',
    });
    await expect(tokens.accessToken(ann)).rejects.toBeInstanceOf(GoogleRelinkRequired);
    expect(tokenRequests()).toBe(before + 1);
    expect(logs.events()).toContain('google.relink_required');
  });

  it('links again after a revocation', async () => {
    await linked();
    google.oauth.revokeRefreshToken(secrets.googleAccount(ann)?.refreshToken ?? '');
    tokens.invalidate(ann);
    await expect(tokens.accessToken(ann)).rejects.toBeInstanceOf(GoogleRelinkRequired);
    await linked();
    expect(accounts.byProfile(ann)).toMatchObject({ status: 'linked', problem: null });
    expect(await tokens.accessToken(ann)).toMatch(/^ya29\./);
  });

  it('reports a missing client as needs attention', async () => {
    await linked();
    tokens.invalidate(ann);
    await secrets.update((current) => ({ ...current, googleApp: null }));
    await expect(tokens.accessToken(ann)).rejects.toMatchObject({ problem: 'client_missing' });
    expect(accounts.byProfile(ann).status).toBe('needs_attention');
  });

  it('leaves the status alone when Google cannot be reached', async () => {
    await linked();
    tokens.invalidate(ann);
    const offline = new GoogleTokens({
      secrets,
      accounts,
      fetch: (): Promise<Response> => Promise.reject(new Error('offline')),
      nowMs: (): number => google.clock.nowMs(),
    });
    await expect(offline.accessToken(ann)).rejects.toMatchObject({ name: 'GoogleNetworkError' });
    expect(accounts.byProfile(ann).status).toBe('linked');
  });

  it('refuses an account that is not linked without asking Google', async () => {
    const before = google.requests.length;
    await expect(tokens.accessToken(bob)).rejects.toBeInstanceOf(GoogleRelinkRequired);
    expect(google.requests.length).toBe(before);
  });
});

describe('unlink', () => {
  it('revokes the token, forgets the secret, clears the row and keeps the other people', async () => {
    await linked();
    await linked(bob);
    const token = secrets.googleAccount(ann)?.refreshToken ?? '';
    await link.unlink(ann);
    expect(secrets.googleAccount(ann)).toBeNull();
    expect(accounts.byProfile(ann)).toMatchObject({ status: 'unlinked', email: null, scopes: [] });
    expect(google.oauth.refreshTokens(EMAIL)).not.toContain(token);
    expect(secrets.googleAccount(bob)).not.toBeNull();
    expect(accounts.byProfile(bob).status).toBe('linked');
    await expect(tokens.accessToken(ann)).rejects.toBeInstanceOf(GoogleRelinkRequired);
  });

  it('logs and goes on when Google refuses the revocation', async () => {
    await linked();
    const failing = new GoogleLink({
      secrets,
      accounts,
      tokens,
      fetch: (url, init): Promise<Response> =>
        url.endsWith('/revoke')
          ? Promise.resolve(new Response('{}', { status: 500 }))
          : google.fetch(url, init),
    });
    await failing.unlink(ann);
    expect(secrets.googleAccount(ann)).toBeNull();
    expect(logs.events()).toContain('google.revoke_failed');
  });
});

describe('secrecy', () => {
  it('puts no token, code or verifier into any row, log line or event', async () => {
    const started = begin();
    const consent = google.oauth.consent(started.url, EMAIL);
    await link.complete({
      profileId: ann,
      state: started.state,
      code: consent.code,
      redirectUri: REDIRECT,
    });
    const access = await tokens.accessToken(ann);
    google.clock.advance(3600 * 1000);
    await tokens.accessToken(ann);
    google.oauth.revokeRefreshToken(secrets.googleAccount(ann)?.refreshToken ?? '');
    tokens.invalidate(ann);
    await expect(tokens.accessToken(ann)).rejects.toBeInstanceOf(GoogleRelinkRequired);
    const visible = JSON.stringify([logs.records, accounts.list()]);
    for (const secret of [
      secrets.googleAccount(ann)?.refreshToken ?? '',
      access,
      consent.code,
      FAKE_CLIENT_SECRET,
    ]) {
      expect(secret.length).toBeGreaterThan(0);
      expect(visible).not.toContain(secret);
    }
  });
});
