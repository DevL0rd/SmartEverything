import {
  CLIENT_PREFS,
  CLIENT_PREF_KEYS,
  RESERVED_LAYOUT_KEYS,
  layoutScopeOf,
  type HomeMapViewPref,
} from '@smarteverything/domain';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SettingContext, SettingDefinition, SettingEnv } from '../../settings/types';
import { EntityStore } from '../../store/entity-store';
import { emptyState } from '../../store/state';
import type * as Prefs from '../../store/prefs';

const saved = vi.hoisted((): { calls: { key: string; value: unknown }[] } => ({ calls: [] }));

vi.mock('../../store/prefs', async (importOriginal) => {
  const actual = await importOriginal<typeof Prefs>();
  return {
    ...actual,
    savePref: (_store: unknown, pref: { storageKey: string }, value: unknown): void => {
      saved.calls.push({ key: pref.storageKey, value });
    },
  };
});

const { SETTINGS, HOME_MAP_SETTINGS_PAGE } = await import('./settings');
const { settingPageOf } = await import('../../settings/registry');
const { childrenOf, settingsPage } = await import('../../settings/tree');

const ENV: SettingEnv = {
  owner: false,
  platform: 'android',
  developer: false,
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

const PAGE_ROWS = SETTINGS.filter((row) => row.page === HOME_MAP_SETTINGS_PAGE);

function row(id: string): SettingDefinition {
  const found = SETTINGS.find((candidate) => candidate.id === id);
  if (found === undefined) throw new Error(`no home map setting ${id}`);
  return found;
}

function context(): SettingContext {
  const store = new EntityStore();
  return { state: store.get(), store };
}

function valueOf(id: string): unknown {
  const found = row(id);
  if (found.control !== 'switch' && found.control !== 'select')
    throw new Error(`${id} has no value`);
  return found.read(emptyState());
}

beforeEach(() => {
  saved.calls.length = 0;
});

describe('the Home map settings page', () => {
  it('registers the page under Home and every row on it', () => {
    expect(settingsPage(HOME_MAP_SETTINGS_PAGE)?.parent).toBe('home');
    for (const found of SETTINGS) {
      expect(settingPageOf(found.id)).toBe(found.page);
    }
    expect(new Set(SETTINGS.map((found) => found.id)).size).toBe(SETTINGS.length);
  });

  it('has one row for each setting of the plan and a link from the Devices settings', () => {
    expect(PAGE_ROWS.map((found) => found.title)).toEqual([
      'Light up the map',
      'Show furniture',
      'Show device models',
      'Wall style',
      'Room climate',
      'People on the map',
      'Door and window state',
      'Robot vacuum on the map',
      'Show all camera views',
      'Show the home map on Home',
      'Units',
    ]);
    const link = row('home-map.link.devices');
    expect(link.page).toBe('devices');
    expect(link.control).toBe('link');
    if (link.control !== 'link') throw new Error('the Devices row is a link');
    expect(link.title).toBe('Home maps');
    expect(link.href).toEqual({
      pathname: '/settings/[...page]',
      params: { page: ['home', 'maps'] },
    });
  });

  it('lists Home maps once in the Home settings, opening the Home maps list', () => {
    const entries = childrenOf('home').filter((page) => page.title.includes('map'));
    expect(entries.map((page) => page.title)).toEqual(['Home maps']);
    expect(entries[0]?.href).toEqual({
      pathname: '/settings/[...page]',
      params: { page: ['home', 'maps'] },
    });
    expect(SETTINGS.filter((found) => found.page === 'home')).toEqual([]);
  });

  it('is found by the words people use for a map', () => {
    for (const found of PAGE_ROWS) {
      for (const word of [
        'floor plan',
        'layout',
        'house map',
        'blueprint',
        'furniture',
        'decorate',
      ]) {
        expect(found.keywords).toContain(word);
      }
    }
  });

  it('starts with the defaults of the plan', () => {
    expect(valueOf('home-map.light-up')).toBe(true);
    expect(valueOf('home-map.furniture')).toBe(true);
    expect(valueOf('home-map.device-models')).toBe(true);
    expect(valueOf('home-map.room-climate')).toBe('chip');
    expect(valueOf('home-map.people')).toBe(true);
    expect(valueOf('home-map.camera-views')).toBe(false);
    expect(valueOf('home-map.openings')).toBe(true);
    expect(valueOf('home-map.robot')).toBe(true);
    expect(valueOf('home-map.wall-style')).toBe('cutaway');
    expect(valueOf('home-map.show-on-home')).toBe(true);
    expect(valueOf('home-map.units')).toBe('metric');
  });

  it('shows the camera views row only where there are cameras', () => {
    const found = row('home-map.camera-views');
    expect(found.visible?.(ENV)).toBe(false);
    expect(
      found.visible?.({ ...ENV, availability: { ...ENV.availability, hasCameras: true } }),
    ).toBe(true);
  });

  it('saves a switch change into the one look preference and keeps the other rows', async () => {
    const found = row('home-map.light-up');
    if (found.control !== 'switch') throw new Error('light up is a switch');
    await found.write(false, context());
    expect(saved.calls).toEqual([
      {
        key: 'home-map-look',
        value: { ...CLIENT_PREFS.home_map_look.defaultValue, lightUp: false },
      },
    ]);
  });

  it('saves a chosen value and refuses a value that is not one of the choices', async () => {
    const found = row('home-map.wall-style');
    if (found.control !== 'select') throw new Error('wall style is a select');
    await found.write('low', context());
    expect(saved.calls[0]?.value).toMatchObject({ wallStyle: 'low', roomClimate: 'chip' });
    expect(() => found.write('towering', context())).toThrow();
    expect(saved.calls).toHaveLength(1);
  });
});

describe('the home map preferences', () => {
  it('keeps the look synced to the person and the view on this device', () => {
    expect(CLIENT_PREFS.home_map_look.scope).toBe('profile');
    expect(CLIENT_PREFS.home_map_view.scope).toBe('client');
    expect(layoutScopeOf('home-map-look')).toBe('profile');
    expect(layoutScopeOf('home-map-view')).toBe('client');
    for (const key of ['home_map_look', 'home_map_view'] as const) {
      expect(CLIENT_PREF_KEYS).toContain(key);
      expect(RESERVED_LAYOUT_KEYS.has(CLIENT_PREFS[key].storageKey)).toBe(true);
    }
  });

  it('reads an absent view as left to the page, half height and no floor', () => {
    expect(CLIENT_PREFS.home_map_view.decode(null)).toEqual({
      status: 'absent',
      value: { view: {}, pinnedSize: 0.5, pinnedCollapsed: false, lastFloor: null },
    });
  });

  it('round trips the view per page, the pinned size and the last floor', () => {
    const definition = CLIENT_PREFS.home_map_view;
    const value: HomeMapViewPref = {
      view: { home: '3d', devices: '3d', room: 'realistic' },
      pinnedSize: 0.4,
      pinnedCollapsed: true,
      lastFloor: 'floor-1',
    };
    expect(definition.decode(definition.encode(value))).toEqual({
      status: 'stored',
      value,
      migrated: false,
    });
  });

  it('refuses a stored flat map view and a version 1 view', () => {
    const definition = CLIENT_PREFS.home_map_view;
    const flat = { ...definition.defaultValue, view: { home: 'map' } };
    expect(definition.schema.safeParse(flat).success).toBe(false);
    expect(definition.decode({ version: 1, value: definition.defaultValue })).toMatchObject({
      status: 'invalid',
    });
  });

  it('refuses a pinned size outside the divider range and an unknown look value', () => {
    expect(
      CLIENT_PREFS.home_map_view.schema.safeParse({
        view: {},
        pinnedSize: 0.9,
        pinnedCollapsed: false,
        lastFloor: null,
      }).success,
    ).toBe(false);
    expect(
      CLIENT_PREFS.home_map_look.schema.safeParse({
        ...CLIENT_PREFS.home_map_look.defaultValue,
        wallStyle: 'towering',
      }).success,
    ).toBe(false);
  });
});
