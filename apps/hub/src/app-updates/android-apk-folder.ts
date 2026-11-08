import {
  ANDROID_APK_BASELINE,
  ANDROID_APK_INDEX,
  ANDROID_APK_INDEX_FILE,
  ANDROID_APK_RELEASE,
  ANDROID_APK_SCOPE,
  APP_UPDATE_CHANNELS,
  ApiError,
  type AndroidApkIndex,
  type AndroidApkBaseline,
  type AndroidApkRelease,
  type AndroidAppObservation,
  type AppUpdateChannel,
} from '@smarteverything/domain';
import { join } from 'node:path';
import type { HubLayout } from '../data-layout';
import { readIndexFile, verifyStoredFile } from './index-file';

type ApkFile = Pick<AndroidApkRelease, 'channel' | 'clientId' | 'sha256' | 'size'>;

export interface AndroidApkScope {
  readonly channel: AppUpdateChannel;
  readonly clientId: string | null;
}

export function newestAndroidApk(
  scoped: readonly AndroidApkRelease[],
  shared: readonly AndroidApkRelease[],
): AndroidApkRelease | null {
  let newest: AndroidApkRelease | null = null;
  for (const release of [...shared, ...scoped]) {
    if (newest === null || Number(release.build.versionCode) >= Number(newest.build.versionCode))
      newest = release;
  }
  return newest;
}

export class AndroidApkFolder {
  readonly directory: string;

  constructor(layout: HubLayout) {
    this.directory = layout.system.updates.androidApks;
  }

  directoryFor(channel: AppUpdateChannel, clientId: string | null): string {
    return join(
      this.directory,
      ANDROID_APK_RELEASE.shape.channel.parse(channel),
      ANDROID_APK_SCOPE.parse(clientId ?? 'shared'),
    );
  }

  indexFileName(channel: AppUpdateChannel, clientId: string | null): string {
    const scoped = ANDROID_APK_SCOPE.parse(clientId ?? 'shared');
    return `${ANDROID_APK_RELEASE.shape.channel.parse(channel)}-${scoped}-${ANDROID_APK_INDEX_FILE}`;
  }

  scopeOfIndexFile(name: string): AndroidApkScope | null {
    const suffix = `-${ANDROID_APK_INDEX_FILE}`;
    if (!name.endsWith(suffix)) return null;
    for (const channel of APP_UPDATE_CHANNELS) {
      const prefix = `${channel}-`;
      if (!name.startsWith(prefix)) continue;
      const scope = ANDROID_APK_SCOPE.safeParse(name.slice(prefix.length, -suffix.length));
      if (scope.success) return { channel, clientId: scope.data === 'shared' ? null : scope.data };
    }
    return null;
  }

  indexPath(channel: AppUpdateChannel, clientId: string | null): string {
    return join(this.directory, this.indexFileName(channel, clientId));
  }

  async releaseFor(
    channel: AppUpdateChannel,
    clientId: string | null,
  ): Promise<AndroidApkRelease | null> {
    return newestAndroidApk((await this.indexFor(channel, clientId)).entries, []);
  }

  async publicationFor(
    channel: AppUpdateChannel,
    clientId: string | null,
    runId: string,
  ): Promise<AndroidApkRelease | null> {
    return (
      (await this.indexFor(channel, clientId)).entries.find((entry) => entry.id === runId) ?? null
    );
  }

  async releaseForBuild(
    channel: AppUpdateChannel,
    clientId: string | null,
    applicationId: string,
    versionCode: string,
  ): Promise<AndroidApkRelease | null> {
    return (
      (await this.indexFor(channel, clientId)).entries.find(
        (entry) =>
          entry.build.applicationId === applicationId && entry.build.versionCode === versionCode,
      ) ?? null
    );
  }

  async indexFor(channel: AppUpdateChannel, clientId: string | null): Promise<AndroidApkIndex> {
    const path = this.indexPath(channel, clientId);
    const index = await readIndexFile(path, ANDROID_APK_INDEX, 'an Android installer index');
    if (index === null) return { entries: [] };
    if (
      index.entries.some((release) => release.clientId !== clientId || release.channel !== channel)
    )
      throw new ApiError('internal', 'The stored Android installer belongs to a different app.');
    return index;
  }

  baselinePath(channel: AppUpdateChannel, clientId: string, versionCode: string): string {
    const version = ANDROID_APK_BASELINE.shape.build.shape.versionCode.parse(versionCode);
    const client = ANDROID_APK_BASELINE.shape.clientId.parse(clientId);
    return join(this.directoryFor(channel, client), `baseline-${version}.json`);
  }

  async baselineFor(
    clientId: string,
    observation: AndroidAppObservation,
  ): Promise<AndroidApkBaseline | null> {
    const { channel, applicationId, versionCode, runtimeVersion } = observation;
    const path = this.baselinePath(channel, clientId, versionCode);
    const baseline = await readIndexFile(path, ANDROID_APK_BASELINE, 'an Android baseline');
    if (baseline === null) return null;
    if (
      baseline.clientId !== clientId ||
      baseline.channel !== channel ||
      baseline.build.applicationId !== applicationId ||
      baseline.build.versionCode !== versionCode ||
      baseline.runtimeVersion !== runtimeVersion
    )
      throw new ApiError('internal', 'The stored Android baseline belongs to a different build.');
    return baseline;
  }

  fileOf(release: ApkFile): string {
    return join(this.directoryFor(release.channel, release.clientId), `${release.sha256}.apk`);
  }

  async downloadable(release: ApkFile): Promise<string> {
    const file = this.fileOf(release);
    await verifyStoredFile(file, 'the Android installer the index lists', release.size);
    return file;
  }
}
