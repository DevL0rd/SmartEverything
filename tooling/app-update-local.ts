import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import {
  APP_UPDATE_ENTRY,
  type AppUpdateEntry,
  type AppUpdateFile,
  type AppUpdateIndex,
} from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { verifyNextOffer } from '../apps/hub/src/app-updates/candidate.ts';
import { blobSize, publishEntry, receiveBlob } from '../apps/hub/src/app-updates/store.ts';
import type { HubLayout } from '../apps/hub/src/data-layout/index.ts';
import {
  verifyAndroidCohort,
  verifyAndroidTarget,
  type AndroidReleaseTarget,
} from './app-update-candidate.ts';
import { prepareDesktop } from './publish-app-update-desktop.ts';
import { prepareAndroid } from './publish-app-update-android.ts';
import type { SourceFile } from './app-update-store.ts';
import type { Dependencies, PreparedUpdate, PublishRequest } from './publish-app-update-shared.ts';
import { readReleaseVersion } from './release-version.ts';

const log = new Logger('tool.app-update-local');

export interface LocalRequest extends Omit<PublishRequest, 'target'> {
  readonly data: HubLayout;
}

export interface LocalDependencies extends Dependencies {
  readonly now: () => Date;
  readonly newId: () => string;
}

async function writeBlob(layout: HubLayout, file: SourceFile): Promise<AppUpdateFile> {
  const hash = createHash('sha256');
  await pipeline(createReadStream(file.source), hash);
  const sha256 = hash.digest('hex');
  const size = (await stat(file.source)).size;
  if ((await blobSize(layout, sha256)) !== size) {
    await receiveBlob(layout, sha256, createReadStream(file.source));
  }
  return {
    path: file.path,
    sha256,
    size,
    contentType: file.contentType,
    ...(file.fileExtension === undefined ? {} : { fileExtension: file.fileExtension }),
  };
}

async function recordPublished(
  request: LocalRequest,
  dependencies: LocalDependencies,
  prepare: () => Promise<PreparedUpdate>,
  target?: (index: AppUpdateIndex, candidate: AppUpdateEntry) => Promise<AppUpdateEntry>,
): Promise<AppUpdateEntry> {
  const entry = await publishEntry(request.data, async (index) => {
    const content = await prepare();
    const launch = content.launch === null ? null : await writeBlob(request.data, content.launch);
    const files = [];
    for (const file of content.files) files.push(await writeBlob(request.data, file));
    const candidate = APP_UPDATE_ENTRY.parse({
      id: dependencies.newId(),
      channel: request.channel,
      createdAt: dependencies.now().toISOString(),
      appVersion: readReleaseVersion(content.platform === 'android' ? 'app' : 'desktop'),
      notes: request.notes,
      withdrawn: null,
      platform: content.platform,
      runtimeVersion: content.runtimeVersion,
      expoClient: content.expoClient,
      launch,
      files,
    });
    const offered = target === undefined ? candidate : await target(index, candidate);
    verifyNextOffer(index, offered);
    return offered;
  });
  log.info('app_update.published', {
    id: entry.id,
    platform: entry.platform,
    channel: entry.channel,
    runtimeVersion: entry.runtimeVersion,
    files: entry.files.length,
  });
  return entry;
}

type DeviceRequest = Omit<LocalRequest, 'launchFile'> & { readonly launchFile?: never };

export function publishAndroidForTarget(
  request: DeviceRequest,
  dependencies: LocalDependencies,
  readTarget: () => Promise<AndroidReleaseTarget>,
): Promise<AppUpdateEntry> {
  return recordPublished(
    request,
    dependencies,
    () => prepareAndroid(request, dependencies),
    async (index, candidate) => verifyAndroidTarget(index, candidate, await readTarget()),
  );
}

export function publishAndroidForCohort(
  request: DeviceRequest,
  dependencies: LocalDependencies,
  readCohort: () => Promise<readonly AndroidReleaseTarget[]>,
): Promise<AppUpdateEntry> {
  return recordPublished(
    request,
    dependencies,
    () => prepareAndroid(request, dependencies),
    async (index, candidate) => verifyAndroidCohort(index, candidate, await readCohort()),
  );
}

export function publishDesktopLocally(
  request: LocalRequest,
  dependencies: LocalDependencies,
): Promise<AppUpdateEntry> {
  return recordPublished(request, dependencies, () => prepareDesktop(request, dependencies));
}
