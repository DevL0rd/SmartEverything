import {
  ANDROID_APK_ABIS,
  ANDROID_APK_INDEX,
  ANDROID_APK_INDEX_FILE,
  ANDROID_APK_RELEASE,
  type AndroidApkRelease,
  type AndroidAppObservation,
} from '@smarteverything/domain';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { copyFile, mkdir, mkdtemp, rename, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { AndroidApkFolder } from '../apps/hub/src/app-updates/android-apk-folder.ts';
import type { HubLayout } from '../apps/hub/src/data-layout/index.ts';
import { withAppUpdateLock } from '../apps/hub/src/app-updates/lock.ts';
import { apkProblems, readApk, readAppIdentity, runtimeVersionOf } from './release-apk.ts';
import { readReleaseVersion } from './release-version.ts';

export interface AndroidApkPublication {
  readonly runId: string;
  readonly data: HubLayout;
  readonly clientId: string | null;
  readonly observation: AndroidAppObservation;
  readonly readObservation: () => Promise<AndroidAppObservation | null>;
  readonly apk: string;
  readonly server: string;
  readonly notes: string;
}

export class AndroidApkPublicationError extends Error {
  override readonly name = 'AndroidApkPublicationError';
}

export function sameAndroidBuild(
  before: AndroidAppObservation,
  after: AndroidAppObservation | null,
): boolean {
  return (
    after !== null &&
    before.applicationId === after.applicationId &&
    before.versionCode === after.versionCode &&
    before.runtimeVersion === after.runtimeVersion &&
    before.channel === after.channel &&
    before.currentUpdateId === after.currentUpdateId
  );
}

export async function apkSha256(file: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) {
    if (!Buffer.isBuffer(chunk))
      throw new AndroidApkPublicationError('Reading the Android installer did not return bytes.');
    hash.update(chunk);
  }
  return hash.digest('hex');
}

function abisOf(file: string): AndroidApkRelease['abis'] {
  const paths = new Set(execFileSync('unzip', ['-Z1', file], { encoding: 'utf8' }).split('\n'));
  return ANDROID_APK_ABIS.filter((abi) =>
    ['libreactnative.so', 'libhermesvm.so', 'libc++_shared.so'].every((name) =>
      paths.has(`lib/${abi}/${name}`),
    ),
  );
}

async function verifiedRelease(
  input: AndroidApkPublication,
  staged: string,
): Promise<AndroidApkRelease> {
  const identity = readAppIdentity();
  if (identity.applicationId !== input.observation.applicationId)
    throw new AndroidApkPublicationError('The running Android app has a different app ID.');
  const facts = readApk(staged);
  const problems = await apkProblems(facts, {
    ...identity,
    variant: 'release',
    versionName: readReleaseVersion('app'),
    versionCodeAbove: Number(input.observation.versionCode),
    server: input.server,
  });
  if (problems.length > 0)
    throw new AndroidApkPublicationError(problems.map((problem) => problem.message).join('; '));
  const runtimeVersion = runtimeVersionOf(facts);
  if (runtimeVersion === null)
    throw new AndroidApkPublicationError('The Android installer does not have a runtime version.');
  const abis = abisOf(staged);
  if (input.clientId === null && abis.length !== ANDROID_APK_ABIS.length)
    throw new AndroidApkPublicationError(
      'A shared Android installer must support arm64 and x86-64.',
    );
  return ANDROID_APK_RELEASE.parse({
    id: input.runId,
    clientId: input.clientId,
    build: { applicationId: facts.packageName, versionCode: String(facts.versionCode) },
    appVersion: facts.versionName,
    runtimeVersion,
    channel: input.observation.channel,
    abis,
    notes: input.notes,
    createdAt: new Date().toISOString(),
    sha256: await apkSha256(staged),
    size: (await stat(staged)).size,
  });
}

async function commit(
  input: AndroidApkPublication,
  folder: AndroidApkFolder,
  pending: string,
): Promise<AndroidApkRelease> {
  const { entries } = await folder.indexFor(input.observation.channel, input.clientId);
  const recorded = entries.find((release) => release.id === input.runId);
  if (recorded !== undefined) {
    await folder.downloadable(recorded);
    return recorded;
  }
  const current = entries.at(-1);
  const staged = join(pending, 'installer.apk');
  await copyFile(input.apk, staged);
  const release = await verifiedRelease(input, staged);
  const shared =
    input.clientId === null ? null : await folder.releaseFor(input.observation.channel, null);
  const newerOffered = [current, shared].some(
    (offered) =>
      offered?.build.applicationId === release.build.applicationId &&
      Number(offered.build.versionCode) >= Number(release.build.versionCode),
  );
  if (newerOffered)
    throw new AndroidApkPublicationError('A newer or equal Android installer is already offered.');
  if (!sameAndroidBuild(input.observation, await input.readObservation()))
    throw new AndroidApkPublicationError(
      'The paired app changed while this installer was prepared.',
    );
  const manifest = join(pending, ANDROID_APK_INDEX_FILE);
  const index = ANDROID_APK_INDEX.parse({ entries: [...entries, release] });
  await writeFile(manifest, JSON.stringify(index), { mode: 0o600 });
  await rename(staged, folder.fileOf(release));
  await rename(manifest, folder.indexPath(release.channel, release.clientId));
  return release;
}

export async function publishAndroidApk(input: AndroidApkPublication): Promise<AndroidApkRelease> {
  return withAppUpdateLock(input.data.system.updates.appUpdatesLock, async () => {
    const folder = new AndroidApkFolder(input.data);
    const directory = folder.directoryFor(input.observation.channel, input.clientId);
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const pending = await mkdtemp(join(directory, '.publish-'));
    try {
      return await commit(input, folder, pending);
    } finally {
      await rm(pending, { recursive: true, force: true });
    }
  });
}
