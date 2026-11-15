import { describe, expect, it } from 'vitest';
import {
  LIBRARY_TAB_IDS,
  LIBRARY_TABS,
  isPartnerTabId,
  partnerTabIdOf,
  partnerTabsOf,
  tabById,
  tabCountOf,
  tabOfParam,
  tabParamOf,
  tabsOf,
} from './library-tabs';

const RAIL = {
  library: 400,
  albums: 2,
  places: 18,
  favourites: 10,
  videos: 15,
  screenshots: 7,
  duplicates: 0,
  backupDevices: 1,
  deleted: 0,
  people: 0,
  sharing: 0,
  archive: 0,
} as const;

describe('Library tabs', () => {
  it('lists every tab once in the order the page shows them', () => {
    expect(LIBRARY_TABS.map((tab) => tab.id)).toEqual([...LIBRARY_TAB_IDS]);
    expect(tabById('cameras')).toMatchObject({ kind: 'source', source: 'cameras' });
    expect(tabById('ai')).toMatchObject({ kind: 'source', source: 'ai' });
    expect(tabById('device').kind).toBe('device');
    expect(tabById('videos')).toMatchObject({ kind: 'hub', filter: 'videos' });
  });

  it('shows On this device only where a local source exists', () => {
    expect(tabsOf(true).map((tab) => tab.id)).toContain('device');
    expect(tabsOf(false).map((tab) => tab.id)).toEqual([
      'all',
      'favourites',
      'videos',
      'screenshots',
      'cameras',
      'ai',
    ]);
  });

  it('reads the tab from the address and falls back to All', () => {
    expect(tabOfParam('videos', false)).toBe('videos');
    expect(tabOfParam('device', true)).toBe('device');
    expect(tabOfParam('device', false)).toBe('all');
    expect(tabOfParam('nonsense', true)).toBe('all');
    expect(tabOfParam(undefined, true)).toBe('all');
  });

  it('leaves All out of the address', () => {
    expect(tabParamOf('all')).toBeNull();
    expect(tabParamOf('ai')).toBe('ai');
  });

  it('counts hub tabs from the rail, source tabs from their chips and the device from the list', () => {
    const input = { rail: RAIL, cameras: 30, ai: 4, device: 120 };
    expect(LIBRARY_TAB_IDS.map((id) => tabCountOf(id, input))).toEqual([
      400, 10, 15, 7, 120, 30, 4,
    ]);
    expect(
      LIBRARY_TAB_IDS.map((id) =>
        tabCountOf(id, { rail: undefined, cameras: undefined, ai: undefined, device: undefined }),
      ),
    ).toEqual([null, null, null, null, null, null, null]);
  });
});

describe('partner tabs', () => {
  it('names one tab after each partner and keeps its count blank', () => {
    const tabs = partnerTabsOf([
      { id: 'a1b2c3d4-0000-4000-8000-000000000030', sharerId: 'p-ana', name: 'Ana' },
    ]);
    expect(tabs).toEqual([
      {
        id: 'partner-a1b2c3d4-0000-4000-8000-000000000030',
        label: 'Ana',
        icon: 'users',
        kind: 'partner',
        shareId: 'a1b2c3d4-0000-4000-8000-000000000030',
        sharerId: 'p-ana',
      },
    ]);
    const id = partnerTabIdOf('a1b2c3d4-0000-4000-8000-000000000030');
    expect(isPartnerTabId(id)).toBe(true);
    expect(isPartnerTabId('videos')).toBe(false);
    expect(tabCountOf(id, { rail: undefined, cameras: 3, ai: 1, device: 2 })).toBeNull();
  });
});
