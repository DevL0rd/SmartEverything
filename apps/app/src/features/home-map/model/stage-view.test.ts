import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  CLIENT_PREFS,
  type HomeMapLookPref,
  type HomeMapViewPref,
  type JsonValue,
  type LayoutRow,
} from '@smarteverything/domain';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyState, type StoreState } from '../../../store/state';
import type * as Prefs from '../../../store/prefs';

interface Probe {
  readonly saved: { readonly key: string; readonly value: unknown }[];
  state: StoreState | null;
}

const probe: Probe = vi.hoisted(() => ({ saved: [], state: null }));

vi.mock('../../../store/prefs', async (importOriginal) => {
  const actual = await importOriginal<typeof Prefs>();
  return {
    ...actual,
    savePref: (_store: unknown, pref: { readonly storageKey: string }, value: unknown): void => {
      probe.saved.push({ key: pref.storageKey, value });
    },
  };
});

vi.mock('../../../store/store-context', () => ({
  useEntityStore: (): unknown => ({ get: (): StoreState | null => probe.state }),
  useStoreSelector: <T>(select: (state: StoreState) => T): T => {
    if (probe.state === null) throw new Error('no state');
    return select(probe.state);
  },
}));

const {
  DEFAULT_STAGE_VIEW,
  rememberStageView,
  shownStageView,
  stageViewsOf,
  useLastFloor,
  usePinnedSplit,
  useStageLights,
  useStageViews,
} = await import('./stage-view');

function rowOf(
  page: string,
  client: boolean,
  layout: Readonly<Record<string, JsonValue>>,
): LayoutRow {
  return {
    client_id: client ? 'client-1' : null,
    profile_id: client ? null : 'profile-1',
    page,
    layout: { ...layout },
    updated_at: '2026-11-02T00:00:00.000Z',
  };
}

interface Saved {
  readonly view?: HomeMapViewPref;
  readonly look?: Partial<HomeMapLookPref>;
}

function stateWith(saved: Saved): StoreState {
  const base = emptyState();
  const rows = [
    ...(saved.view === undefined
      ? []
      : [rowOf('home-map-view', true, CLIENT_PREFS.home_map_view.encode(saved.view))]),
    ...(saved.look === undefined
      ? []
      : [
          rowOf(
            'home-map-look',
            false,
            CLIENT_PREFS.home_map_look.encode({
              ...CLIENT_PREFS.home_map_look.defaultValue,
              ...saved.look,
            }),
          ),
        ]),
  ];
  const byId = Object.fromEntries(rows.map((row) => [row.page, row]));
  return { ...base, tables: { ...base.tables, layouts: { ...base.tables.layouts, byId } } };
}

const VIEW = CLIENT_PREFS.home_map_view.defaultValue;

function captured<T>(hook: () => T): T {
  const box: { value: T | null } = { value: null };
  function Probe(): ReactNode {
    box.value = hook();
    return null;
  }
  renderToStaticMarkup(createElement(Probe));
  if (box.value === null) throw new Error('hook did not run');
  return box.value;
}

beforeEach(() => {
  probe.saved.length = 0;
  probe.state = stateWith({});
});

describe('the views a home map stage offers', () => {
  it('offers only 3D without a scan and 3D | Realistic with one', () => {
    expect(stageViewsOf(null).map((view) => view.value)).toEqual(['3d']);
    expect(stageViewsOf({ hasScan: false }).map((view) => view.label)).toEqual(['3D']);
    expect(stageViewsOf({ hasScan: true }).map((view) => view.label)).toEqual(['3D', 'Realistic']);
  });

  it('never offers a flat map', () => {
    const offered = [...stageViewsOf(null), ...stageViewsOf({ hasScan: true })];
    expect(offered.map((view) => view.value)).not.toContain('map');
  });

  it('defaults to 3D and shows 3D for Realistic without a scan', () => {
    expect(DEFAULT_STAGE_VIEW).toBe('3d');
    expect(shownStageView(undefined, stageViewsOf(null))).toBe('3d');
    expect(shownStageView('realistic', stageViewsOf({ hasScan: false }))).toBe('3d');
    expect(shownStageView('realistic', stageViewsOf({ hasScan: true }))).toBe('realistic');
  });

  it('remembers the view per page', () => {
    const once = rememberStageView(VIEW, 'home', '3d');
    expect(rememberStageView(once, 'devices', 'realistic').view).toEqual({
      home: '3d',
      devices: 'realistic',
    });
  });
});

describe('useStageViews', () => {
  it('shows 3D alone on a page nothing was remembered for', () => {
    const views = captured(() => useStageViews('home', { hasScan: false }));
    expect(views.view).toBe('3d');
    expect(views.views).toHaveLength(1);
  });

  it('reads the remembered view of its page and saves a change to it only', () => {
    probe.state = stateWith({ view: rememberStageView(VIEW, 'devices', 'realistic') });
    expect(captured(() => useStageViews('home', { hasScan: true })).view).toBe('3d');
    const devices = captured(() => useStageViews('devices', { hasScan: true }));
    expect(devices.view).toBe('realistic');
    devices.setView('realistic');
    expect(probe.saved).toEqual([]);
    devices.setView('3d');
    expect(probe.saved).toEqual([
      { key: 'home-map-view', value: { ...VIEW, view: { devices: '3d' } } },
    ]);
  });
});

describe('the lights toggle', () => {
  it('reads look.lightUp, on by default, and writes the flipped look', () => {
    const lights = captured(useStageLights);
    expect(lights.on).toBe(true);
    lights.onToggle();
    expect(probe.saved).toEqual([
      {
        key: 'home-map-look',
        value: { ...CLIENT_PREFS.home_map_look.defaultValue, lightUp: false },
      },
    ]);
  });

  it('shows the lights off when the saved look says so', () => {
    probe.state = stateWith({ look: { lightUp: false } });
    expect(captured(useStageLights).on).toBe(false);
  });
});

describe('the pinned split and last floor', () => {
  it('reads and writes the pinned size, folding and last floor in the view pref', () => {
    const split = captured(usePinnedSplit);
    expect(split).toMatchObject({ size: 0.5, collapsed: false });
    split.setSize(0.9);
    split.setCollapsed(true);
    const floor = captured(useLastFloor);
    expect(floor.floorId).toBeNull();
    floor.setFloor('first');
    expect(probe.saved.map((entry) => entry.value)).toEqual([
      { ...VIEW, pinnedSize: 0.7, pinnedCollapsed: false },
      { ...VIEW, pinnedCollapsed: true },
      { ...VIEW, lastFloor: 'first' },
    ]);
  });
});
