import {
  ANDROID_APK_BASELINE,
  type AndroidApkBaseline,
  type AndroidAppObservation,
} from '@smarteverything/domain';
import { constants } from 'node:fs';
import {
  chmod,
  copyFile,
  link,
  lstat,
  mkdir,
  mkdtemp,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { join } from 'node:path';
import { AndroidApkFolder } from '../apps/hub/src/app-updates/android-apk-folder.ts';
import { AndroidApkPublicationError, apkSha256, sameAndroidBuild } from './android-apk-publish.ts';
import type { HubLayout } from '../apps/hub/src/data-layout/index.ts';
import { withAppUpdateLock } from '../apps/hub/src/app-updates/lock.ts';
import { apkProblems, readApk, readAppIdentity, runtimeVersionOf } from './release-apk.ts';

interface BaselineImport {
  readonly apk: string;
  readonly data: HubLayout;
  readonly clientId: string;
  readonly server: string;
  readonly observation: AndroidAppObservation;
  readonly readObservation: () => Promise<AndroidAppObservation | null>;
}

async function verifiedBaseline(
  input: BaselineImport,
  staged: string,
): Promise<AndroidApkBaseline> {
  const { applicationId, versionCode, runtimeVersion, channel } = input.observation;
  const identity = readAppIdentity();
  const facts = readApk(staged);
  if (
    applicationId !== identity.applicationId ||
    String(facts.versionCode) !== versionCode ||
    runtimeVersionOf(facts) !== runtimeVersion
  )
    throw new AndroidApkPublicationError('The APK does not match the paired app build.');
  const problems = await apkProblems(facts, {
    ...identity,
    variant: 'release',
    versionName: facts.versionName,
    versionCodeAbove: Number(versionCode) - 1,
    server: input.server,
  });
  if (problems.length > 0)
    throw new AndroidApkPublicationError(problems.map((problem) => problem.message).join('; '));
  return ANDROID_APK_BASELINE.parse({
    clientId: input.clientId,
    build: { applicationId, versionCode },
    runtimeVersion,
    channel,
    sha256: await apkSha256(staged),
    size: (await stat(staged)).size,
  });
}

async function installBlob(source: string, target: string, sha256: string): Promise<void> {
  try {
    await link(source, target);
  } catch (cause) {
    if (!(cause instanceof Error && 'code' in cause && cause.code === 'EEXIST')) throw cause;
    if (!(await lstat(target)).isFile() || (await apkSha256(target)) !== sha256)
      throw new AndroidApkPublicationError('The stored APK does not match its content hash.');
  }
}

async function commit(
  input: BaselineImport,
  folder: AndroidApkFolder,
  pending: string,
): Promise<AndroidApkBaseline> {
  const staged = join(pending, 'installer.apk');
  await copyFile(input.apk, staged, constants.COPYFILE_EXCL);
  const baseline = await verifiedBaseline(input, staged);
  if (!sameAndroidBuild(input.observation, await input.readObservation()))
    throw new AndroidApkPublicationError('The paired app changed while verifying this APK.');
  const recorded = await folder.baselineFor(input.clientId, input.observation);
  if (recorded !== null && recorded.sha256 !== baseline.sha256)
    throw new AndroidApkPublicationError('A different APK is already registered for this build.');
  await chmod(staged, 0o400);
  await installBlob(staged, folder.fileOf(baseline), baseline.sha256);
  if (recorded !== null) return recorded;
  const receipt = join(pending, 'baseline.json');
  await writeFile(receipt, JSON.stringify(baseline), { mode: 0o600 });
  await link(
    receipt,
    folder.baselinePath(baseline.channel, baseline.clientId, baseline.build.versionCode),
  );
  return baseline;
}

export function registerAndroidBaseline(input: BaselineImport): Promise<AndroidApkBaseline> {
  return withAppUpdateLock(input.data.system.updates.appUpdatesLock, async () => {
    const folder = new AndroidApkFolder(input.data);
    const directory = folder.directoryFor(input.observation.channel, input.clientId);
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const pending = await mkdtemp(join(directory, '.baseline-'));
    try {
      return await commit(input, folder, pending);
    } finally {
      await rm(pending, { recursive: true, force: true });
    }
  });
}

export async function baselineApk(
  folder: AndroidApkFolder,
  clientId: string,
  observation: AndroidAppObservation,
): Promise<string | null> {
  const baseline = await folder.baselineFor(clientId, observation);
  if (baseline === null) return null;
  const file = await folder.downloadable(baseline);
  if ((await apkSha256(file)) !== baseline.sha256)
    throw new AndroidApkPublicationError('The stored APK does not match its content hash.');
  return file;
}
