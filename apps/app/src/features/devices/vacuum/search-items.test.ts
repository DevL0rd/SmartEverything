import { describe, expect, it } from 'vitest';
import type { PresentedCapability } from '@smarteverything/domain';
import { devicePlaces } from '../../../search/device-places';
import { ROBOT_MAPS_REFS, SETTING_GROUPS, VACUUM_SEARCH_ITEMS } from './search-items';
import { vacuumDevice, vacuumPresentation } from './sections/settings-fixture';

const device = vacuumDevice();
const presentation = vacuumPresentation(device);
const placed = new Map<string, PresentedCapability>(
  devicePlaces(device).flatMap((place) =>
    place.capabilities.map((presented) => [presented.key, presented] as const),
  ),
);

function itemOf(key: string): (typeof VACUUM_SEARCH_ITEMS)[number] {
  const found = VACUUM_SEARCH_ITEMS.find((item) => item.key === key);
  if (found === undefined) {
    throw new Error(`No search item ${key}`);
  }
  return found;
}

describe('vacuum search items', () => {
  it('gives every item its own key, a title and synonyms', () => {
    const keys = VACUUM_SEARCH_ITEMS.map((item) => item.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const item of VACUUM_SEARCH_ITEMS) {
      expect(item.title).not.toBe('');
      expect(item.keywords.length).toBeGreaterThan(3);
      expect(item.keywords).toContain('robot');
      expect(item.keywords.filter((word) => word === '')).toStrictEqual([]);
    }
  });

  it('covers every section, tab and in-page control of the vacuum page', () => {
    for (const key of [
      'map-views',
      'status',
      'controls',
      'tab-clean',
      'rooms',
      'zones',
      'quick-mapping',
      'tab-schedule',
      'schedules',
      'dnd',
      'tab-history',
      'history',
      'trail-replay',
      'dock',
      'tab-care',
      'care',
      'settings',
    ]) {
      expect(itemOf(key).title).not.toBe('');
    }
  });

  it('has one settings item per settings group', () => {
    const wanted = [...SETTING_GROUPS.map((group) => `settings-${group.id}`), 'settings-map'];
    expect(wanted.map((key) => itemOf(key).key)).toStrictEqual(wanted);
    expect(new Set(SETTING_GROUPS.map((group) => group.id)).size).toBe(SETTING_GROUPS.length);
  });

  it('finds things by the words people use', () => {
    expect(itemOf('rooms').keywords).toEqual(expect.arrayContaining(['kitchen', 'floor material']));
    expect(itemOf('zones').keywords).toEqual(expect.arrayContaining(['no-go', 'virtual wall']));
    expect(itemOf('schedules').keywords).toEqual(expect.arrayContaining(['timer', 'weekday']));
    expect(itemOf('dock').keywords).toEqual(expect.arrayContaining(['wash mop', 'empty bin']));
    expect(itemOf('care').keywords).toEqual(expect.arrayContaining(['main brush', 'filter']));
    expect(itemOf('settings-map').keywords).toEqual(
      expect.arrayContaining(['which map', 'feed', 'link rooms']),
    );
    expect(itemOf('tab-clean').keywords).toContain('worry free');
    expect(itemOf('settings-obstacles').keywords).toContain('real scene');
    expect(itemOf('settings-camera').keywords).toContain('privacy');
  });

  it('keeps only the feed and Link rooms words on the vacuum Map item', () => {
    const map = itemOf('settings-map');
    expect(map.title).toBe('Map settings');
    expect(map.keywords).toEqual(
      expect.arrayContaining(['which map', 'feed', 'updates automatically', 'link rooms']),
    );
    const moved = [
      'delete map',
      'erase map',
      'clear map',
      'restore map',
      'build map',
      'save map',
      'backup',
      'map name',
      'use this map',
    ];
    expect(map.keywords.filter((word) => moved.includes(word))).toStrictEqual([]);
    expect(VACUUM_SEARCH_ITEMS.filter((item) => item.key === 'settings-map')).toHaveLength(1);
  });

  it('finds room linking on the Rooms card of the page, also by the old rename words', () => {
    expect(itemOf('link-rooms').section).toBeUndefined();
    expect(itemOf('link-rooms').page).toBe('overview');
    expect(itemOf('link-rooms').keywords).toEqual(
      expect.arrayContaining(['link rooms', 'unlinked', 'create room', 'rename room', 'move link']),
    );
    expect(itemOf('rooms').keywords).not.toContain('rename room');
    expect(itemOf('link-rooms-notice').keywords).toContain('rooms need linking');
    expect(VACUUM_SEARCH_ITEMS.some((item) => item.key === 'link-rooms-card')).toBe(false);
  });

  it('keeps every row of every settings group and Robot maps findable as its own device entry', () => {
    const refs = [
      ...SETTING_GROUPS.flatMap((group) => [...group.rows, ...(group.guarded?.rows ?? [])]),
      ...ROBOT_MAPS_REFS,
    ];
    const missing = refs.filter((ref) => {
      const row = presentation.capabilities.find(
        (presented) => presented.role === ref || presented.key === ref,
      );
      return row === undefined || !placed.has(row.key);
    });
    expect(missing).toStrictEqual([]);
  });

  it('carries the presentation keywords on the guarded and coupled rows', () => {
    const keywordsOf = (key: string): readonly string[] => placed.get(key)?.keywords ?? [];
    expect(keywordsOf('raw:2.83')).toContain('worry free');
    expect(keywordsOf('raw:2.45')).toContain('ai');
    expect(keywordsOf('raw:action.10.2')).toContain('remove map');
    expect(keywordsOf('raw:action.10.1')).toContain('erase map');
  });
});
