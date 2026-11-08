import { describe, expect, it } from 'vitest';
import type { SettingEnv } from '../../settings/types';
import { SETTINGS } from './settings';

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

const backupRows = SETTINGS.filter((setting) => setting.id.startsWith('photos.backup.'));
const linkRows = SETTINGS.filter((setting) => setting.control === 'link');

describe('photos settings', () => {
  it('give every setting a unique id on the photos page', () => {
    const ids = SETTINGS.map((setting) => setting.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(SETTINGS.every((setting) => setting.page === 'photos')).toBe(true);
  });

  it('keep the backup settings per phone and show them on Android only', () => {
    expect(backupRows.length).toBeGreaterThan(0);
    expect(backupRows.every((setting) => setting.scope === 'device')).toBe(true);
    expect(backupRows.map((setting) => setting.visible?.(env(true, 'android')))).toEqual(
      backupRows.map(() => true),
    );
    expect(backupRows.map((setting) => setting.visible?.(env(true, 'web')))).toEqual(
      backupRows.map(() => false),
    );
  });

  it('keep the links into Drive settings for owners only', () => {
    expect(linkRows.map((setting) => setting.id)).toEqual([
      'photos.sources.folders',
      'photos.duplicates.hashing',
    ]);
    expect(linkRows.map((setting) => setting.visible?.(env(false, 'android')))).toEqual([
      false,
      false,
    ]);
    expect(linkRows.map((setting) => setting.visible?.(env(true, 'android')))).toEqual([
      true,
      true,
    ]);
  });

  it('offer the location removal switch under Map and places', () => {
    const row = SETTINGS.find((setting) => setting.id === 'photos.map.remove_location_outside');
    expect(row?.section).toBe('Map and places');
    expect(row?.control).toBe('switch');
  });
});
