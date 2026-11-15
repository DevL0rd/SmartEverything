import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { copyFile, lstat, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import {
  RELEASE_FILES_DIRECTORY,
  RELEASE_MANIFEST,
  RELEASE_MANIFEST_FILE,
  RELEASE_SIGNATURE_FILE,
  type ReleaseArtifact,
  type ReleaseFile,
  type ReleaseManifest,
} from '@smarteverything/domain';
import type { KeyObject } from 'node:crypto';
import { identityOf, signatureOf } from './provide-release-keys.ts';
import { unpackReleaseTar } from '../apps/hub/src/releases/release-tar.ts';
import { verifyRelease, type VerifiedRelease } from '../apps/hub/src/releases/verify.ts';

export class ReleaseBundleError extends Error {
  override readonly name = 'ReleaseBundleError';
}

export interface ManifestDraft {
  readonly artifact: ReleaseArtifact;
  readonly target: string;
  readonly version: string;
  readonly facts: unknown;
  readonly commit: string;
  readonly notes: string;
  readonly gate: { readonly typeCheck: 'passed'; readonly commit: string };
}

async function hashOf(path: string): Promise<string> {
  const hash = createHash('sha256');
  await pipeline(createReadStream(path), hash);
  return hash.digest('hex');
}

async function collect(folder: string, prefix: string, found: ReleaseFile[]): Promise<void> {
  const names = (await readdir(folder)).sort();
  for (const name of names) {
    const path = join(folder, name);
    const shown = prefix === '' ? name : `${prefix}/${name}`;
    const stats = await lstat(path);
    if (stats.isDirectory()) await collect(path, shown, found);
    else if (stats.isFile() && stats.nlink === 1)
      found.push({
        path: shown,
        size: stats.size,
        sha256: await hashOf(path),
        executable: (stats.mode & 0o111) !== 0,
      });
    else
      throw new ReleaseBundleError(
        `${shown} is not a plain file with one link; a release holds only plain files and folders`,
      );
  }
}

export async function listReleaseFiles(filesDirectory: string): Promise<readonly ReleaseFile[]> {
  const found: ReleaseFile[] = [];
  await collect(filesDirectory, '', found);
  return found;
}

export async function releaseManifestOf(
  draft: ManifestDraft,
  filesDirectory: string,
): Promise<ReleaseManifest> {
  const files = await listReleaseFiles(filesDirectory);
  const parsed = RELEASE_MANIFEST.safeParse({ ...draft, files });
  if (!parsed.success)
    throw new ReleaseBundleError(
      `The release manifest is not valid: ${parsed.error.issues
        .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
        .join('; ')}`,
    );
  return parsed.data;
}

export function manifestBytesOf(manifest: ReleaseManifest): Buffer {
  return Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
}

export async function writeManifest(bundle: string, manifest: ReleaseManifest): Promise<Buffer> {
  const bytes = manifestBytesOf(manifest);
  await writeFile(join(bundle, RELEASE_MANIFEST_FILE), bytes, { mode: 0o600 });
  return bytes;
}

export async function signBundle(bundle: string, key: KeyObject): Promise<string> {
  const bytes = await readFile(join(bundle, RELEASE_MANIFEST_FILE));
  await writeFile(
    join(bundle, RELEASE_SIGNATURE_FILE),
    `${JSON.stringify(signatureOf(bytes, key))}\n`,
    { mode: 0o600 },
  );
  return identityOf(key).fingerprint;
}

export async function writeTar(bundle: string, tar: string): Promise<void> {
  const signed = await stat(join(bundle, RELEASE_SIGNATURE_FILE)).then(
    () => true,
    () => false,
  );
  const present = [
    RELEASE_MANIFEST_FILE,
    ...(signed ? [RELEASE_SIGNATURE_FILE] : []),
    RELEASE_FILES_DIRECTORY,
  ];
  const result = spawnSync(
    'tar',
    [
      '--format=pax',
      '--pax-option=delete=atime,delete=ctime',
      '--sort=name',
      '--owner=0',
      '--group=0',
      '--numeric-owner',
      '-cf',
      tar,
      '-C',
      bundle,
      ...present,
    ],
    { encoding: 'utf8' },
  );
  if (result.error !== undefined || result.status !== 0)
    throw new ReleaseBundleError(
      `tar could not pack the bundle: ${result.error?.message ?? result.stderr.slice(0, 500)}`,
    );
}

export async function packedBundle(
  bundle: string,
  tar: string,
  scratch: string,
  key: KeyObject,
): Promise<VerifiedRelease> {
  await mkdir(dirname(tar), { recursive: true });
  await writeTar(bundle, tar);
  const check = join(scratch, 'self-check');
  await rm(check, { recursive: true, force: true });
  await unpackReleaseTar(tar, check);
  const identity = identityOf(key);
  try {
    return await verifyRelease(check, {
      keys: [
        {
          fingerprint: identity.fingerprint,
          publicKey: identity.publicKey,
          role: 'machine',
          label: 'this machine',
          trustedAt: new Date(0).toISOString(),
        },
      ],
      role: 'machine',
      artifact: (await manifestOf(check)).artifact,
    });
  } finally {
    await rm(check, { recursive: true, force: true });
  }
}

async function manifestOf(folder: string): Promise<ReleaseManifest> {
  return RELEASE_MANIFEST.parse(
    JSON.parse(await readFile(join(folder, RELEASE_MANIFEST_FILE), 'utf8')),
  );
}

export function tarName(manifest: ReleaseManifest): string {
  return `smarteverything-${manifest.artifact}-${manifest.target}-${manifest.version}.tar`;
}

export async function unsignedBundleOf(tar: string, into: string): Promise<ReleaseManifest> {
  await unpackReleaseTar(tar, into);
  return manifestOf(into);
}

export async function moveInto(file: string, directory: string, name: string): Promise<string> {
  await mkdir(directory, { recursive: true });
  const target = join(directory, name);
  await copyFile(file, target);
  await rm(file);
  return target;
}
