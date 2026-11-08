import { desktopPublicationId, executeUiPublication } from './self-update-app-executor.ts';
import {
  API_ENDPOINTS,
  APP_PUBLICATION_INPUT,
  PAIRED_ANDROID_BUILD,
  type AndroidAppObservation,
  type AppPublication,
  type AppPublicationInput,
  type AppUpdateEntry,
  type PairedAndroidBuild,
} from '@smarteverything/domain';
import { mkdir, mkdtemp, readdir, rm } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import { z } from 'zod';
import { AndroidApkFolder } from '../apps/hub/src/app-updates/android-apk-folder.ts';
import type { HubLayout } from '../apps/hub/src/data-layout/index.ts';
import { readIndex } from '../apps/hub/src/app-updates/store.ts';
import { baselineApk } from './android-apk-baseline.ts';
import { AndroidApkPublicationError, publishAndroidApk } from './android-apk-publish.ts';
import { readAndroidUpdateHome } from './android-update-home.ts';
import { AppUpdateCandidateError } from '../apps/hub/src/app-updates/candidate.ts';
import type { AndroidReleaseTarget } from './app-update-candidate.ts';
import {
  publishAndroidForCohort,
  publishAndroidForTarget,
  publishDesktopLocally,
} from './app-update-local.ts';
import { PublishCommandError, runCommand } from './publish-app-update-shared.ts';
import { desktopWebRuntime } from '../apps/desktop/packaging/web-runtime.ts';
import { WEB_EXPORT } from './publish-app-update-desktop.ts';
import { readAppIdentity } from './release-apk.ts';
import { dataLayoutOf } from './release-hub-files.ts';
import {
  AppPublicationRefused,
  readAppPublication,
  runAppPublication,
} from './self-update-app-job.ts';

const COMMAND = z.union([
  z.strictObject({ input: APP_PUBLICATION_INPUT, server: z.url({ protocol: /^https$/u }) }),
  z.strictObject({ runId: z.uuid() }),
]);
const now = (): Date => new Date();

interface PublicationFiles {
  readonly data: string;
  readonly layout: HubLayout;
  readonly apk: AndroidApkFolder;
}

interface Environment extends PublicationFiles {
  readonly server: string;
  readonly work: string;
  readonly root: string;
}

class AppPublicationSetupError extends Error {
  override readonly name = 'AppPublicationSetupError';
}

async function observations(
  data: string,
  clientId?: string,
): Promise<readonly PairedAndroidBuild[]> {
  const app = readAppIdentity().applicationId;
  if (clientId !== undefined) {
    const endpoint = API_ENDPOINTS.readAndroidAppBuild;
    const path = endpoint.path.replace(':clientId', clientId);
    const observation = endpoint.response.parse(await readAndroidUpdateHome(data, path));
    return observation?.applicationId === app ? [{ clientId, observation }] : [];
  }
  const reply = await readAndroidUpdateHome(data, API_ENDPOINTS.readAndroidAppBuilds.path);
  return z
    .array(PAIRED_ANDROID_BUILD)
    .parse(reply)
    .filter(({ observation }) => observation.applicationId === app);
}

async function builtApk(
  environment: Environment,
  scratch: string,
  above: AndroidAppObservation,
): Promise<string> {
  runCommand({
    title: 'build the signed Android release',
    program: process.execPath,
    args: [
      '--import',
      'tsx',
      join(environment.root, 'tooling', 'release-android.ts'),
      '--server',
      environment.server,
      '--out',
      scratch,
      '--abi',
      'universal',
      '--above',
      above.versionCode,
    ],
    cwd: environment.root,
    environment: {},
  });
  const files = (await readdir(scratch)).filter((file) => file.endsWith('.apk'));
  const [name] = files;
  if (name === undefined || files.length !== 1)
    throw new AppPublicationSetupError('The signed Android build did not produce one installer.');
  return join(scratch, name);
}

async function installedApk(
  folder: AndroidApkFolder,
  clientId: string,
  target: AndroidAppObservation,
): Promise<string | null> {
  if (target.currentUpdateId !== null) return null;
  const offered = await Promise.all([
    folder.releaseForBuild(target.channel, clientId, target.applicationId, target.versionCode),
    folder.releaseForBuild(target.channel, null, target.applicationId, target.versionCode),
  ]);
  const release = offered.find((entry) => entry?.runtimeVersion === target.runtimeVersion);
  return release === undefined || release === null
    ? baselineApk(folder, clientId, target)
    : folder.downloadable(release);
}

function highestVersion(targets: readonly PairedAndroidBuild[]): AndroidAppObservation {
  const [latest] = [...targets].sort(
    (left, right) => Number(right.observation.versionCode) - Number(left.observation.versionCode),
  );
  if (latest === undefined) throw new AppPublicationRefused('missing_target');
  return latest.observation;
}

async function publishUi(
  environment: Environment,
  input: AppPublicationInput,
  scratch: string,
  readTargets: () => Promise<readonly PairedAndroidBuild[]>,
): Promise<void> {
  const request = {
    data: environment.layout,
    server: environment.server,
    channel: input.channel,
    notes: input.notes,
  };
  const dependencies = {
    run: runCommand,
    now,
    newId: (): string => input.runId,
    exportDirectory: join(scratch, 'export'),
    webDirectory: WEB_EXPORT,
    desktopRuntime: (): Promise<string> =>
      desktopWebRuntime(join(environment.root, 'apps', 'desktop')),
  };
  const cohort = async (): Promise<readonly AndroidReleaseTarget[]> =>
    Promise.all(
      (await readTargets()).map(async (target) => ({
        ...target,
        embeddedApk: await installedApk(environment.apk, target.clientId, target.observation),
      })),
    );
  await executeUiPublication(input, {
    entries: async () => (await readIndex(environment.layout)).entries,
    android: async () => {
      await readTargets();
      if (input.clientId === undefined)
        return publishAndroidForCohort(request, dependencies, cohort);
      return publishAndroidForTarget(request, dependencies, async () => {
        const [target] = await cohort();
        if (target === undefined) throw new AppPublicationRefused('missing_target');
        return target;
      });
    },
    desktop: (id) => publishDesktopLocally(request, { ...dependencies, newId: () => id }),
  });
}

async function publish(
  environment: Environment,
  input: AppPublicationInput,
  readTargets: () => Promise<readonly PairedAndroidBuild[]>,
): Promise<void> {
  const scratch = await mkdtemp(join(environment.work, 'publication-'));
  try {
    if (input.action === 'app') {
      const reference = async (): Promise<AndroidAppObservation> =>
        highestVersion(await readTargets());
      const observation = await reference();
      const apk = await builtApk(environment, scratch, observation);
      await publishAndroidApk({
        runId: input.runId,
        data: environment.layout,
        clientId: input.clientId ?? null,
        observation,
        readObservation: reference,
        apk,
        server: environment.server,
        notes: input.notes,
      });
    } else await publishUi(environment, input, scratch, readTargets);
  } catch (error) {
    if (
      error instanceof AndroidApkPublicationError ||
      error instanceof AppUpdateCandidateError ||
      error instanceof PublishCommandError
    )
      throw new AppPublicationRefused('preflight');
    throw error;
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}

function desktopReceipt(
  entries: readonly AppUpdateEntry[],
  input: AppPublicationInput,
): AppPublication['desktop'] {
  const desktop = entries.find((entry) => entry.id === desktopPublicationId(input.runId));
  if (desktop === undefined) return null;
  if (desktop.platform !== 'desktop' || desktop.channel !== input.channel)
    throw new AppPublicationSetupError('The desktop receipt belongs to a different publication.');
  return { id: desktop.id, runtimeVersion: desktop.runtimeVersion };
}

export async function inspect(
  environment: PublicationFiles,
  input: AppPublicationInput,
): Promise<AppPublication | null> {
  if (input.action === 'app') {
    const release = await environment.apk.publicationFor(
      input.channel,
      input.clientId ?? null,
      input.runId,
    );
    if (release === null) return null;
    await environment.apk.downloadable(release);
    return {
      id: release.id,
      clientId: release.clientId,
      runtimeVersion: release.runtimeVersion,
      ...release.build,
      desktop: null,
    };
  }
  const index = await readIndex(environment.layout);
  const release = index.entries.find((entry) => entry.id === input.runId);
  if (
    release === undefined ||
    release.clientId !== input.clientId ||
    release.channel !== input.channel ||
    release.platform !== 'android'
  )
    return null;
  return {
    id: release.id,
    desktop: desktopReceipt(index.entries, input),
    clientId: release.clientId ?? null,
    runtimeVersion: release.runtimeVersion,
    applicationId: readAppIdentity().applicationId,
    versionCode: null,
  };
}

async function main(): Promise<void> {
  const data = z.string().refine(isAbsolute).parse(process.argv[2]);
  const command = COMMAND.parse(JSON.parse(z.string().parse(process.argv[3])));
  const layout = dataLayoutOf(data);
  const work = layout.system.updates.selfUpdate;
  await mkdir(work, { recursive: true, mode: 0o700 });
  const files = { data, layout, apk: new AndroidApkFolder(layout) };
  const runId = 'runId' in command ? command.runId : command.input.runId;
  const ports = {
    store: { folder: join(work, 'jobs'), now, newId: (): string => runId },
    inspect: (request: AppPublicationInput): Promise<AppPublication | null> =>
      inspect(files, request),
  };
  if ('runId' in command) {
    const publication = await readAppPublication(command.runId, ports);
    process.stdout.write(`${JSON.stringify({ publication })}\n`);
    return;
  }
  const environment = { ...files, server: command.server, work, root: process.cwd() };
  const result = await runAppPublication(command.input, {
    ...ports,
    observations: (clientId) => observations(data, clientId),
    publish: (request, readTargets) => publish(environment, request, readTargets),
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (import.meta.main) await main();
