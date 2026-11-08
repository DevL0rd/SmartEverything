import { PLUGIN_ROW, SESSION } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { emptyState, makeTable, type StoreState } from '../../store/state';
import { cellAccessOf } from './cell-gate';

const DATE = '2026-11-06T00:00:00.000Z';
const CLIENT = '00000000-0000-4000-8000-000000000001';

function sessionOf(role: 'owner' | 'member'): StoreState['session'] {
  return SESSION.parse({
    client: {
      id: CLIENT,
      name: 'Phone',
      platform: 'android',
      role,
      built_in: false,
      profile_id: CLIENT,
      created_at: DATE,
      last_seen_at: null,
    },
    hub: { version: '1.0.0', startedAt: DATE, cameras: 'running' },
  });
}

function pluginOf(enabled: boolean): StoreState['tables']['plugins'] {
  const row = PLUGIN_ROW.parse({
    id: 'router',
    manifest: {
      id: 'router',
      name: 'Router',
      publisher: 'Home',
      description: 'Router',
      version: '1.0.0',
    },
    source: 'builtin',
    location: null,
    enabled,
    trusted: true,
    status: enabled ? 'running' : 'disabled',
    status_detail: null,
    tool_switches: {},
    settings: {},
    secret_names: [],
    icon_url: null,
    installed_at: DATE,
    updated_at: DATE,
  });
  return makeTable({ router: row }, ['router'], 1);
}

function stateOf(role: 'owner' | 'member', enabled: boolean | null): StoreState {
  const empty = emptyState();
  const plugins = enabled === null ? empty.tables.plugins : pluginOf(enabled);
  return { ...empty, session: sessionOf(role), tables: { ...empty.tables, plugins } };
}

describe('cellAccessOf', () => {
  it('reads the plugin switch and the role in one value', () => {
    expect(cellAccessOf(stateOf('owner', true), 'router')).toBe('owner');
    expect(cellAccessOf(stateOf('member', true), 'router')).toBe('member');
    expect(cellAccessOf(stateOf('owner', false), 'router')).toBe('off');
  });

  it('treats a plugin the hub has not listed as on', () => {
    expect(cellAccessOf(stateOf('member', null), 'router')).toBe('member');
  });
});
