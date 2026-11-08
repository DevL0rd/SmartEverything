import { describe, expect, it } from 'vitest';
import type { SettingDefinition, SettingEnv } from '../../../settings/types';

const { SETTINGS } = await import('../settings');
const { MAP_ROWS, MEMORY_ROWS, PHONES_BACKUP_BLOCK, PHONE_BACKUP_ROWS, PHOTOS_SETTINGS } =
  await import('./definitions');

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

const OWN: readonly SettingDefinition[] = [
  ...PHONE_BACKUP_ROWS,
  ...PHONES_BACKUP_BLOCK,
  ...MEMORY_ROWS,
  ...MAP_ROWS,
];

const shown = (rows: readonly SettingDefinition[], at: SettingEnv): readonly string[] =>
  rows.filter((row) => row.visible?.(at) ?? true).map((row) => row.id);

describe('photos settings page rows', () => {
  it('adds only new ids to the photos page', () => {
    const ids = [...SETTINGS, ...OWN].map((setting) => setting.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(OWN.every((setting) => setting.page === 'photos' && setting.control === 'custom')).toBe(
      true,
    );
  });

  it('keeps the phone backup rows on this phone and the per-phone list on desktop', () => {
    expect(PHONE_BACKUP_ROWS.every((row) => row.scope === 'device')).toBe(true);
    expect(PHONE_BACKUP_ROWS.every((row) => row.section === 'Backup on this phone')).toBe(true);
    expect(shown(OWN, env(true, 'android'))).toEqual([
      'photos.backup.status',
      'photos.backup.albums',
      'photos.backup.original',
      'photos.backup.folder',
      'photos.backup.free_up',
      'photos.memories.excluded',
      'photos.map.attribution',
    ]);
    expect(shown(OWN, env(false, 'desktop'))).toEqual([
      'photos.phones',
      'photos.memories.excluded',
      'photos.map.attribution',
    ]);
  });

  it('draws the per-phone list as its own block and the rest inside their sections', () => {
    const block = (setting: SettingDefinition): boolean =>
      setting.control === 'custom' && setting.row !== true;
    expect(OWN.filter(block).map((setting) => setting.id)).toEqual(['photos.phones']);
    expect(MEMORY_ROWS.map((row) => row.section)).toEqual(['Memories']);
    expect(MAP_ROWS.map((row) => row.section)).toEqual(['Map and places']);
  });

  it('keeps every row of the page and each section in one run', () => {
    expect(PHOTOS_SETTINGS).toHaveLength(SETTINGS.length + OWN.length);
    const runs = PHOTOS_SETTINGS.map((setting) => setting.section).filter(
      (section, index, sections) => section !== sections[index - 1],
    );
    expect(new Set(runs).size).toBe(runs.length);
    expect(runs).toEqual([
      'Sources',
      'Timeline',
      'Backup on this phone',
      'Backup',
      'Memories',
      'Map and places',
      'Duplicates',
    ]);
  });
});
