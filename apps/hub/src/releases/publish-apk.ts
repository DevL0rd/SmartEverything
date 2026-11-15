import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { copyFile, mkdir, mkdtemp, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  ANDROID_APK_ABIS,
  ANDROID_APK_INDEX,
  ANDROID_APK_INDEX_FILE,
  ANDROID_APK_RELEASE,
  APP_UPDATE_MANIFEST_PATH,
  ApiError,
  type AndroidApkRelease,
  type AndroidAppObservation,
  type AppPublicationResult,
  type PairedAndroidBuild,
} from '@smarteverything/domain';
import type { AppIdentity } from '@smarteverything/domain/app-identity';
import { Logger } from '@smarteverything/logging';
import { AndroidApkFolder } from '../app-updates/android-apk-folder';
import { withAppUpdateLock } from '../app-updates/lock';
import type { HubLayout } from '../data-layout';
import { ApkFactsError } from './apk-error';
import { readApkFacts, type ApkFacts } from './apk-facts';
import type { ReleaseStaging } from './staging';
import { ReleasePublicationRefused, readStagedRelease, stagedPath } from './staged-release';

const log = new Logger('hub.releases');

const UPDATE_URL_KEY = 'expo.modules.updates.EXPO_UPDATE_URL';
const RUNTIME_VERSION_KEY = 'expo.modules.updates.EXPO_RUNTIME_VERSION';
const CODE_SIGNING_CERTIFICATE_KEY = 'expo.modules.updates.CODE_SIGNING_CERTIFICATE';
const FINGERPRINT_PLACEHOLDER = 'file:fingerprint';

export interface ApkExpectation {
  readonly identity: AppIdentity;
  readonly versionName: string;
  readonly server: string;
  readonly versionCode?: string;
  readonly sha256?: string;
}

export interface AndroidApkPublication {
  readonly runId: string;
  readonly data: HubLayout;
  readonly clientId: string | null;
  readonly observation: AndroidAppObservation;
  readonly readObservation: () => Promise<AndroidAppObservation | null>;
  readonly apk: string;
  readonly notes: string;
  readonly expected: ApkExpectation;
  readonly now: () => Date;
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

export function normalSignerSha256(signer: string): string {
  return signer.replaceAll(':', '').toLowerCase();
}

function runtimeIsFingerprint(declared: string): boolean {
  return declared === '' || declared.startsWith('@') || declared === FINGERPRINT_PLACEHOLDER;
}

export function apkRuntimeVersion(facts: ApkFacts): string | null {
  const declared = facts.metaData[RUNTIME_VERSION_KEY];
  if (declared === undefined) return null;
  return runtimeIsFingerprint(declared) ? facts.fingerprint : declared;
}

export function apkFactProblems(
  facts: ApkFacts,
  expected: ApkExpectation,
  versionCodeAbove: number,
): readonly string[] {
  const { identity } = expected;
  const updateUrl = `${expected.server.replace(/\/$/u, '')}${APP_UPDATE_MANIFEST_PATH}`;
  const checks: readonly (readonly [boolean, string])[] = [
    [
      facts.packageName === identity.applicationId,
      `the package is ${facts.packageName}, expected ${identity.applicationId}`,
    ],
    [
      facts.signerSha256 === identity.signingCertificateSha256,
      `the APK is signed with certificate ${facts.signerSha256}, not the app's ${identity.signingCertificateSha256}, so it cannot install over the app`,
    ],
    [
      facts.versionName === expected.versionName,
      `versionName is ${facts.versionName}, expected ${expected.versionName}`,
    ],
    [
      facts.versionCode > versionCodeAbove,
      `versionCode ${String(facts.versionCode)} is not above the installed ${String(versionCodeAbove)}`,
    ],
    [
      expected.versionCode === undefined || String(facts.versionCode) === expected.versionCode,
      `versionCode ${String(facts.versionCode)} differs from the release's ${expected.versionCode ?? ''}`,
    ],
    [
      expected.sha256 === undefined || facts.sha256 === expected.sha256,
      'the APK no longer matches the signed release',
    ],
    [!facts.debuggable, 'the release APK is debuggable'],
    [!facts.includesDevLauncher, 'the release APK contains the Expo dev launcher'],
    [
      facts.metaData[UPDATE_URL_KEY] === updateUrl,
      `the update URL is ${facts.metaData[UPDATE_URL_KEY] ?? 'missing'}, expected ${updateUrl}`,
    ],
    [apkRuntimeVersion(facts) !== null, 'the APK has no runtime version'],
    [
      (facts.metaData[CODE_SIGNING_CERTIFICATE_KEY] ?? '') !== '',
      `the manifest has no ${CODE_SIGNING_CERTIFICATE_KEY}, so update signatures cannot be checked`,
    ],
  ];
  return checks.flatMap(([passed, problem]) => (passed ? [] : [problem]));
}

async function verifiedRelease(
  input: AndroidApkPublication,
  staged: string,
): Promise<AndroidApkRelease> {
  if (input.expected.identity.applicationId !== input.observation.applicationId)
    throw new AndroidApkPublicationError('The running Android app has a different app ID.');
  const facts = await readApkFacts(staged);
  const problems = apkFactProblems(facts, input.expected, Number(input.observation.versionCode));
  if (problems.length > 0) throw new AndroidApkPublicationError(problems.join('; '));
  if (input.clientId === null && facts.abis.length !== ANDROID_APK_ABIS.length)
    throw new AndroidApkPublicationError(
      'A shared Android installer must support arm64 and x86-64.',
    );
  return ANDROID_APK_RELEASE.parse({
    id: input.runId,
    clientId: input.clientId,
    build: { applicationId: facts.packageName, versionCode: String(facts.versionCode) },
    appVersion: facts.versionName,
    runtimeVersion: apkRuntimeVersion(facts),
    channel: input.observation.channel,
    abis: facts.abis,
    notes: input.notes,
    createdAt: input.now().toISOString(),
    sha256: facts.sha256,
    size: facts.size,
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

export interface ProvidedApkPublication {
  readonly layout: HubLayout;
  readonly identity: AppIdentity;
  readonly staging: Pick<ReleaseStaging, 'read' | 'releaseDirectory' | 'discard'>;
  readonly upload: string;
  readonly runId: string;
  readonly clientId: string | null;
  readonly notes: string;
  readonly server: string;
  readonly targets: () => Promise<readonly PairedAndroidBuild[]>;
  readonly now: () => Date;
}

function publishedResult(release: AndroidApkRelease): AppPublicationResult {
  return {
    status: 'published',
    runId: release.id,
    publication: {
      id: release.id,
      clientId: release.clientId,
      applicationId: release.build.applicationId,
      versionCode: release.build.versionCode,
      runtimeVersion: release.runtimeVersion,
      desktop: null,
    },
  };
}

async function recordedPublication(
  input: ProvidedApkPublication,
  folder: AndroidApkFolder,
): Promise<AndroidApkRelease | null> {
  for (const channel of ['release', 'dev'] as const) {
    const release = await folder.publicationFor(channel, input.clientId, input.runId);
    if (release !== null) {
      await folder.downloadable(release);
      return release;
    }
  }
  return null;
}

async function reference(
  input: ProvidedApkPublication,
  identity: AppIdentity,
): Promise<AndroidAppObservation> {
  const targets = (await input.targets()).filter(
    ({ clientId, observation }) =>
      observation.applicationId === identity.applicationId &&
      (input.clientId === null || clientId === input.clientId),
  );
  const [latest] = [...targets].sort(
    (left, right) => Number(right.observation.versionCode) - Number(left.observation.versionCode),
  );
  if (latest === undefined)
    throw new AndroidApkPublicationError(
      'No paired Android device has reported this app, so there is no installed version to update.',
    );
  return latest.observation;
}

interface StagedApk {
  readonly identity: AppIdentity;
  readonly named: AppIdentity;
  readonly apk: string;
  readonly versionName: string;
  readonly versionCode: string;
  readonly sha256: string;
}

async function stagedApk(input: ProvidedApkPublication): Promise<StagedApk> {
  const stage = await readStagedRelease(input.staging, input.upload, 'apk');
  const { manifest } = stage;
  if (manifest.artifact !== 'apk')
    throw new AndroidApkPublicationError('The staged release is not an APK release.');
  const [file] = manifest.files;
  if (file === undefined || manifest.files.length !== 1 || !file.path.endsWith('.apk'))
    throw new AndroidApkPublicationError('An APK release must hold exactly one .apk file.');
  return {
    identity: input.identity,
    named: {
      applicationId: manifest.facts.applicationId,
      signingCertificateSha256: normalSignerSha256(manifest.facts.signerSha256),
    },
    apk: stagedPath(stage, file.path),
    versionName: manifest.version,
    versionCode: manifest.facts.versionCode,
    sha256: file.sha256,
  };
}

function refusedReason(cause: unknown): string | null {
  if (cause instanceof AndroidApkPublicationError) return cause.message;
  if (cause instanceof ApkFactsError) return `${cause.message} (${cause.reason})`;
  if (cause instanceof ReleasePublicationRefused) return `${cause.message} (${cause.reason})`;
  if (cause instanceof ApiError && ['conflict', 'not_found'].includes(cause.code))
    return cause.message;
  return null;
}

function requireAppRelease({ identity, named }: StagedApk): void {
  if (named.applicationId !== identity.applicationId)
    throw new AndroidApkPublicationError(
      `The release is for ${named.applicationId}, not the app ${identity.applicationId}.`,
    );
  if (named.signingCertificateSha256 !== identity.signingCertificateSha256)
    throw new AndroidApkPublicationError(
      `The release names signer ${named.signingCertificateSha256}, not the app's ${identity.signingCertificateSha256}, so it cannot install over the app.`,
    );
}

async function publishStaged(input: ProvidedApkPublication): Promise<AndroidApkRelease> {
  const staged = await stagedApk(input);
  try {
    requireAppRelease(staged);
    const observation = await reference(input, staged.identity);
    return await publishAndroidApk({
      runId: input.runId,
      data: input.layout,
      clientId: input.clientId,
      observation,
      readObservation: () => reference(input, staged.identity),
      apk: staged.apk,
      notes: input.notes,
      expected: {
        identity: staged.identity,
        versionName: staged.versionName,
        versionCode: staged.versionCode,
        sha256: staged.sha256,
        server: input.server,
      },
      now: input.now,
    });
  } finally {
    await input.staging.discard(input.upload);
  }
}

export async function publishProvidedApk(
  input: ProvidedApkPublication,
): Promise<AppPublicationResult> {
  try {
    const recorded = await recordedPublication(input, new AndroidApkFolder(input.layout));
    if (recorded !== null) return publishedResult(recorded);
    const release = await publishStaged(input);
    log.info('provided_apk.published', {
      runId: input.runId,
      uploadId: input.upload,
      versionCode: release.build.versionCode,
      sha256: release.sha256,
    });
    return publishedResult(release);
  } catch (cause) {
    const reason = refusedReason(cause);
    if (reason === null) throw cause;
    log.warn('provided_apk.refused', { runId: input.runId, uploadId: input.upload, reason });
    return { status: 'refused', runId: input.runId, reason };
  }
}
