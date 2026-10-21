import { describe, expect, it } from 'vitest';
import type { McpTokenRow, OAuthClientRow } from '@smarteverything/domain';
import { ASSISTANTS, assistantOf, type Assistant } from './assistants';
import { assistantStatus } from './assistant-status';

const NOW = Date.parse('2026-10-16T12:00:00Z');

function client(name: string): OAuthClientRow {
  return {
    id: name,
    name,
    uri: null,
    logo_uri: null,
    redirect_uris: ['https://example.test/cb'],
    scopes: [],
    created_at: '2026-10-01T00:00:00.000Z',
    granted_at: null,
    revoked_at: null,
  };
}

function token(name: string, lastUsed: string | null, revoked: string | null = null): McpTokenRow {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    name,
    access: 'control',
    created_at: '2026-10-01T00:00:00.000Z',
    last_used_at: lastUsed,
    revoked_at: revoked,
  };
}

function assistant(key: string): Assistant {
  const found = assistantOf(key);
  if (found === null) {
    throw new Error(key);
  }
  return found;
}

describe('assistantStatus', () => {
  it('shows a sign-in assistant as connected once its client registered', () => {
    expect(assistantStatus(assistant('claude'), [client('Claude')], [], NOW)).toEqual({
      connected: true,
      text: 'Connected',
    });
    expect(assistantStatus(assistant('claude'), [client('ChatGPT')], [], NOW)).toEqual({
      connected: false,
      text: 'Not set up',
    });
  });

  it('shows a token assistant as not set up without an unrevoked token of its own', () => {
    const tokens = [
      token('Cursor on Pixel', null, '2026-10-02T00:00:00.000Z'),
      token('VS Code on Pixel', null),
    ];
    expect(assistantStatus(assistant('cursor'), [], tokens, NOW).connected).toBe(false);
  });

  it('says a token has not been used yet', () => {
    expect(assistantStatus(assistant('cursor'), [], [token('Cursor on Pixel', null)], NOW)).toEqual(
      {
        connected: true,
        text: 'Connected · not used yet',
      },
    );
  });

  it('says when the newest of its tokens was last used', () => {
    const tokens = [
      token('Cursor on Pixel', '2026-10-16T11:00:00.000Z'),
      token('Cursor on Laptop', '2026-10-14T11:00:00.000Z'),
      token('Cursor on Old', null),
    ];
    expect(assistantStatus(assistant('cursor'), [], tokens, NOW).text).toBe(
      'Connected · used 1 h ago',
    );
  });

  it('knows every assistant by key', () => {
    expect(ASSISTANTS.map((item) => item.key)).toEqual([
      'claude',
      'chatgpt',
      'cursor',
      'vscode',
      'other',
    ]);
    expect(assistantOf('nobody')).toBeNull();
  });
});
