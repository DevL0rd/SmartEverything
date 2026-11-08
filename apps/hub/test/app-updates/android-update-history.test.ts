import type {
  AndroidApkRelease,
  AndroidUpdateHistoryQuery,
  AppUpdateEntry,
  AppUpdateFile,
} from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { androidUpdateHistory as readHistory } from '../../src/app-updates/android-update-history';

type AndroidEntry = Extract<AppUpdateEntry, { readonly platform: 'android' }>;

const app = 'com.example.app';
const client = '00000000-0000-4000-8000-000000000001';
const other = '00000000-0000-4000-8000-000000000002';

function id(n: number): string {
  return `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
}

function moment(n: number): string {
  return new Date(Date.UTC(2026, 10, n)).toISOString();
}

function launchOf(n: number): AppUpdateFile {
  return {
    path: 'index.hbc',
    sha256: n.toString(16).padStart(64, '0'),
    size: 1,
    contentType: 'application/javascript',
  };
}

function ota(n: number, overrides: Partial<AndroidEntry> = {}): AndroidEntry {
  return {
    id: id(n),
    platform: 'android',
    channel: 'release',
    runtimeVersion: 'current',
    createdAt: moment(n),
    appVersion: '1.0.0',
    notes: `UI change ${String(n)}`,
    launch: launchOf(n),
    files: [],
    expoClient: { android: { package: app } },
    withdrawn: null,
    ...overrides,
  };
}

function apk(n: number, code: number, runtimeVersion: string): AndroidApkRelease {
  return {
    id: id(n),
    appVersion: '1.1.0',
    createdAt: moment(n),
    notes: `APK change ${String(n)}`,
    size: 1,
    sha256: '0'.repeat(64),
    clientId: null,
    build: { applicationId: app, versionCode: String(code) },
    runtimeVersion,
    channel: 'release',
    abis: ['arm64-v8a', 'x86_64'],
  };
}

function query(overrides: Partial<AndroidUpdateHistoryQuery>): AndroidUpdateHistoryQuery {
  return {
    applicationId: app,
    versionCode: '100',
    channel: 'release',
    runtimeVersion: 'current',
    currentId: id(4),
    offerKind: 'ota',
    offerId: id(8),
    ...overrides,
  };
}

function androidUpdateHistory(
  request: AndroidUpdateHistoryQuery,
  clientId: string,
  entries: readonly AppUpdateEntry[],
  ...installers: readonly [readonly AndroidApkRelease[], readonly AndroidApkRelease[]]
): ReturnType<typeof readHistory> {
  const [scoped, shared] = installers;
  return readHistory(request, clientId, entries, { scoped, shared });
}

describe('Android update history', () => {
  it('uses an installed withdrawn OTA as the cutoff and excludes private, other-app and withdrawn notes', () => {
    const withdrawn = { at: moment(9), reason: 'Withdrawn' };
    const desktop: AppUpdateEntry = { ...ota(11), platform: 'desktop' };
    const history = androidUpdateHistory(
      query({}),
      client,
      [
        ota(2),
        ota(4, { withdrawn }),
        ota(5, { clientId: other }),
        ota(6, { expoClient: { android: { package: 'com.other.app' } } }),
        ota(7, { clientId: client }),
        ota(8),
        ota(9, { withdrawn }),
        ota(10, { channel: 'dev' }),
        desktop,
      ],
      [],
      [],
    );
    expect(history.releases.map(({ id: release }) => release)).toEqual([id(8), id(7)]);
  });

  it('lists three skipped UI releases with the latest compatible OTA selected', () => {
    const history = androidUpdateHistory(
      query({}),
      client,
      [ota(4), ota(5), ota(6), ota(8)],
      [],
      [],
    );
    expect(history.releases.map(({ id: release }) => release)).toEqual([id(8), id(6), id(5)]);
  });

  it('lists two skipped installers without adding unrelated UI history', () => {
    const history = androidUpdateHistory(
      query({ offerKind: 'apk', offerId: id(12), currentId: undefined, embeddedAt: moment(3) }),
      client,
      [ota(2), ota(8, { runtimeVersion: 'unoffered' })],
      [],
      [apk(1, 100, 'current'), apk(5, 110, 'middle'), apk(12, 120, 'next')],
    );
    expect(history.releases.map(({ id: release }) => release)).toEqual([id(12), id(5)]);
  });

  it('shows the same one old UI, two APK, three new UI backlog for either current offer', () => {
    const rows = [
      ota(2),
      ota(4),
      ota(8, { runtimeVersion: 'unoffered' }),
      ota(13, { runtimeVersion: 'next' }),
      ota(14, { runtimeVersion: 'next', clientId: client }),
      ota(15, { runtimeVersion: 'next' }),
      ota(16, { runtimeVersion: 'middle' }),
      ota(17, { runtimeVersion: 'next', clientId: other }),
      ota(18, { runtimeVersion: 'next', withdrawn: { at: moment(19), reason: 'Withdrawn' } }),
      ota(19, { runtimeVersion: 'next', expoClient: { android: { package: 'com.other.app' } } }),
    ];
    const scoped = [{ ...apk(12, 120, 'next'), clientId: client }];
    const shared = [apk(1, 100, 'current'), apk(5, 110, 'middle')];
    const baseline = { currentId: undefined, embeddedAt: moment(3) };
    const fromApk = androidUpdateHistory(
      query({ ...baseline, offerKind: 'apk', offerId: id(12) }),
      client,
      rows,
      scoped,
      shared,
    );
    const fromOta = androidUpdateHistory(
      query({ ...baseline, offerId: id(4) }),
      client,
      rows,
      scoped,
      shared,
    );
    expect(fromOta).toEqual(fromApk);
    expect(fromApk.releases.map(({ id: release }) => release)).toEqual([
      id(15),
      id(14),
      id(13),
      id(12),
      id(5),
      id(4),
    ]);
  });

  it('does not guess OTA history when an installed update is missing from the index', () => {
    const history = androidUpdateHistory(
      query({ currentId: id(100) }),
      client,
      [ota(7), ota(8)],
      [],
      [],
    );
    expect(history.releases.map(({ id: release }) => release)).toEqual([id(8)]);
  });

  it('shows the same actionable UI anchor for both Details with an unknown installed update', () => {
    const currentId = id(100);
    const rows = [ota(4), ota(8)];
    const installers = [apk(12, 120, 'next')];
    const fromOta = androidUpdateHistory(query({ currentId }), client, rows, [], installers);
    const fromApk = androidUpdateHistory(
      query({ currentId, offerKind: 'apk', offerId: id(12) }),
      client,
      rows,
      [],
      installers,
    );
    expect(fromOta).toEqual(fromApk);
    expect(fromApk.releases.map(({ id: release }) => release)).toEqual([id(12), id(8)]);
  });

  it('lists only releases newer than the installed OTA lineage', () => {
    const history = androidUpdateHistory(
      query({}),
      client,
      [
        ota(2, { notes: 'X' }),
        ota(3, { notes: 'Private change', clientId: client }),
        ota(4, { notes: 'Y' }),
        ota(8, { notes: 'X\nY\nZ' }),
      ],
      [],
      [],
    );
    expect(history.releases.map(({ id: release }) => release)).toEqual([id(8)]);
  });

  it('uses the original publication when the running OTA was republished during rollback', () => {
    const launch = {
      path: 'index.hbc',
      sha256: 'a'.repeat(64),
      size: 1,
      contentType: 'application/javascript',
    };
    const history = androidUpdateHistory(
      query({ currentId: id(7) }),
      client,
      [ota(2, { launch }), ota(5), ota(7, { launch }), ota(8)],
      [],
      [],
    );
    expect(history.releases.map(({ id: release }) => release)).toEqual([id(8), id(5)]);
  });

  it('retains proven higher APK build notes when the embedded date is missing', () => {
    const history = androidUpdateHistory(
      query({ currentId: undefined, offerKind: 'apk', offerId: id(12) }),
      client,
      [ota(7)],
      [],
      [apk(5, 110, 'current'), apk(12, 120, 'next')],
    );
    expect(history.releases.map(({ id: release }) => release)).toEqual([id(12), id(7), id(5)]);
  });

  it('rejects obsolete offers instead of showing history for a different install target', () => {
    expect(() => androidUpdateHistory(query({}), client, [ota(8), ota(9)], [], [])).toThrow(
      'This app update is no longer available.',
    );
    expect(() =>
      androidUpdateHistory(query({ offerKind: 'apk' }), client, [], [], [apk(12, 120, 'next')]),
    ).toThrow('This Android installer is no longer available.');
  });
});
