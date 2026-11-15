import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import {
  APP_UPDATE_ENTRY,
  ApiError,
  type AppUpdateChannel,
  type AppUpdateEntry,
  type AppUpdateFile,
  type AppUpdateIndex,
  type PairedAndroidBuild,
  type ReleaseManifest,
} from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { verifyNextOffer } from '../app-updates/candidate';
import { blobSize, publishEntry, readIndex, receiveBlob } from '../app-updates/store';
import type { HubLayout } from '../data-layout';
import {
  listedFile,
  readStagedRelease,
  refuse,
  ReleasePublicationRefused,
  stagedPath,
  type PublicationRefusal,
  type StagedRelease,
} from './staged-release';
import type { ReleaseStaging } from './staging';
import {
  androidContent,
  androidPackage,
  desktopContent,
  type PreparedFile,
  type PreparedUpdate,
} from './ui-content';

const log = new Logger('hub.releases');

export interface UiPublicationInput {
  readonly runId: string;
  readonly upload: string;
  readonly notes: string;
  readonly channel: AppUpdateChannel;
  readonly clientId?: string | undefined;
}

export interface UiPublicationPorts {
  readonly layout: HubLayout;
  readonly staging: ReleaseStaging;
  readonly now: () => Date;
  readonly paired: () => readonly PairedAndroidBuild[];
}

export type UiPublicationResult =
  | {
      readonly status: 'published';
      readonly runId: string;
      readonly platform: AppUpdateEntry['platform'];
      readonly entry: {
        readonly id: string;
        readonly channel: AppUpdateChannel;
        readonly clientId: string | null;
        readonly runtimeVersion: string;
        readonly appVersion: string;
        readonly files: number;
        readonly commit: string | null;
      };
    }
  | { readonly status: 'refused'; readonly runId: string; readonly reason: string };

function cohortOf(
  ports: UiPublicationPorts,
  input: UiPublicationInput,
  manifest: Extract<ReleaseManifest, { artifact: 'ui' }>,
  applicationId: string,
): readonly PairedAndroidBuild[] {
  if (input.clientId === undefined && input.channel === 'dev')
    refuse('test_requires_device', 'The dev channel needs the clientId of one paired device.');
  const eligible = ports
    .paired()
    .filter(
      ({ clientId, observation }) =>
        observation.applicationId === applicationId &&
        observation.channel === input.channel &&
        (input.clientId === undefined || input.clientId === clientId),
    );
  if (eligible.length === 0)
    refuse(
      'missing_target',
      'No paired Android device of this app is on the requested channel and device.',
    );
  const matching = eligible.filter(
    ({ observation }) => observation.runtimeVersion === manifest.facts.runtimeVersion,
  );
  if (matching.length === 0)
    refuse(
      'runtime_mismatch',
      `No observed Android device runs the runtime ${manifest.facts.runtimeVersion}.`,
    );
  return matching;
}

async function storedBlob(
  layout: HubLayout,
  file: PreparedFile,
  stage: StagedRelease,
): Promise<AppUpdateFile> {
  const listed = listedFile(stage, file.tree);
  const source = stagedPath(stage, file.tree);
  const size = (await stat(source)).size;
  if (size !== listed.size) refuse('file_changed', `${listed.path} no longer matches the release.`);
  if ((await blobSize(layout, listed.sha256)) !== size) {
    try {
      await receiveBlob(layout, listed.sha256, createReadStream(source));
    } catch (cause) {
      if (cause instanceof ApiError)
        refuse('file_changed', `${listed.path} no longer matches the signed release.`);
      throw cause;
    }
  }
  return {
    path: file.path,
    sha256: listed.sha256,
    size,
    contentType: file.contentType,
    ...(file.fileExtension === undefined ? {} : { fileExtension: file.fileExtension }),
  };
}

function existingEntry(
  index: AppUpdateIndex,
  input: UiPublicationInput,
): AppUpdateEntry | undefined {
  return index.entries.find((entry) => entry.id === input.runId);
}

function resultOf(
  input: UiPublicationInput,
  entry: AppUpdateEntry,
  commit: string | null,
): UiPublicationResult {
  return {
    status: 'published',
    runId: input.runId,
    platform: entry.platform,
    entry: {
      id: entry.id,
      channel: entry.channel,
      clientId: entry.clientId ?? null,
      runtimeVersion: entry.runtimeVersion,
      appVersion: entry.appVersion,
      files: entry.files.length,
      commit,
    },
  };
}

interface UiRelease {
  readonly stage: StagedRelease;
  readonly manifest: Extract<ReleaseManifest, { artifact: 'ui' }>;
  readonly content: PreparedUpdate;
}

async function publishPrepared(
  ports: UiPublicationPorts,
  input: UiPublicationInput,
  { stage, manifest, content }: UiRelease,
): Promise<AppUpdateEntry> {
  const platform = manifest.target;
  if (platform === 'android') {
    if (content.expoClient === null)
      refuse('bad_layout', 'The Android release has no Expo config.');
    cohortOf(ports, input, manifest, androidPackage(content.expoClient));
  } else if (input.clientId !== undefined)
    refuse('client_not_applicable', 'A desktop UI release is not limited to one device.');
  return publishEntry(ports.layout, async (index) => {
    const launch =
      content.launch === null ? null : await storedBlob(ports.layout, content.launch, stage);
    const files: AppUpdateFile[] = [];
    for (const file of content.files) files.push(await storedBlob(ports.layout, file, stage));
    const candidate = APP_UPDATE_ENTRY.parse({
      id: input.runId,
      channel: input.channel,
      createdAt: ports.now().toISOString(),
      appVersion: manifest.version,
      notes: input.notes,
      withdrawn: null,
      platform,
      runtimeVersion: manifest.facts.runtimeVersion,
      expoClient: content.expoClient,
      launch,
      files,
      ...(platform === 'android' && input.clientId !== undefined
        ? { clientId: input.clientId }
        : {}),
    });
    try {
      verifyNextOffer(index, candidate);
    } catch (cause) {
      refuse('rejected', cause instanceof Error ? cause.message : String(cause));
    }
    return candidate;
  });
}

async function stagedOrPublished(
  ports: UiPublicationPorts,
  input: UiPublicationInput,
  published: AppUpdateEntry | undefined,
): Promise<StagedRelease | null> {
  try {
    return await readStagedRelease(ports.staging, input.upload, 'ui');
  } catch (cause) {
    if (published !== undefined && cause instanceof ReleasePublicationRefused) return null;
    throw cause;
  }
}

export async function publishStagedUi(
  ports: UiPublicationPorts,
  input: UiPublicationInput,
): Promise<UiPublicationResult> {
  try {
    const published = existingEntry(await readIndex(ports.layout), input);
    const stage = await stagedOrPublished(ports, input, published);
    if (stage === null) {
      if (published === undefined) throw new Error('A missing stage must have a published entry.');
      return resultOf(input, published, null);
    }
    const { manifest } = stage;
    if (manifest.artifact !== 'ui')
      refuse('wrong_artifact', 'The staged release is not a UI release.');
    if (published !== undefined) {
      await ports.staging.discard(stage.upload.uploadId);
      return resultOf(input, published, manifest.commit);
    }
    const content =
      manifest.target === 'android' ? await androidContent(stage) : await desktopContent(stage);
    const entry = await publishPrepared(ports, input, { stage, manifest, content });
    await ports.staging.discard(stage.upload.uploadId);
    log.info('release_ui.published', {
      runId: input.runId,
      uploadId: stage.upload.uploadId,
      id: entry.id,
      platform: entry.platform,
      channel: entry.channel,
      runtimeVersion: entry.runtimeVersion,
      commit: manifest.commit,
      files: entry.files.length,
    });
    return resultOf(input, entry, manifest.commit);
  } catch (cause) {
    const reason = refusalOf(cause);
    if (reason === null) throw cause;
    log.warn('release_ui.refused', {
      runId: input.runId,
      upload: input.upload,
      reason: reason.code,
    });
    return { status: 'refused', runId: input.runId, reason: reason.text };
  }
}

function refusalOf(cause: unknown): { code: PublicationRefusal | 'conflict'; text: string } | null {
  if (cause instanceof ReleasePublicationRefused)
    return { code: cause.reason, text: `${cause.reason}: ${cause.message}` };
  if (cause instanceof ApiError && cause.code === 'conflict')
    return { code: 'conflict', text: `rejected: ${cause.message}` };
  return null;
}
