import {
  ApiError,
  latestAppUpdate,
  type AndroidApkRelease,
  type AndroidUpdateHistory,
  type AndroidUpdateHistoryQuery,
  type AndroidUpdateHistoryRow,
  type AppUpdateEntry,
} from '@smarteverything/domain';
import { z } from 'zod';
import { offeredAndroidApk } from './android-apk-route';

const EXPO_APP_ID = z.object({ android: z.object({ package: z.string() }) });

function appIdOf(entry: AppUpdateEntry): string | null {
  const parsed = EXPO_APP_ID.safeParse(entry.expoClient);
  return parsed.success ? parsed.data.android.package : null;
}

function androidAudience(
  query: AndroidUpdateHistoryQuery,
  clientId: string,
  entry: AppUpdateEntry,
): boolean {
  return (
    entry.platform === 'android' &&
    entry.channel === query.channel &&
    (entry.clientId === undefined || entry.clientId === clientId)
  );
}

function sameOtaLineage(left: AppUpdateEntry, right: AppUpdateEntry): boolean {
  return left.clientId === right.clientId && left.runtimeVersion === right.runtimeVersion;
}

function sameOtaContents(current: AppUpdateEntry, other: AppUpdateEntry): boolean {
  if (current.launch === null || current.launch.sha256 !== other.launch?.sha256) return false;
  if (current.files.length !== other.files.length) return false;
  const files = new Map(other.files.map((file) => [file.path, file.sha256]));
  return current.files.every((file) => files.get(file.path) === file.sha256);
}

function contentDateOf(current: AppUpdateEntry, rows: readonly AppUpdateEntry[]): number {
  return rows.reduce((earliest, row) => {
    return sameOtaLineage(current, row) && sameOtaContents(current, row)
      ? Math.min(earliest, Date.parse(row.createdAt))
      : earliest;
  }, Date.parse(current.createdAt));
}

function baselineOf(
  query: AndroidUpdateHistoryQuery,
  current: AppUpdateEntry | undefined,
  rows: readonly AppUpdateEntry[],
): number | null {
  if (current !== undefined) return contentDateOf(current, rows);
  return query.currentId === undefined && query.embeddedAt !== undefined
    ? Date.parse(query.embeddedAt)
    : null;
}

function apkRange(
  query: AndroidUpdateHistoryQuery,
  target: AndroidApkRelease,
  scoped: readonly AndroidApkRelease[],
  shared: readonly AndroidApkRelease[],
): AndroidApkRelease[] {
  const releases = new Map<string, AndroidApkRelease>();
  for (const release of [...shared, ...scoped, target]) {
    const code = Number(release.build.versionCode);
    if (
      release.build.applicationId === query.applicationId &&
      code > Number(query.versionCode) &&
      code <= Number(target.build.versionCode)
    ) {
      releases.set(release.build.versionCode, release);
    }
  }
  return [...releases.values()].sort(
    (a, b) => Number(a.build.versionCode) - Number(b.build.versionCode),
  );
}

type HistorySource = Pick<AndroidUpdateHistoryRow, 'id' | 'createdAt' | 'appVersion' | 'notes'>;

function historyRow(
  kind: AndroidUpdateHistoryRow['kind'],
  row: HistorySource,
): AndroidUpdateHistoryRow {
  return {
    kind,
    id: row.id,
    createdAt: row.createdAt,
    appVersion: row.appVersion,
    notes: row.notes,
  };
}

function runtimeWindows(
  runningRuntime: string,
  installers: readonly AndroidApkRelease[],
): ReadonlyMap<string, number> {
  const [first] = installers;
  const windows = new Map([
    [runningRuntime, first === undefined ? Number.POSITIVE_INFINITY : Date.parse(first.createdAt)],
  ]);
  for (const [index, { runtimeVersion }] of installers.entries()) {
    const nextInstaller = installers[index + 1];
    const end =
      nextInstaller === undefined ? Number.POSITIVE_INFINITY : Date.parse(nextInstaller.createdAt);
    windows.set(runtimeVersion, Math.max(windows.get(runtimeVersion) ?? 0, end));
  }
  return windows;
}

function uiRange(
  entries: readonly AppUpdateEntry[],
  baseline: number | null,
  windows: ReadonlyMap<string, number>,
): AppUpdateEntry[] {
  if (baseline === null) return [];
  return entries.filter((entry) => {
    const date = Date.parse(entry.createdAt);
    const end = windows.get(entry.runtimeVersion);
    return entry.withdrawn === null && end !== undefined && date > baseline && date <= end;
  });
}

function ordered(releases: AndroidUpdateHistoryRow[]): AndroidUpdateHistoryRow[] {
  return releases.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

function actionableCurrentOta(
  query: AndroidUpdateHistoryQuery,
  clientId: string,
  audience: readonly AppUpdateEntry[],
  baseline: number | null,
): AppUpdateEntry | null {
  const release = latestAppUpdate(audience, { ...query, platform: 'android', clientId });
  if (release === null || release.id === query.currentId) return null;
  if (baseline !== null && Date.parse(release.createdAt) <= baseline) return null;
  const applicationId = appIdOf(release);
  return applicationId === null || applicationId === query.applicationId ? release : null;
}

function validateOffer(
  query: AndroidUpdateHistoryQuery,
  installer: AndroidApkRelease | null,
  currentOffer: AppUpdateEntry | null,
): void {
  if (query.offerKind === 'apk') {
    if (installer?.id !== query.offerId)
      throw new ApiError('not_found', 'This Android installer is no longer available.');
  } else if (currentOffer?.id !== query.offerId) {
    throw new ApiError('not_found', 'This app update is no longer available.');
  }
}

export interface AndroidInstallers {
  readonly scoped: readonly AndroidApkRelease[];
  readonly shared: readonly AndroidApkRelease[];
}

export function androidUpdateHistory(
  query: AndroidUpdateHistoryQuery,
  clientId: string,
  entries: readonly AppUpdateEntry[],
  installers: AndroidInstallers,
): AndroidUpdateHistory {
  const { scoped, shared } = installers;
  const audience = entries.filter((entry) => androidAudience(query, clientId, entry));
  const installer = offeredAndroidApk(query, scoped, shared);
  const rows = audience.filter((entry) => appIdOf(entry) === query.applicationId);
  const current = rows.find(
    (row) => row.id === query.currentId && row.runtimeVersion === query.runtimeVersion,
  );
  const baseline = baselineOf(query, current, rows);
  const currentOffer = actionableCurrentOta(query, clientId, audience, baseline);
  validateOffer(query, installer, currentOffer);
  const native = installer === null ? [] : apkRange(query, installer, scoped, shared);
  const windows = runtimeWindows(query.runtimeVersion, native);
  const earlier = rows.filter((entry) => entry.id !== current?.id && entry.id !== currentOffer?.id);
  const updates = uiRange(earlier, baseline, windows);
  return {
    releases: ordered([
      ...(currentOffer === null ? [] : [historyRow('ota', currentOffer)]),
      ...native.map((row) => historyRow('apk', row)),
      ...updates.map((row) => historyRow('ota', row)),
    ]),
  };
}
