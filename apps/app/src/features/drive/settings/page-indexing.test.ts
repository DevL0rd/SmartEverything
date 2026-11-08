import { QueryClient } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as DriveApi from '../../../api/drive';
import type { DriveSettings, DriveSettingsUpdate } from '@smarteverything/domain';
import { percent } from '../../../format/number';
import { rootRow } from '../../nas/data/fixtures';

interface Seen {
  updates: DriveSettingsUpdate[];
  saved: DriveSettings | null;
}

const SETTINGS: DriveSettings = {
  uploadExpiryDays: 7,
  membersMayShare: true,
  duplicatesHashing: true,
  indexingPaused: false,
};

const seen = vi.hoisted((): Seen => ({ updates: [], saved: null }));

vi.mock('../../../api/drive', async (importOriginal) => ({
  ...(await importOriginal<typeof DriveApi>()),
  updateDriveSettings: (update: DriveSettingsUpdate): Promise<DriveSettings> => {
    seen.updates.push(update);
    return seen.saved === null
      ? Promise.reject(new Error('no answer set'))
      : Promise.resolve(seen.saved);
  },
}));

const { DRIVE_SETTINGS_KEY, hashedLineOf, indexingLineOf, progressLinesOf, saveDriveSettings } =
  await import('./page-indexing');
const { watcherLineOf } = await import('./watcher-line');

const PHOTOS = '00000000-0000-4000-8000-000000000201';
const MEDIA = '00000000-0000-4000-8000-000000000202';

function root(id: string, label: string): ReturnType<typeof rootRow> {
  return { ...rootRow(id, 'ready'), label };
}

describe('saveDriveSettings', () => {
  beforeEach(() => {
    seen.updates = [];
    seen.saved = SETTINGS;
  });

  it('sends only the changed field and stores the hub answer as the settings', async () => {
    const client = new QueryClient();
    const paused = { ...SETTINGS, indexingPaused: true };
    seen.saved = paused;
    await expect(saveDriveSettings(client, { indexingPaused: true })).resolves.toEqual(paused);
    expect(seen.updates).toEqual([{ indexingPaused: true }]);
    expect(client.getQueryData(DRIVE_SETTINGS_KEY)).toEqual(paused);
    expect(DRIVE_SETTINGS_KEY).toEqual(['window', 'drive', 'settings', null]);
  });

  it('writes duplicate hashing off', async () => {
    const client = new QueryClient();
    seen.saved = { ...SETTINGS, duplicatesHashing: false };
    await saveDriveSettings(client, { duplicatesHashing: false });
    expect(seen.updates).toEqual([{ duplicatesHashing: false }]);
    expect(client.getQueryData<DriveSettings>(DRIVE_SETTINGS_KEY)?.duplicatesHashing).toBe(false);
  });
});

describe('indexing lines', () => {
  it('lists live progress per known library folder and phase', () => {
    const lines = progressLinesOf(
      {
        [PHOTOS]: { scan: { done: 250, total: 1000 }, hash: { done: 0, total: 0 } },
        [MEDIA]: { scrub: { done: 3, total: 4 } },
        '00000000-0000-4000-8000-000000000299': { scan: { done: 1, total: 2 } },
      },
      [root(PHOTOS, 'Pictures'), root(MEDIA, 'Media disk')],
    );
    expect(lines).toEqual([
      {
        key: `${PHOTOS}:scan`,
        rootId: PHOTOS,
        title: 'Pictures',
        subtitle: 'Reading folders · 250 of 1,000',
        share: 0.25,
      },
      {
        key: `${PHOTOS}:hash`,
        rootId: PHOTOS,
        title: 'Pictures',
        subtitle: 'Finding duplicates · 0 of 0',
        share: 0,
      },
      {
        key: `${MEDIA}:scrub`,
        rootId: MEDIA,
        title: 'Media disk',
        subtitle: 'Checking for damage · 3 of 4',
        share: 0.75,
      },
    ]);
  });

  it('says whether indexing is paused, idle or working', () => {
    expect(indexingLineOf(true, 2)).toBe('Paused · new and changed files wait until you resume');
    expect(indexingLineOf(false, 0)).toBe('Up to date with every library folder');
    expect(indexingLineOf(false, 1)).toBe('Working on 1 folder');
    expect(indexingLineOf(false, 3)).toBe('Working on 3 folders');
  });

  it('explains the watcher state and the watch limit', () => {
    expect(watcherLineOf('watching').tone).toBe('positive');
    expect(watcherLineOf('reconciling').tone).toBe('info');
    expect(watcherLineOf('unavailable')).toEqual({
      text: 'Changes are found only when a folder is opened or rescanned. The hub’s limit on watched folders (inotify) is reached; raise it on the hub computer.',
      tone: 'warning',
    });
  });

  it('shows how much of the library is hashed once health is known', () => {
    expect(hashedLineOf(undefined)).toBe('Reads each file once to spot exact copies');
    expect(hashedLineOf(0.62)).toBe(
      `Reads each file once to spot exact copies · ${percent(0.62)} of files read`,
    );
  });
});
