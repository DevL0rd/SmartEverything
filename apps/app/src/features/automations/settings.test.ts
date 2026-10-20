import { CLIENT_PREFS, type AutomationsBreakpointsPref } from '@smarteverything/domain';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SettingContext, SettingDefinition, SettingEnv } from '../../settings/types';
import { EntityStore } from '../../store/entity-store';
import { emptyState, type StoreState } from '../../store/state';
import type * as Prefs from '../../store/prefs';

interface SavedCall {
  readonly page: string;
  readonly value: unknown;
}

const saved = vi.hoisted(() => {
  const calls: SavedCall[] = [];
  return { calls };
});

vi.mock('../../store/prefs', async (importOriginal) => {
  const actual = await importOriginal<typeof Prefs>();
  return {
    ...actual,
    savePref: (_store: unknown, pref: { storageKey: string }, value: unknown): void => {
      saved.calls.push({ page: pref.storageKey, value });
    },
  };
});

const { SETTINGS } = await import('./settings');

const ENV: SettingEnv = {
  owner: false,
  platform: 'android',
  availability: {
    hasDevices: true,
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

function setting(id: string): SettingDefinition {
  const found = SETTINGS.find((candidate) => candidate.id === id);
  if (found === undefined) throw new Error(`no automations setting ${id}`);
  return found;
}

function layoutState(
  page: string,
  layout: StoreState['tables']['layouts']['byId'][string]['layout'],
): StoreState {
  const state = emptyState();
  return {
    ...state,
    tables: {
      ...state.tables,
      layouts: {
        ...state.tables.layouts,
        byId: {
          [page]: {
            client_id: null,
            profile_id: 'person-1',
            page,
            layout,
            updated_at: '2026-10-18T10:00:00.000Z',
          },
        },
      },
    },
  };
}

function breakpointState(pref: AutomationsBreakpointsPref): StoreState {
  const definition = CLIENT_PREFS.automations_breakpoints;
  return layoutState(definition.storageKey, definition.encode(pref));
}

function contextOf(state: StoreState): SettingContext {
  const store = new EntityStore();
  store.update(() => state);
  return { state, store };
}

beforeEach(() => {
  saved.calls.length = 0;
});

describe('the automations settings rows', () => {
  it('has unique ids on the automations page', () => {
    const ids = SETTINGS.map((row) => row.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(SETTINGS.every((row) => row.page === 'automations' && row.keywords.length > 0)).toBe(
      true,
    );
  });

  it('links every sub-page, the secrets page only for owners', () => {
    const links = SETTINGS.filter((row) => row.control === 'link').map((row) => row.id);
    expect(links).toEqual([
      'automations.nodes',
      'automations.templates',
      'automations.variables',
      'automations.schedule',
      'automations.scheduled',
      'automations.runs',
      'automations.secrets',
    ]);
    const secrets = setting('automations.secrets');
    expect(secrets.visible?.(ENV)).toBe(false);
    expect(secrets.visible?.({ ...ENV, owner: true })).toBe(true);
    expect(setting('automations.nodes').visible).toBeUndefined();
  });

  it('clears every breakpoint and shows the row only while some exist', async () => {
    const row = setting('automations.clear_breakpoints');
    if (row.control !== 'action') throw new Error('not an action');
    expect(row.when?.(emptyState())).toBe(false);
    const some = breakpointState({
      byAutomation: {
        '11111111-1111-4111-8111-111111111111': ['22222222-2222-4222-8222-222222222222'],
      },
    });
    expect(row.when?.(some)).toBe(true);
    await row.run(contextOf(some));
    expect(saved.calls).toEqual([{ page: 'automations-breakpoints', value: { byAutomation: {} } }]);
  });
});
