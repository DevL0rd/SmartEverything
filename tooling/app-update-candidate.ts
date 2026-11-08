import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import type {
  AndroidAppObservation,
  AppUpdateEntry,
  AppUpdateFile,
  AppUpdateIndex,
} from '@smarteverything/domain';
import { z } from 'zod';
import { AppUpdateCandidateError, contentsMatch } from '../apps/hub/src/app-updates/candidate.ts';
import { readApk, readAppIdentity, runtimeVersionOf } from './release-apk.ts';

const EXPORTED_ANDROID_APP = z.object({ android: z.object({ package: z.string() }) });

export interface AndroidReleaseTarget {
  readonly clientId: string;
  readonly observation: AndroidAppObservation;
  readonly embeddedApk: string | null;
}

export async function embeddedBundleSha256(apk: string): Promise<string> {
  const archive = spawn('unzip', ['-p', apk, 'assets/index.android.bundle'], {
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  const closed = once(archive, 'close').then((values: readonly unknown[]) => values[0]);
  const hash = createHash('sha256');
  const [code] = await Promise.all([closed, collectBundle(archive.stdout, hash)]);
  if (code !== 0) throw new AppUpdateCandidateError('The signed APK has no readable app bundle.');
  return hash.digest('hex');
}

async function collectBundle(
  stream: NodeJS.ReadableStream,
  hash: ReturnType<typeof createHash>,
): Promise<void> {
  for await (const bytes of stream) hash.update(bytes);
}

async function embeddedDigest(apk: string | null, running: AndroidAppObservation): Promise<string> {
  if (apk === null) {
    throw new AppUpdateCandidateError(
      'The device is on its built-in app; provide its signed APK to compare.',
    );
  }
  const facts = readApk(apk);
  if (
    facts.packageName !== running.applicationId ||
    String(facts.versionCode) !== running.versionCode ||
    runtimeVersionOf(facts) !== running.runtimeVersion ||
    !facts.signatureVerifies ||
    facts.signerSha256 !== readAppIdentity().signingCertificateSha256 ||
    facts.debuggable ||
    facts.includesDevLauncher
  ) {
    throw new AppUpdateCandidateError(
      'The reference APK does not match the running signed Android release.',
    );
  }
  return await embeddedBundleSha256(apk);
}

function launchOf(candidate: AppUpdateEntry, applicationId: string): AppUpdateFile {
  const config = EXPORTED_ANDROID_APP.safeParse(candidate.expoClient);
  if (
    candidate.platform !== 'android' ||
    !config.success ||
    config.data.android.package !== applicationId ||
    candidate.launch === null
  ) {
    throw new AppUpdateCandidateError(
      'The export is not a bundle for the same Android application.',
    );
  }
  return candidate.launch;
}

async function contentUnchanged(
  index: AppUpdateIndex,
  candidate: AppUpdateEntry,
  launch: AppUpdateFile,
  target: AndroidReleaseTarget,
): Promise<boolean> {
  const running = target.observation;
  const id = running.currentUpdateId;
  if (id === null) {
    return launch.sha256 === (await embeddedDigest(target.embeddedApk, running));
  }
  const current = index.entries.find((entry) => entry.id === id);
  if (
    current?.platform !== 'android' ||
    current.runtimeVersion !== running.runtimeVersion ||
    (current.clientId !== undefined && current.clientId !== target.clientId)
  ) {
    throw new AppUpdateCandidateError(
      'The running Android update cannot be identified in this hub.',
    );
  }
  return contentsMatch(current, candidate);
}

function matchesRuntime(candidate: AppUpdateEntry, running: AndroidAppObservation): boolean {
  return (
    candidate.runtimeVersion === running.runtimeVersion && candidate.channel === running.channel
  );
}

export async function verifyAndroidTarget(
  index: AppUpdateIndex,
  candidate: AppUpdateEntry,
  target: AndroidReleaseTarget,
): Promise<AppUpdateEntry> {
  const applicationId = readAppIdentity().applicationId;
  const running = target.observation;
  if (running.applicationId !== applicationId || !matchesRuntime(candidate, running)) {
    throw new AppUpdateCandidateError(
      'The Android update does not match the device app, runtime and channel.',
    );
  }
  const launch = launchOf(candidate, applicationId);
  if (await contentUnchanged(index, candidate, launch, target)) {
    throw new AppUpdateCandidateError('The update is unchanged from the running Android app.');
  }
  return { ...candidate, clientId: target.clientId };
}

export async function verifyAndroidCohort(
  index: AppUpdateIndex,
  candidate: AppUpdateEntry,
  cohort: readonly AndroidReleaseTarget[],
): Promise<AppUpdateEntry> {
  const applicationId = readAppIdentity().applicationId;
  const launch = launchOf(candidate, applicationId);
  const targets = cohort.filter(
    ({ observation }) =>
      observation.applicationId === applicationId && matchesRuntime(candidate, observation),
  );
  if (targets.length === 0) {
    throw new AppUpdateCandidateError(
      'No observed Android devices match this app, runtime and channel.',
    );
  }
  const unchanged = await Promise.all(
    targets.map((target) => contentUnchanged(index, candidate, launch, target)),
  );
  if (unchanged.every((same) => same)) {
    throw new AppUpdateCandidateError(
      'The update is unchanged on every compatible Android device.',
    );
  }
  return candidate;
}
