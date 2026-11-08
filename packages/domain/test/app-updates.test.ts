import { describe, expect, it } from 'vitest';
import {
  API_ENDPOINTS,
  APP_UPDATE_ENTRY,
  APP_UPDATE_FILE,
  APP_UPDATE_FILE_PATH,
  APP_UPDATE_INDEX,
  APP_UPDATE_NOTICE,
  APP_UPDATE_OFFER,
  APP_UPDATE_OUTCOME,
  APP_UPDATE_QUERY,
  LIVE_MESSAGE,
  MEDIA_PATHS,
  latestAppUpdate,
  newerIncompatibleUpdate,
  rollsBackToEmbedded,
  appUpdateSummaryOf,
  type AppUpdateEntry,
  type AppUpdateTarget,
} from '../src';

const HASH = 'ab'.repeat(32);

const TARGET: AppUpdateTarget = { platform: 'android', channel: 'release', runtimeVersion: 'r1' };

function id(n: number): string {
  return `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
}

type AndroidEntry = Extract<AppUpdateEntry, { readonly platform: 'android' }>;
type DesktopEntry = Extract<AppUpdateEntry, { readonly platform: 'desktop' }>;

function entry(n: number, patch: Partial<AndroidEntry> = {}): AndroidEntry {
  return {
    id: id(n),
    platform: 'android',
    channel: 'release',
    runtimeVersion: 'r1',
    createdAt: `2026-10-${String(10 + n).padStart(2, '0')}T10:00:00.000Z`,
    appVersion: '1.0.0',
    notes: 'Fixes the home screen',
    launch: {
      path: '_expo/entry.hbc',
      sha256: HASH,
      size: 100,
      contentType: 'application/javascript',
    },
    files: [
      { path: 'assets/a', sha256: HASH, size: 20, contentType: 'image/png', fileExtension: '.png' },
    ],
    expoClient: { name: 'SmartEverything', android: { package: 'com.example.app' } },
    withdrawn: null,
    ...patch,
  };
}

function desktopEntry(n: number, patch: Partial<DesktopEntry> = {}): DesktopEntry {
  const { launch: _launch, expoClient: _client, platform: _platform, ...shared } = entry(n);
  return { ...shared, platform: 'desktop', launch: null, expoClient: null, ...patch };
}

const WITHDRAWN = { at: '2026-10-25T10:00:00.000Z', reason: 'broken boot' };

describe('app update file paths', () => {
  it('accepts relative paths', () => {
    for (const path of ['a', 'assets/a.png', '_expo/static/js/android/entry-1.hbc', 'a..b/c']) {
      expect(APP_UPDATE_FILE_PATH.safeParse(path).success).toBe(true);
    }
  });

  it('refuses paths that could leave the update folder', () => {
    for (const path of ['../a', 'a/../b', '..', '/etc/passwd', 'a\\b', '\\a', 'a//b', 'a/', '']) {
      expect(APP_UPDATE_FILE_PATH.safeParse(path).success, path).toBe(false);
    }
  });

  it('requires a 64 hex hash, a whole size and a dotted extension', () => {
    const good = { path: 'a', sha256: HASH, size: 0, contentType: 'x/y' };
    expect(APP_UPDATE_FILE.safeParse(good).success).toBe(true);
    expect(APP_UPDATE_FILE.safeParse({ ...good, sha256: HASH.toUpperCase() }).success).toBe(false);
    expect(APP_UPDATE_FILE.safeParse({ ...good, sha256: 'ab' }).success).toBe(false);
    expect(APP_UPDATE_FILE.safeParse({ ...good, size: -1 }).success).toBe(false);
    expect(APP_UPDATE_FILE.safeParse({ ...good, size: 1.5 }).success).toBe(false);
    expect(APP_UPDATE_FILE.safeParse({ ...good, fileExtension: 'png' }).success).toBe(false);
    expect(APP_UPDATE_FILE.safeParse({ ...good, fileExtension: '.png' }).success).toBe(true);
  });
});

describe('app update index schemas', () => {
  it('refuses unknown fields', () => {
    const extra = { ...entry(1), future: true };
    expect(APP_UPDATE_ENTRY.safeParse(extra).success).toBe(false);
    expect(APP_UPDATE_INDEX.safeParse({ entries: [extra] }).success).toBe(false);
  });

  it('refuses an entry that is missing notes or has a bad time', () => {
    const { notes: _notes, ...withoutNotes } = entry(1);
    expect(APP_UPDATE_INDEX.safeParse({ entries: [withoutNotes] }).success).toBe(false);
    expect(APP_UPDATE_ENTRY.safeParse(entry(1, { createdAt: 'yesterday' })).success).toBe(false);
  });

  it('accepts a withdrawn entry and a desktop entry without a launch file', () => {
    const desktop = desktopEntry(2, { withdrawn: WITHDRAWN });
    expect(APP_UPDATE_ENTRY.parse(desktop)).toEqual(desktop);
  });
});

describe('selecting the update to offer', () => {
  it('picks the newest by creation time, not by position', () => {
    const entries = [entry(3), entry(1), entry(2)];
    expect(latestAppUpdate(entries, TARGET)?.id).toBe(id(3));
  });

  it('skips withdrawn entries', () => {
    const entries = [entry(1), entry(2), entry(3, { withdrawn: WITHDRAWN })];
    expect(latestAppUpdate(entries, TARGET)?.id).toBe(id(2));
  });

  it('ignores other runtimes, channels and platforms', () => {
    const others = [
      entry(5, { runtimeVersion: 'r2' }),
      entry(6, { channel: 'dev' }),
      desktopEntry(7),
    ];
    expect(latestAppUpdate([...others, entry(1)], TARGET)?.id).toBe(id(1));
    expect(latestAppUpdate(others, TARGET)).toBeNull();
    expect(latestAppUpdate([], TARGET)).toBeNull();
  });

  it('reports a newer incompatible update only when it is newer than the compatible one', () => {
    const newer = entry(5, { runtimeVersion: 'r2' });
    expect(newerIncompatibleUpdate([entry(3), newer], TARGET)?.id).toBe(id(5));
    expect(newerIncompatibleUpdate([entry(6), newer], TARGET)).toBeNull();
    expect(newerIncompatibleUpdate([entry(3)], TARGET)).toBeNull();
  });

  it('reports any incompatible update when nothing compatible exists', () => {
    const old = entry(1, { runtimeVersion: 'r0' });
    const newer = entry(4, { runtimeVersion: 'r2' });
    expect(newerIncompatibleUpdate([old, newer], TARGET)?.id).toBe(id(4));
  });

  it('never reports withdrawn, other channel or other platform entries as incompatible', () => {
    const entries = [
      entry(5, { runtimeVersion: 'r2', withdrawn: WITHDRAWN }),
      entry(6, { runtimeVersion: 'r2', channel: 'dev' }),
      desktopEntry(7, { runtimeVersion: 'r2' }),
    ];
    expect(newerIncompatibleUpdate(entries, TARGET)).toBeNull();
  });

  it('rolls back to the embedded build only when the running update is withdrawn and nothing compatible is left', () => {
    const withdrawn = entry(2, { withdrawn: WITHDRAWN });
    expect(rollsBackToEmbedded([withdrawn], TARGET, id(2))).toBe(true);
    expect(rollsBackToEmbedded([entry(1), withdrawn], TARGET, id(2))).toBe(false);
    expect(rollsBackToEmbedded([entry(2)], TARGET, id(2))).toBe(false);
    expect(rollsBackToEmbedded([withdrawn], TARGET, null)).toBe(false);
    expect(rollsBackToEmbedded([withdrawn], TARGET, id(9))).toBe(false);
    expect(
      rollsBackToEmbedded([withdrawn, entry(3, { runtimeVersion: 'r2' })], TARGET, id(2)),
    ).toBe(true);
  });

  it('sizes a summary as the launch file plus every other file', () => {
    expect(appUpdateSummaryOf(entry(1))).toEqual({
      id: id(1),
      createdAt: entry(1).createdAt,
      appVersion: '1.0.0',
      notes: 'Fixes the home screen',
      size: 120,
    });
    expect(appUpdateSummaryOf(desktopEntry(1)).size).toBe(20);
    expect(appUpdateSummaryOf(desktopEntry(1, { files: [] })).size).toBe(0);
  });
});

describe('app update wire shapes', () => {
  it('parses the offer, the query and the outcome', () => {
    const summary = appUpdateSummaryOf(entry(1));
    const offer = {
      compatible: { ...summary, files: [{ ...entry(1).files[0], url: 'https://hub/x' }] },
      newerIncompatible: null,
      rollBackToEmbedded: false,
    };
    expect(APP_UPDATE_OFFER.parse(offer)).toEqual(offer);
    expect(APP_UPDATE_OFFER.safeParse({ ...offer, rollBackToEmbedded: 'no' }).success).toBe(false);
    expect(APP_UPDATE_QUERY.safeParse({ ...TARGET }).success).toBe(true);
    expect(APP_UPDATE_QUERY.safeParse({ ...TARGET, currentId: id(1) }).success).toBe(true);
    expect(APP_UPDATE_QUERY.safeParse({ ...TARGET, platform: 'ios' }).success).toBe(false);
    const outcome = {
      updateId: null,
      outcome: 'download_failed',
      reason: 'offline',
    };
    expect(APP_UPDATE_OUTCOME.parse(outcome)).toEqual(outcome);
    expect(APP_UPDATE_OUTCOME.safeParse({ ...outcome, outcome: 'done' }).success).toBe(false);
  });

  it('registers the endpoints with their access levels and unique paths', () => {
    expect(API_ENDPOINTS.readAppUpdate).toMatchObject({
      method: 'GET',
      access: 'member',
      path: '/api/app-updates/latest',
    });
    expect(API_ENDPOINTS.listAppUpdates).toMatchObject({
      method: 'GET',
      access: 'owner',
      path: '/api/app-updates',
    });
    expect(API_ENDPOINTS.reportAppUpdate).toMatchObject({
      method: 'POST',
      access: 'member',
      path: '/api/app-updates/outcomes',
    });
    expect(MEDIA_PATHS.appUpdateBlob).toBe('/media/app-updates/:sha256');
    const keys = Object.values(API_ENDPOINTS).map((found) => `${found.method} ${found.path}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('the app update notice on the live socket', () => {
  const notice = { type: 'app_update', ...TARGET, id: id(1) };

  it('parses as a live message and as its own schema', () => {
    expect(APP_UPDATE_NOTICE.parse(notice)).toEqual(notice);
    expect(LIVE_MESSAGE.parse(notice)).toEqual(notice);
  });

  it('refuses a notice without an id', () => {
    const { id: _id, ...without } = notice;
    expect(LIVE_MESSAGE.safeParse(without).success).toBe(false);
  });

  it('still parses the notices that existed before it', () => {
    const old = [
      { type: 'service_log', lines: ['a'] },
      { type: 'profile_changed', profileId: id(1) },
      {
        type: 'transcript_changed',
        source: 'phone',
        source_id: 'a',
        plugin_id: null,
        session_id: id(2),
        operation: 'insert',
      },
    ];
    for (const message of old) {
      const parsed = LIVE_MESSAGE.safeParse(message);
      expect(parsed.success, message.type).toBe(true);
    }
  });
});
