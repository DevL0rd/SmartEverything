import { describe, expect, it } from 'vitest';
import type { SettingDefinition, SettingEnv } from '../../settings/types';
import { PHOTOS_PAGES } from '../../settings/tree-photos';
import { PHOTOS_SETTINGS } from './settings';

const AVAILABILITY: SettingEnv['availability'] = {
  hasDevices: true,
  hasClimate: false,
  hasCameras: true,
  hasHealth: false,
  hasScenes: false,
  hasEnergy: false,
  hasSecurity: false,
  hasIr: false,
  hasWatch: false,
  needsAttention: false,
};

const env = (owner: boolean, platform: SettingEnv['platform']): SettingEnv => ({
  owner,
  platform,
  developer: false,
  availability: AVAILABILITY,
});

const onPage = (page: string): readonly SettingDefinition[] =>
  PHOTOS_SETTINGS.filter((setting) => setting.page === page);

const shown = (rows: readonly SettingDefinition[], at: SettingEnv): readonly string[] =>
  rows.filter((row) => row.visible?.(at) ?? true).map((row) => row.id);

const sectionsOf = (rows: readonly SettingDefinition[]): readonly string[] =>
  rows
    .map((row) => row.section)
    .filter((section): section is string => section !== undefined)
    .filter((section, index, sections) => section !== sections[index - 1]);

describe('photos settings', () => {
  it('give every setting a unique id on a page of the photos tree', () => {
    const ids = PHOTOS_SETTINGS.map((setting) => setting.id);
    expect(new Set(ids).size).toBe(ids.length);
    const pages = PHOTOS_PAGES.map((page) => page.id);
    expect(PHOTOS_SETTINGS.every((setting) => pages.includes(setting.page))).toBe(true);
    expect(pages).toEqual(['photos', 'photos/backup', 'photos/duplicates']);
  });

  it('keep Library, Sources and Map and places on the Photos page with no Memories', () => {
    expect(sectionsOf(onPage('photos'))).toEqual(['Library', 'Sources', 'Map and places']);
    expect(PHOTOS_SETTINGS.some((setting) => setting.id.includes('memories'))).toBe(false);
    expect(PHOTOS_SETTINGS.some((setting) => setting.section === 'Timeline')).toBe(false);
  });

  it('keep every backup setting per device on the Backup page', () => {
    const backup = onPage('photos/backup');
    expect(sectionsOf(backup)).toEqual(['This device']);
    expect(backup.every((setting) => setting.scope === 'device')).toBe(true);
    expect(shown(backup, env(false, 'android'))).toEqual([
      'photos.backup.enabled',
      'photos.backup.wifi_only',
      'photos.backup.charging_only',
      'photos.backup.videos',
      'photos.backup.albums',
      'photos.backup.original',
      'photos.backup.folder',
    ]);
    expect(shown(backup, env(true, 'desktop'))).not.toContain('photos.backup.albums');
    expect(shown(backup, env(true, 'web'))).toEqual([]);
  });

  it('link duplicate detection to Drive indexing for the owner only', () => {
    const duplicates = onPage('photos/duplicates');
    expect(duplicates.map((setting) => setting.id)).toEqual(['photos.duplicates.hashing']);
    expect(shown(duplicates, env(false, 'android'))).toEqual([]);
    expect(shown(duplicates, env(true, 'web'))).toEqual(['photos.duplicates.hashing']);
  });

  it('opens the two sub-pages for every person and draws them as link cards', () => {
    const photos = PHOTOS_PAGES.find((page) => page.id === 'photos');
    expect(photos?.childrenInline).toBe(false);
    const children = PHOTOS_PAGES.filter((page) => page.parent === 'photos');
    expect(children.every((page) => page.visible === undefined)).toBe(true);
  });

  it('offer the location removal switch under Map and places', () => {
    const row = PHOTOS_SETTINGS.find(
      (setting) => setting.id === 'photos.map.remove_location_outside',
    );
    expect(row?.section).toBe('Map and places');
    expect(row?.control).toBe('switch');
  });
});
