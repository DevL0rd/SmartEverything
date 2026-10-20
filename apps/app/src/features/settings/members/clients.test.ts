import { describe, expect, it } from 'vitest';
import type { ClientRow } from '@smarteverything/domain';
import { clientViews, livePending, newlyPaired, shownRole } from './clients';

const NOW = Date.parse('2026-10-16T12:00:00.000Z');

function client(id: string, change: Partial<ClientRow> = {}): ClientRow {
  return {
    id,
    name: id,
    platform: 'android',
    kind: 'phone',
    role: 'member',
    built_in: false,
    profile_id: null,
    created_at: '2026-10-01T00:00:00.000Z',
    last_seen_at: null,
    ...change,
  };
}

describe('clientViews', () => {
  it('lists this device first, then built-in clients, then the rest by creation time', () => {
    const views = clientViews(
      [
        client('late', { created_at: '2026-10-05T00:00:00.000Z' }),
        client('built-in', { built_in: true, created_at: '2026-10-09T00:00:00.000Z' }),
        client('early', { created_at: '2026-10-02T00:00:00.000Z' }),
        client('me', { created_at: '2026-10-08T00:00:00.000Z' }),
      ],
      'me',
      NOW,
    );
    expect(views.map((view) => view.client.id)).toEqual(['me', 'built-in', 'early', 'late']);
    expect(views.map((view) => view.you)).toEqual([true, false, false, false]);
  });

  it('does not reorder the list it was given', () => {
    const clients = [client('b'), client('a', { created_at: '2026-09-01T00:00:00.000Z' })];
    clientViews(clients, 'none', NOW);
    expect(clients.map((entry) => entry.id)).toEqual(['b', 'a']);
  });

  it('lets only other, non built-in clients be removed', () => {
    const views = clientViews(
      [client('me'), client('built-in', { built_in: true }), client('other')],
      'me',
      NOW,
    );
    expect(views.map((view) => [view.client.id, view.removable])).toEqual([
      ['me', false],
      ['built-in', false],
      ['other', true],
    ]);
  });

  it('describes each client by platform, role and when it was last seen', () => {
    const views = clientViews(
      [
        client('me', {
          platform: 'desktop',
          role: 'owner',
          last_seen_at: '2026-10-16T12:00:00.000Z',
        }),
        client('never', { platform: 'web' }),
        client('seen', { last_seen_at: '2026-10-16T09:00:00.000Z' }),
      ],
      'me',
      NOW,
    );
    expect(views.map((view) => view.detail)).toEqual([
      'Desktop app · Owner · This device',
      'Browser · Member · Never connected',
      'Android · Member · Seen 3 h ago',
    ]);
  });
});

describe('newlyPaired', () => {
  it('returns the first client that was not known before', () => {
    const clients = [client('a'), client('b'), client('c')];
    expect(newlyPaired(clients, new Set(['a']))?.id).toBe('b');
  });

  it('returns null when every client is already known', () => {
    expect(newlyPaired([client('a')], new Set(['a']))).toBeNull();
    expect(newlyPaired([], new Set())).toBeNull();
  });
});

describe('shownRole', () => {
  it('shows the stored role when nothing is pending', () => {
    expect(shownRole('member', null)).toBe('member');
  });

  it('shows the chosen role while the change is on its way', () => {
    expect(shownRole('member', { from: 'member', to: 'owner' })).toBe('owner');
  });

  it('shows the role another device set once the stored role has moved on', () => {
    expect(shownRole('owner', { from: 'member', to: 'member' })).toBe('owner');
  });

  it('drops the chosen role once the stored role has moved, so a later remote change shows', () => {
    const chosen = { from: 'member', to: 'owner' } as const;
    const confirmed = livePending('owner', chosen);
    expect(confirmed).toBeNull();
    expect(shownRole('member', confirmed)).toBe('member');
  });

  it('keeps the chosen role only while the stored role is still the one it replaces', () => {
    const chosen = { from: 'member', to: 'owner' } as const;
    expect(livePending('member', chosen)).toBe(chosen);
    expect(livePending('owner', chosen)).toBeNull();
  });
});
