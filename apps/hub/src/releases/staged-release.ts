import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { setImmediate } from 'node:timers/promises';
import {
  ApiError,
  RELEASE_FILES_DIRECTORY,
  RELEASE_MANIFEST,
  RELEASE_MANIFEST_FILE,
  type ReleaseArtifact,
  type ReleaseFile,
  type ReleaseManifest,
  type ReleaseUpload,
} from '@smarteverything/domain';
import type { ReleaseStaging } from './staging';

const HASH_SLICE_BYTES = 1024 * 1024;

export const PUBLICATION_REFUSALS = [
  'upload_missing',
  'not_staged',
  'wrong_artifact',
  'wrong_target',
  'bad_layout',
  'file_not_listed',
  'file_changed',
  'test_requires_device',
  'client_not_applicable',
  'missing_target',
  'runtime_mismatch',
  'arches_mismatch',
  'version_mismatch',
  'version_not_newer',
  'rejected',
] as const;

export type PublicationRefusal = (typeof PUBLICATION_REFUSALS)[number];

export class ReleasePublicationRefused extends Error {
  override readonly name = 'ReleasePublicationRefused';

  constructor(
    readonly reason: PublicationRefusal,
    message: string,
  ) {
    super(message);
  }
}

export interface StagedRelease {
  readonly upload: ReleaseUpload;
  readonly manifest: ReleaseManifest;
  readonly filesDirectory: string;
}

export function refuse(reason: PublicationRefusal, message: string): never {
  throw new ReleasePublicationRefused(reason, message);
}

export async function readStagedRelease(
  staging: Pick<ReleaseStaging, 'read' | 'releaseDirectory'>,
  uploadId: string,
  artifact: ReleaseArtifact,
): Promise<StagedRelease> {
  let upload: ReleaseUpload;
  try {
    upload = await staging.read(uploadId);
  } catch (cause) {
    if (cause instanceof ApiError && cause.code === 'not_found')
      refuse('upload_missing', `No staged upload ${uploadId} exists on this Hub.`);
    throw cause;
  }
  if (upload.state !== 'staged')
    refuse('not_staged', `The upload ${uploadId} is ${upload.state}; finish it first.`);
  if (upload.artifact !== artifact)
    refuse('wrong_artifact', `The upload ${uploadId} holds a ${upload.artifact} release.`);
  const directory = staging.releaseDirectory(upload);
  const manifest = RELEASE_MANIFEST.parse(
    JSON.parse(await readFile(join(directory, RELEASE_MANIFEST_FILE), 'utf8')),
  );
  if (manifest.artifact !== artifact)
    refuse('wrong_artifact', `The staged manifest is for ${manifest.artifact}.`);
  return { upload, manifest, filesDirectory: join(directory, RELEASE_FILES_DIRECTORY) };
}

export function listedFile(stage: StagedRelease, path: string): ReleaseFile {
  const found = stage.manifest.files.find((file) => file.path === path);
  if (found === undefined) refuse('file_not_listed', `${path} is not listed in the release.`);
  return found;
}

export function stagedPath(stage: StagedRelease, path: string): string {
  return join(stage.filesDirectory, ...path.split('/'));
}

export async function readListed(stage: StagedRelease, path: string): Promise<Buffer> {
  const listed = listedFile(stage, path);
  const bytes = await readFile(stagedPath(stage, path));
  if (bytes.length !== listed.size || (await sha256Of(bytes)) !== listed.sha256)
    refuse('file_changed', `${path} no longer matches the signed release.`);
  return bytes;
}

async function sha256Of(bytes: Buffer): Promise<string> {
  const hash = createHash('sha256');
  for (let at = 0; at < bytes.length; at += HASH_SLICE_BYTES) {
    hash.update(bytes.subarray(at, at + HASH_SLICE_BYTES));
    await setImmediate();
  }
  return hash.digest('hex');
}
