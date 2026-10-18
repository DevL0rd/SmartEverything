import type { RowChange } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { NewOAuthClient, NewOAuthToken } from '../../src/store/repositories/oauth';
import { captureLogs } from '../support/logs';
import { testStore, type TestStore } from '../support/store';

let opened: TestStore;
let clock: number;
let changes: RowChange[];
let clientId = '';

const CLIENT: NewOAuthClient = {
  name: 'Claude',
  uri: 'https://claude.example',
  logoUri: null,
  redirectUris: ['https://claude.example/callback'],
  scopes: ['mcp'],
  authMethod: 'client_secret_post',
  secretHash: 'a'.repeat(64),
};

function token(hash: string, overrides: Partial<NewOAuthToken> = {}): NewOAuthToken {
  return {
    tokenHash: hash,
    kind: 'access',
    clientId,
    family: 'family-1',
    scopes: ['mcp'],
    resource: 'https://hub.example/mcp',
    expiresAt: new Date(clock + 3_600_000).toISOString(),
    ...overrides,
  };
}

beforeEach(async () => {
  captureLogs();
  clock = Date.parse('2026-10-08T10:00:00.000Z');
  opened = await testStore(() => new Date(clock));
  clientId = opened.store.oauth.register(CLIENT).id;
  changes = [];
  opened.store.feed.subscribe((change) => {
    changes.push(change);
  });
});

afterEach(async () => {
  await opened.close();
});

describe('OAuth clients', () => {
  it('registers a client with its lists and announces it, without exposing the secret', () => {
    changes.length = 0;
    const row = opened.store.oauth.register(CLIENT);
    expect(row).toMatchObject({
      name: 'Claude',
      redirect_uris: ['https://claude.example/callback'],
      scopes: ['mcp'],
      granted_at: null,
      revoked_at: null,
    });
    expect(JSON.stringify(row)).not.toContain('a'.repeat(64));
    expect(changes.filter((change) => change.table === 'oauth_clients')).toMatchObject([
      { operation: 'INSERT' },
    ]);
  });

  it('finds a client with its authentication method and secret hash, or nothing', () => {
    const row = opened.store.oauth.register(CLIENT);
    expect(opened.store.oauth.findClient(row.id)).toEqual({
      row,
      authMethod: 'client_secret_post',
      secretHash: 'a'.repeat(64),
    });
    expect(opened.store.oauth.findClient('missing')).toBeUndefined();
  });

  it('grant replaces the scopes, stamps the time and clears an earlier revocation', () => {
    const row = opened.store.oauth.register(CLIENT);
    clock += 1000;
    const granted = opened.store.oauth.grant(row.id, ['mcp', 'files']);
    expect(granted.scopes).toEqual(['mcp', 'files']);
    expect(granted.granted_at).toBe('2026-10-08T10:00:01.000Z');
    expect(granted.revoked_at).toBeNull();
    expect(changes.at(-1)).toMatchObject({ table: 'oauth_clients', operation: 'UPDATE' });
    expect(() => opened.store.oauth.grant('missing', [])).toThrow();
  });

  it('counts clients nobody approved since a moment and forgets the older ones only', () => {
    opened.store.oauth.forgetUnapprovedBefore(new Date(clock + 1000).toISOString());
    changes.length = 0;
    const old = opened.store.oauth.register(CLIENT);
    const approved = opened.store.oauth.register(CLIENT);
    opened.store.oauth.grant(approved.id, ['mcp']);
    clock += 3_600_000;
    const recent = opened.store.oauth.register(CLIENT);
    const cutoff = new Date(clock - 1000).toISOString();
    expect(opened.store.oauth.unapprovedSince(cutoff)).toBe(1);
    expect(opened.store.oauth.forgetUnapprovedBefore(cutoff)).toBe(1);
    expect(opened.store.oauth.findClient(old.id)).toBeUndefined();
    expect(opened.store.oauth.findClient(approved.id)).toBeDefined();
    expect(opened.store.oauth.findClient(recent.id)).toBeDefined();
    expect(changes.filter((change) => change.operation === 'DELETE')).toHaveLength(1);
  });
});

describe('OAuth tokens', () => {
  it('stores a token with its scopes and creation time and reads it back by hash', () => {
    opened.store.oauth.issue([token('h1', { scopes: ['mcp', 'files'] })]);
    expect(opened.store.oauth.token('h1')).toMatchObject({
      kind: 'access',
      client_id: clientId,
      scopes: ['mcp', 'files'],
      created_at: '2026-10-08T10:00:00.000Z',
      used_at: null,
    });
    expect(opened.store.oauth.token('other')).toBeUndefined();
  });

  it('issues a pair together or not at all', () => {
    opened.store.oauth.issue([token('h1')]);
    expect(() => {
      opened.store.oauth.issue([token('h2', { kind: 'refresh' }), token('h1')]);
    }).toThrow();
    expect(opened.store.oauth.token('h2')).toBeUndefined();
  });

  it('lets a refresh token be used once and never counts an access token as used', () => {
    opened.store.oauth.issue([token('access'), token('refresh', { kind: 'refresh' })]);
    expect(opened.store.oauth.useRefreshToken('access')).toBe(false);
    expect(opened.store.oauth.useRefreshToken('refresh')).toBe(true);
    expect(opened.store.oauth.useRefreshToken('refresh')).toBe(false);
    expect(opened.store.oauth.token('refresh')?.used_at).toBe('2026-10-08T10:00:00.000Z');
    expect(opened.store.oauth.useRefreshToken('missing')).toBe(false);
  });

  it('revokes a whole family or a single token and reports how many went', () => {
    opened.store.oauth.issue([
      token('a1'),
      token('r1', { kind: 'refresh' }),
      token('a2', { family: 'family-2' }),
    ]);
    expect(opened.store.oauth.revokeToken('a1')).toBe(1);
    expect(opened.store.oauth.revokeToken('a1')).toBe(0);
    expect(opened.store.oauth.revokeFamily('family-1')).toBe(1);
    expect(opened.store.oauth.token('r1')).toBeUndefined();
    expect(opened.store.oauth.token('a2')).toBeDefined();
  });

  it('forgets tokens only after they expire', () => {
    opened.store.oauth.issue([
      token('short', { expiresAt: new Date(clock + 1000).toISOString() }),
      token('long'),
    ]);
    expect(opened.store.oauth.forgetExpiredTokens()).toBe(0);
    clock += 2000;
    expect(opened.store.oauth.forgetExpiredTokens()).toBe(1);
    expect(opened.store.oauth.token('short')).toBeUndefined();
    expect(opened.store.oauth.token('long')).toBeDefined();
  });
});

describe('personal MCP tokens', () => {
  it('records when a token was last used and announces the change', () => {
    const created = opened.store.oauth.createPersonalToken('Laptop', 'b'.repeat(64));
    expect(created.last_used_at).toBeNull();
    clock += 5000;
    const used = opened.store.oauth.personalTokenUsed(created.id);
    expect(used.last_used_at).toBe('2026-10-08T10:00:05.000Z');
    expect(changes.at(-1)).toMatchObject({ table: 'mcp_tokens', operation: 'UPDATE' });
    expect(() => opened.store.oauth.personalTokenUsed('missing')).toThrow();
  });
});
