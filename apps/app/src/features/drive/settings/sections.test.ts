import { describe, expect, it } from 'vitest';
import {
  DRIVE_SETTINGS_SECTIONS,
  driveRowVisible,
  driveSettingsHref,
  visibleDriveSettingsSections,
} from './sections';

const OWNER_DESKTOP = { owner: true, platform: 'desktop' } as const;
const MEMBER_PHONE = { owner: false, platform: 'android' } as const;

function visibleRows(env: typeof OWNER_DESKTOP | typeof MEMBER_PHONE): readonly string[] {
  return DRIVE_SETTINGS_SECTIONS.flatMap((section) =>
    section.rows.filter((row) => driveRowVisible(section, row, env)).map((row) => row.settingId),
  );
}

describe('Drive settings sections', () => {
  it('uses every setting id once and names each row under its section', () => {
    const ids = DRIVE_SETTINGS_SECTIONS.flatMap((section) => [
      section.settingId,
      ...section.rows.map((row) => row.settingId),
    ]);
    expect(new Set(ids).size).toBe(ids.length);
    for (const section of DRIVE_SETTINGS_SECTIONS) {
      for (const row of section.rows) {
        expect(row.settingId.startsWith(`${section.settingId}.`)).toBe(true);
        expect(row.keywords.length).toBeGreaterThan(0);
      }
    }
  });

  it('shows a member on a phone their drives and storage only', () => {
    expect(visibleDriveSettingsSections(MEMBER_PHONE).map((section) => section.id)).toEqual([
      'drives',
      'storage',
    ]);
    expect(visibleRows(MEMBER_PHONE)).toEqual([
      'drive.drives.versions',
      'drive.drives.hidden',
      'drive.drives.skip',
      'drive.drives.rescan',
      'drive.storage.mine',
      'drive.storage.scrub',
      'drive.storage.backup',
    ]);
  });

  it('shows the owner on a desktop every section, the quotas and the mount cache', () => {
    expect(visibleDriveSettingsSections(OWNER_DESKTOP).map((section) => section.id)).toEqual([
      'drives',
      'sync-mount',
      'sharing',
      'indexing',
      'storage',
      'google',
    ]);
    const rows = visibleRows(OWNER_DESKTOP);
    expect(rows).toContain('drive.storage.quotas');
    expect(rows).toContain('drive.sync-mount.cache-age');
    expect(rows).not.toContain('drive.storage.mine');
  });

  it('opens settings on the section of the Drive page', () => {
    expect(driveSettingsHref('index', MEMBER_PHONE)).toMatchObject({
      params: { page: ['drive'], focus: 'drive.drives' },
    });
    expect(driveSettingsHref('computers', OWNER_DESKTOP)).toMatchObject({
      params: { page: ['drive'], focus: 'drive.sync-mount' },
    });
    expect(driveSettingsHref('computers', MEMBER_PHONE)).toMatchObject({
      params: { page: ['drive'] },
    });
  });
});
