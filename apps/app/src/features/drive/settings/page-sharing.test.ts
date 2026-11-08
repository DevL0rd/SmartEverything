import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import type * as DriveApi from '../../../api/drive';
import type { DriveSettings, DriveSettingsUpdate } from '@smarteverything/domain';

interface Seen {
  updates: DriveSettingsUpdate[];
}

const seen = vi.hoisted((): Seen => ({ updates: [] }));

vi.mock('../../../api/drive', async (importOriginal) => ({
  ...(await importOriginal<typeof DriveApi>()),
  updateDriveSettings: (update: DriveSettingsUpdate): Promise<DriveSettings> => {
    seen.updates.push(update);
    return Promise.resolve({
      uploadExpiryDays: update.uploadExpiryDays ?? 7,
      membersMayShare: update.membersMayShare ?? true,
      duplicatesHashing: true,
      indexingPaused: false,
    });
  },
}));

const { DRIVE_SETTINGS_KEY, saveDriveSettings } = await import('./page-indexing');
const { NUMBER_LENGTH, daysOf, daysProblemOf, daysText, membersLineOf, requiredDays } =
  await import('./page-sharing');

describe('upload expiry days', () => {
  it('reads only whole days of one or more', () => {
    expect(daysOf('14')).toBe(14);
    expect(daysOf(' 3 ')).toBe(3);
    expect(daysOf('0')).toBeNull();
    expect(daysOf('1.5')).toBeNull();
    expect(daysOf('-2')).toBeNull();
    expect(daysOf('soon')).toBeNull();
    expect(daysOf('9'.repeat(NUMBER_LENGTH + 1))).toBeNull();
    expect(daysProblemOf('0')).toBe('Use a whole number of days, 1 or more');
    expect(daysProblemOf('30')).toBeNull();
    expect(() => requiredDays('x')).toThrow('x is not a whole number of days.');
  });

  it('names one day and many days', () => {
    expect(daysText(1)).toBe('1 day');
    expect(daysText(7)).toBe('7 days');
  });

  it('saves the entered days as the upload expiry', async () => {
    seen.updates = [];
    const client = new QueryClient();
    await saveDriveSettings(client, { uploadExpiryDays: requiredDays('21') });
    expect(seen.updates).toEqual([{ uploadExpiryDays: 21 }]);
    expect(client.getQueryData<DriveSettings>(DRIVE_SETTINGS_KEY)?.uploadExpiryDays).toBe(21);
  });

  it('saves who can make links', async () => {
    seen.updates = [];
    const client = new QueryClient();
    await saveDriveSettings(client, { membersMayShare: false });
    expect(seen.updates).toEqual([{ membersMayShare: false }]);
    expect(membersLineOf(false)).toBe('Only you can make links to share outside the home');
    expect(membersLineOf(true)).toBe('Everyone in the home can make links to share outside it');
  });
});
