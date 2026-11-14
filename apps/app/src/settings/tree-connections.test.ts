import { describe, expect, it } from 'vitest';
import type { GoogleAccountRow } from '@smarteverything/domain';
import { emptyState, makeTable, type StoreState } from '../store/state';
import type { SettingEnv } from './types';

const { settingsPage, childrenOf } = await import('./tree');

const PERSON = '00000000-0000-4000-8000-000000000001';

function env(owner: boolean): SettingEnv {
  return {
    owner,
    platform: 'android',
    developer: false,
    availability: {
      hasDevices: false,
      hasClimate: false,
      hasCameras: false,
      hasHealth: false,
      hasScenes: false,
      hasEnergy: false,
      hasSecurity: false,
      hasIr: false,
      hasWatch: false,
      needsAttention: false,
    },
  };
}

function withGoogle(status: GoogleAccountRow['status']): StoreState {
  const state = emptyState();
  const row: GoogleAccountRow = {
    profile_id: PERSON,
    email: null,
    scopes: [],
    status,
    problem: null,
    calendar_ids: [],
    list_ids: [],
    last_sync_at: null,
    last_error: null,
  };
  return {
    ...state,
    tables: { ...state.tables, google_accounts: makeTable({ [PERSON]: row }, [PERSON], 1) },
  };
}

describe('Accounts settings pages', () => {
  it('opens Accounts for every person and keeps Add account for the owner', () => {
    const accounts = settingsPage('connections');
    const add = settingsPage('connections/add');
    expect(accounts?.visible?.(env(false)) ?? true).toBe(true);
    expect(add?.visible?.(env(false))).toBe(false);
    expect(add?.visible?.(env(true))).toBe(true);
  });

  it('nests the Google page under Accounts for every person', () => {
    const google = settingsPage('connections/google');
    expect(google?.parent).toBe('connections');
    expect(google?.visible?.(env(false)) ?? true).toBe(true);
    expect(childrenOf('connections').map((page) => page.id)).toContain('connections/google');
    expect(google?.keywords).toEqual(expect.arrayContaining(['google calendar', 'sync now']));
  });

  it('summarises Google on the Accounts row only while it is linked', () => {
    const summary = settingsPage('connections')?.summary;
    expect(summary?.(emptyState())).toBeNull();
    expect(summary?.(withGoogle('unlinked'))).toBeNull();
    expect(summary?.(withGoogle('needs_attention'))).toBe('Google');
  });
});

describe('Integrations settings pages', () => {
  it('lists Integrations on the main Settings page under Connections for the owner', () => {
    const integrations = settingsPage('integrations');
    expect(integrations?.parent).toBeNull();
    expect(integrations?.group).toBe('Connections');
    expect(integrations?.visible?.(env(true))).toBe(true);
    expect(integrations?.visible?.(env(false))).toBe(false);
    expect(childrenOf('integrations').map((page) => page.id)).toEqual([
      'integrations/tools',
      'integrations/tokens',
    ]);
  });

  it('keeps Integrations out of Assistant settings', () => {
    expect(settingsPage('assistant/integrations')).toBeUndefined();
    expect(childrenOf('assistant').filter((page) => page.title === 'Integrations')).toEqual([]);
  });
});
